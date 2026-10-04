/**
 * 数据库连接被重置时的「服务是否会被搞死」测试。
 *
 * 背景（线上真实故障）：
 *   登录接口返回 500 {"error":"read ECONNRESET"}，同时 wlj 服务被 pm2 重启了 704 次。
 *   根因是 pg 连接池没有监听 'error' 事件：
 *     - 空闲连接被重置 → pool.emit('error') → 没有监听器 → 未捕获异常 → 进程退出；
 *     - pg-pool 把 client 交出去做查询时会摘掉它自己的 idle listener，
 *       所以「查询进行中连接被重置」= client.emit('error') → 一样让进程退出。
 *   于是「数据库抖一下 → 用户看到 500 → 服务重启一次」。
 *
 * 本脚本用真实数据库（只掐自己这条连接，不碰其它会话）分别跑：
 *   1) broken：复刻旧配置（没有任何 error 监听）→ 进程必须「死」（证明故障机理）；
 *   2) fixed ：用现在的 getDb()（pool.on('error') + pool.on('connect') 双保险）
 *              → 进程必须活下来，并且连接池能自动恢复继续服务。
 *
 * 运行：npm run test:db-resilience
 */

import path from 'path';
import fs from 'fs';
import { spawnSync } from 'child_process';
import { getDb, isTransientDbError, withDbRetry } from '../src/lib/api/db';

// --- 载入 .env.local（不覆盖已存在的环境变量）---
function loadEnvLocal() {
  const file = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnvLocal();

/** 掐断某个 client 的 TCP 连接（等价于数据库/中间设备把连接重置） */
function destroySocket(client: any) {
  // 尽量还原 Node 真实的 ECONNRESET：有 code / syscall，message 是「read ECONNRESET」
  const err: any = new Error('read ECONNRESET');
  err.code = 'ECONNRESET';
  err.syscall = 'read';
  client.connection.stream.destroy(err);
}

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  ✗ ${name}${detail !== undefined ? ` -> ${JSON.stringify(detail)}` : ''}`);
  }
}

// ==================== 子进程场景 ====================

async function childBroken() {
  // 复刻「修复前」的连接池：参数一样，但没有 pool.on('error') / client.on('error')
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
    application_name: 'wlj-test-db-resilience',
  });

  const client = await pool.connect();
  console.log('BROKEN_CONNECTED');
  const query = client.query('select pg_sleep(2)').then(
    () => null,
    (e: any) => e
  );
  setTimeout(() => destroySocket(client), 200);
  const err = await query;
  console.log(`BROKEN_QUERY_ERR ${err?.code} ${err?.message}`);
  await new Promise((r) => setTimeout(r, 300)); // 给未捕获异常一点时间炸出来
  console.log('BROKEN_SURVIVED');
  await pool.end();
  process.exit(0);
}

async function childFixed() {
  const pool = await getDb();
  const client = await pool.connect();
  console.log('FIXED_CONNECTED');

  const query = client.query('select pg_sleep(2)').then(
    () => null,
    (e: any) => e
  );
  setTimeout(() => destroySocket(client), 200);

  const err = await query;
  console.log(`FIXED_QUERY_ERR ${err?.code} ${err?.message}`);
  client.release(err);

  // 关键：进程还活着，而且连接池能自己恢复，下一个请求正常
  await new Promise((r) => setTimeout(r, 300));
  const after = await pool.query('select 1 as ok');
  console.log(`FIXED_RECOVERED ${after.rows[0].ok}`);
  console.log('FIXED_SURVIVED');
  await pool.end();
  process.exit(0);
}

// ==================== 主流程 ====================

function runChild(scenario: 'broken' | 'fixed') {
  const res = spawnSync(process.execPath, [__filename, scenario], {
    encoding: 'utf8',
    env: { ...process.env, PG_APP_NAME: 'wlj-test-db-resilience' },
    timeout: 60000,
  });
  return { status: res.status, stdout: res.stdout || '', stderr: res.stderr || '', signal: res.signal };
}

async function unitTests() {
  console.log('\n== 1. 瞬时错误识别 ==');
  check('ECONNRESET 算瞬时错误', isTransientDbError({ code: 'ECONNRESET' }));
  check('57P03（数据库正在启动）算瞬时错误', isTransientDbError({ code: '57P03' }));
  check('Connection terminated unexpectedly 算瞬时错误', isTransientDbError({ code: 'XX000', message: 'Connection terminated unexpectedly' }));
  check('唯一键冲突（23505）不算瞬时错误', !isTransientDbError({ code: '23505', message: 'duplicate key value' }));
  check('空值不算瞬时错误', !isTransientDbError(null));

  console.log('\n== 2. withDbRetry 行为 ==');
  let calls = 0;
  const ok1 = await withDbRetry(async () => {
    calls++;
    if (calls === 1) throw Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });
    return 'recovered';
  });
  check('瞬时错误会重试一次并成功', ok1 === 'recovered' && calls === 2, { ok1, calls });

  let nonTransientCalls = 0;
  let nonTransientErr: any = null;
  try {
    await withDbRetry(async () => {
      nonTransientCalls++;
      throw Object.assign(new Error('duplicate key'), { code: '23505' });
    });
  } catch (e) {
    nonTransientErr = e;
  }
  check('业务错误不重试，直接抛出', nonTransientCalls === 1 && nonTransientErr?.code === '23505', nonTransientCalls);

  let alwaysCalls = 0;
  try {
    await withDbRetry(async () => {
      alwaysCalls++;
      throw Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });
    }, 2);
  } catch {
    /* 预期抛出 */
  }
  check('一直失败时最多重试到上限（共 2 次）', alwaysCalls === 2, alwaysCalls);
}

async function connectionResetScenarios() {
  console.log('\n== 3. 连接被重置：修复前 vs 修复后（真实数据库，只掐自己这条连接）==');

  const broken = runChild('broken');
  check(
    '修复前：连接被重置会让进程直接退出（这就是 pm2 重启 704 次的机理）',
    broken.status !== 0 && !broken.stdout.includes('BROKEN_SURVIVED'),
    { status: broken.status, signal: broken.signal, stderrTail: broken.stderr.split('\n').slice(-4).join(' | ') }
  );

  const fixed = runChild('fixed');
  const dbUnreachable = !fixed.stdout.includes('FIXED_CONNECTED') && /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET/.test(fixed.stdout + fixed.stderr);
  if (dbUnreachable) {
    console.log('  ⚠️ 当前网络连不上数据库，跳过「进程存活」场景（单元断言仍有效）');
    return;
  }
  check('修复后：连接被重置，进程存活', fixed.status === 0 && fixed.stdout.includes('FIXED_SURVIVED'), {
    status: fixed.status,
    stdoutTail: fixed.stdout.split('\n').slice(-4).join(' | '),
    stderrTail: fixed.stderr.split('\n').slice(-4).join(' | '),
  });
  check('修复后：查询被中断时上层能收到可识别的瞬时错误', /FIXED_QUERY_ERR\s+ECONNRESET/.test(fixed.stdout), fixed.stdout.split('\n').slice(-6));
  check('修复后：连接池自动恢复，后续查询正常', /FIXED_RECOVERED\s+1/.test(fixed.stdout), fixed.stdout.split('\n').slice(-6));
}

async function main() {
  const scenario = process.argv[2];
  if (scenario === 'broken') return childBroken();
  if (scenario === 'fixed') return childFixed();

  await unitTests();
  await connectionResetScenarios();

  console.log('\n----------------------------------------');
  console.log(`通过 ${passed}，失败 ${failed}`);
  if (failed > 0) {
    console.log('失败项：', failures.join('、'));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('测试脚本异常：', e);
  process.exit(1);
});
