#!/usr/bin/env node
/**
 * 把历史评估记录挂到学生档案上（小程序 → PC 学生管理 联动的补数据）
 *
 * 背景：
 *   小程序提交评估报告时，服务端会自动「按姓名找学生，没有就新建」并把报告
 *   挂到 students.id（写入 student_scale_records."studentId"）。
 *   这个脚本用于**历史上还没有 studentId 的报告**：一次性补齐关联。
 *
 * 用法：
 *   node scripts/link-scale-records-to-students.js            # 只体检，不改数据
 *   node scripts/link-scale-records-to-students.js --apply    # 真正写入（新建学生 + 关联报告）
 *
 * 匹配规则与 src/lib/api/scale-records.ts 的 ensureStudentForReport 保持一致：
 *   1. 同名 + 同设备号 → 同一个孩子
 *   2. 同名 + 后台手工建的学生（没有设备号）→ 认领并补上设备号
 *   3. 同名但已绑定别的设备 → 新建，避免把两个孩子的报告混在一起
 * 姓名为空 / 「未知」的报告不建档（保持原样）。
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const PLACEHOLDER_NAMES = ['', '未知', '未填写', '匿名', '无'];

function loadEnvLocal() {
  const file = path.join(PROJECT_ROOT, '.env.local');
  const env = {};
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (!m) continue;
    env[m[1]] = m[2].trim().replace(/^"|"$/g, '');
  }
  return env;
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

/**
 * @param {object} opts
 * @param {boolean} opts.dryRun true 时只做判断、**不写库**（体检模式）
 */
async function ensureStudentForReport(db, { name, userid, age }, opts = {}) {
  const dryRun = !!opts.dryRun;
  const cleanName = String(name == null ? '' : name).trim();
  if (PLACEHOLDER_NAMES.includes(cleanName)) return { skipped: true };

  const deviceId = String(userid == null ? '' : userid).trim();
  const studentAge = Number(age) || 0;

  const { rows } = await db.query(
    `SELECT id, name, COALESCE(userid, '') AS userid
       FROM students
      WHERE lower(btrim(name)) = lower($1)
      ORDER BY "createdAt" ASC`,
    [cleanName]
  );

  const sameDevice = rows.find((r) => deviceId && r.userid === deviceId);
  if (sameDevice) {
    return { studentId: sameDevice.id, studentName: sameDevice.name, created: false, matchedBy: 'userid' };
  }

  const unbound = rows.find((r) => !r.userid);
  if (unbound) {
    if (deviceId && !dryRun) await db.query('UPDATE students SET userid = $1 WHERE id = $2', [deviceId, unbound.id]);
    return { studentId: unbound.id, studentName: unbound.name, created: false, matchedBy: 'name' };
  }

  const id = generateId();
  if (!dryRun) {
    await db.query(
      `INSERT INTO students (id, name, "parentName", "parentPhone", "birthDate", age, userid)
       VALUES ($1, $2, '', '', '', $3, $4)`,
      [id, cleanName, studentAge, deviceId]
    );
  }
  return { studentId: dryRun ? '(将新建)' : id, studentName: cleanName, created: true, matchedBy: 'created' };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const envFile = loadEnvLocal();
  const connectionString =
    process.env.DATABASE_URL || envFile.DATABASE_URL || envFile.POSTGRES_URL;
  if (!connectionString) {
    console.error('缺少 DATABASE_URL（环境变量或 .env.local）');
    process.exit(1);
  }

  const { Client } = require('pg');
  const client = new Client({ connectionString });
  await client.connect();

  try {
    // 补齐列（幂等；体检模式也不写库，只提示）
    if (apply) {
      await client.query(`ALTER TABLE student_scale_records ADD COLUMN IF NOT EXISTS "studentId" TEXT DEFAULT ''`);
      await client.query(`ALTER TABLE student_scale_records ADD COLUMN IF NOT EXISTS "studentName" TEXT DEFAULT ''`);
      await client.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS userid TEXT DEFAULT ''`);
    }

    const total = await client.query('SELECT COUNT(*)::int n FROM student_scale_records');
    const unlinked = await client.query(`
      SELECT id, COALESCE(NULLIF(btrim(studentname), ''), "studentName", '') AS name,
             COALESCE(userid, '') AS userid, COALESCE(age, 0) AS age, scalename, createdat
        FROM student_scale_records
       WHERE COALESCE("studentId", '') = ''
       ORDER BY createdat ASC
    `);

    console.log('=== 评估记录 → 学生档案 关联体检 ===');
    console.log(`评估记录总数        : ${total.rows[0].n}`);
    console.log(`尚未关联学生的记录  : ${unlinked.rows.length}`);

    const stats = { linked: 0, created: 0, skipped: 0 };
    const createdNames = [];
    const byName = {};

    for (const rec of unlinked.rows) {
      const result = await ensureStudentForReport(client, {
        name: rec.name,
        userid: rec.userid,
        age: rec.age,
      }, { dryRun: !apply });
      if (result.skipped) {
        stats.skipped++;
        console.log(`  - 跳过（没有姓名）: ${rec.id} (${rec.scalename || '未知量表'})`);
        continue;
      }
      stats.linked++;
      if (result.created) {
        stats.created++;
        createdNames.push(result.studentName);
      }
      byName[result.studentName] = (byName[result.studentName] || 0) + 1;

      if (apply) {
        await client.query(
          `UPDATE student_scale_records SET "studentId" = $1, "studentName" = $2 WHERE id = $3`,
          [result.studentId, result.studentName, rec.id]
        );
      }
    }

    console.log('\n按姓名汇总（会挂到哪个学生）：');
    Object.entries(byName).forEach(([name, n]) => console.log(`  ${name}: ${n} 份报告`));
    console.log('\n汇总：');
    console.log(`  可关联报告      : ${stats.linked}`);
    console.log(`  需新建学生档案  : ${stats.created}${createdNames.length ? ' → ' + [...new Set(createdNames)].join('、') : ''}`);
    console.log(`  跳过（无姓名）  : ${stats.skipped}`);

    if (!apply) {
      console.log('\n未做任何修改。确认无误后执行：node scripts/link-scale-records-to-students.js --apply');
    } else {
      const left = await client.query(`SELECT COUNT(*)::int n FROM student_scale_records WHERE COALESCE("studentId", '') = ''`);
      console.log(`\n✅ 已写入关联；剩余未关联记录：${left.rows[0].n}（无姓名的会一直留着）`);
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error('执行失败:', e.message);
  process.exit(1);
});
