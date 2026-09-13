#!/usr/bin/env node
/**
 * 管理员账号创建 / 找回工具（不依赖任何第三方收费服务）
 *
 * 用法（在项目根目录执行）：
 *   # 1) 本地开发：连接串已在 .env.local 里，脚本会自动读取，直接跑即可
 *   npm run create-admin -- --name 张三 --phone 13800000000 --password 'Wlj@2024abc'
 *
 *   # 2) 服务器上执行：用服务器的环境变量或命令行临时指定连接串
 *   DATABASE_URL='postgresql://...' node scripts/create-admin.js --name 张三 --phone 13800000000
 *
 *   # 3) 不传参 → 交互式问答（密码输入不回显）
 *   npm run create-admin
 *
 *   # 4) 该手机号已存在时，强制把它升级为管理员并重置密码
 *   npm run create-admin -- --phone 13800000000 --update
 *
 * 说明：
 *  - 密码哈希格式与 src/lib/auth/password.ts 完全一致（scrypt$salt$key，Node 内置 crypto）
 *  - 会顺带生成一个「恢复码」（只打印一次，库里只存哈希），用于登录页「忘记密码」自助重置
 *  - 幂等：手机号不存在则新建；已存在则默认只提示、不改动（除非加 --update）
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { Pool } = require('pg');

/**
 * 本地开发：自动读取项目根目录的 .env.local（Next.js 的本地开发环境变量文件）。
 * 里面的 DATABASE_URL 就是线上库连接串，所以本地直接跑脚本即可，不用每次在命令行重复写。
 * 已存在的同名环境变量优先；服务器上部署时用服务器的环境变量，不需要这个文件。
 */
function loadLocalEnvFile() {
  const file = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let value = m[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

// ==================== 与 src/lib/auth 保持一致的哈希/编码 ====================

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(SALT_LENGTH);
    crypto.scrypt(password, salt, KEY_LENGTH, (err, key) => {
      if (err) return reject(err);
      resolve(`scrypt$${salt.toString('hex')}$${key.toString('hex')}`);
    });
  });
}

function generateRecoveryCode() {
  let raw = '';
  for (let i = 0; i < 12; i++) raw += CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

function normalizeRecoveryCode(code) {
  return String(code).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 11);
}

function normalizePhone(raw) {
  return String(raw == null ? '' : raw).replace(/[\s-]/g, '').replace(/^\+?86/, '');
}

function isValidPhone(phone) {
  return /^1[3-9]\d{9}$/.test(phone);
}

function generateTempPassword() {
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const all = lower + upper + digits;
  let pw = upper[crypto.randomInt(0, upper.length)] + lower[crypto.randomInt(0, lower.length)] + digits[crypto.randomInt(0, digits.length)];
  for (let i = 0; i < 5; i++) pw += all[crypto.randomInt(0, all.length)];
  return pw.split('').sort(() => (crypto.randomInt(0, 2) ? 1 : -1)).join('');
}

// ==================== 建表（与 src/lib/auth/store.ts 一致） ====================

const CREATE_USERS_TABLE = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    "passwordHash" TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'teacher',
    status TEXT NOT NULL DEFAULT 'active',
    source TEXT DEFAULT 'web',
    "securityQuestion" TEXT DEFAULT '',
    "securityAnswerHash" TEXT DEFAULT '',
    "recoveryCodeHash" TEXT DEFAULT '',
    "mustChangePassword" BOOLEAN DEFAULT false,
    "resetFailCount" INTEGER DEFAULT 0,
    "resetLockedUntil" TEXT DEFAULT '',
    "lastResetAt" TEXT DEFAULT '',
    "lastResetBy" TEXT DEFAULT '',
    "teacherId" TEXT DEFAULT '',
    "lastLoginAt" TEXT DEFAULT '',
    "createdAt" TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS'),
    "updatedAt" TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
  );
`;

const CREATE_LOG_TABLE = `
  CREATE TABLE IF NOT EXISTS password_reset_logs (
    id TEXT PRIMARY KEY,
    "userId" TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    action TEXT DEFAULT '',
    operator TEXT DEFAULT '',
    "createdAt" TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
  );
`;

// ==================== 命令行参数 ====================

function parseArgs(argv) {
  const args = { update: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--update') args.update = true;
    else if (a === '--name') args.name = argv[++i];
    else if (a === '--phone') args.phone = argv[++i];
    else if (a === '--password') args.password = argv[++i];
    else if (a === '--role') args.role = argv[++i];
    else if (a === '--force-change') args.forceChange = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function printHelp() {
  console.log(`
管理员账号创建工具

用法：
  # 本地开发（自动读取 .env.local 里的 DATABASE_URL）
  npm run create-admin -- --name 张三 --phone 13800000000 [--password xxx]

  # 阿里云服务器上（用服务器的环境变量）
  DATABASE_URL='postgresql://...' node scripts/create-admin.js --name 张三 --phone 13800000000

参数：
  --name <姓名>        管理员姓名
  --phone <手机号>      登录手机号（11 位，必须唯一）
  --password <密码>     不传则自动生成一个随机密码
  --role <角色>         admin（默认）| teacher | therapist
  --update             该手机号已存在时：重置密码 + 提升为管理员 + 启用账号
  --force-change       要求该账号首次登录后立即修改密码
  -h, --help           显示帮助

环境变量：
  DATABASE_URL         线上 PostgreSQL 连接串（阿里云服务器上的库）
                       本地开发会自动从 .env.local 读取，不用手动指定
                       也可以用 POSTGRES_URL，或用环境变量覆盖 .env.local 的值
`);
}

async function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); }));
}

/** 不回显的密码输入 */
async function promptHidden(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  return new Promise((resolve) => {
    const originalWrite = rl._writeToOutput;
    rl._writeToOutput = function (str) {
      // 只回显提示语和换行，不把密码打到屏幕上
      if (str.includes(question)) return originalWrite.call(rl, str);
      if (str === '\r\n' || str === '\n') return originalWrite.call(rl, '\n');
    };
    rl.question(question, (answer) => {
      rl._writeToOutput = originalWrite;
      rl.close();
      resolve(String(answer).trim());
    });
  });
}

// ==================== 主流程 ====================

(async () => {
  // 本地开发：先把 .env.local 里的 DATABASE_URL 读进来（命令行/服务器环境变量优先）
  loadLocalEnvFile();
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return printHelp();

  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

  if (!connectionString) {
    console.error('❌ 缺少 DATABASE_URL 环境变量（线上 PostgreSQL 连接串）。\n   例：DATABASE_URL=\'postgres://user:pass@host:5432/db\' node scripts/create-admin.js --help');
    process.exit(1);
  }

  const sslMode = (process.env.PGSSLMODE || '').toLowerCase();
  const useSsl = sslMode === 'disable' ? false : /localhost|127\.0\.0\.1/.test(connectionString) ? false : { rejectUnauthorized: false };

  const interactive = !args.name || !args.phone;
  if (interactive) {
    console.log('\n未提供完整参数，进入交互式问答（回车确认）\n');
    if (!args.name) args.name = await prompt('管理员姓名：');
    if (!args.phone) args.phone = await prompt('登录手机号（11 位）：');
  }

  const name = String(args.name || '').trim();
  const phone = normalizePhone(args.phone);

  if (!name) {
    console.error('❌ 姓名为空');
    process.exit(1);
  }
  if (!isValidPhone(phone)) {
    console.error(`❌ 手机号格式不正确：${args.phone}（需要 11 位中国大陆手机号）`);
    process.exit(1);
  }

  let password = args.password ? String(args.password) : '';
  if (!password) {
    if (interactive && process.stdin.isTTY) {
      password = await promptHidden('密码（直接回车则自动生成，输入不回显）：');
    }
    if (!password) {
      password = generateTempPassword();
      args.forceChange = args.forceChange !== false ? true : args.forceChange;
      console.log('ℹ️  未指定密码，已自动生成随机密码（并设置为首次登录必须修改）');
    }
  }
  if (password.length < 6) {
    console.error('❌ 密码至少 6 位');
    process.exit(1);
  }

  const role = ['admin', 'teacher', 'therapist'].includes(String(args.role || 'admin'))
    ? String(args.role || 'admin')
    : 'admin';

  const pool = new Pool({ connectionString, ssl: useSsl });
  const client = { query: (text, params) => pool.query(text, params) };

  try {
    await pool.query('SELECT 1');
    console.log('✅ 数据库连接成功');

    await pool.query(CREATE_USERS_TABLE);
    await pool.query(CREATE_LOG_TABLE);

    const passwordHash = await hashPassword(password);
    const recoveryCode = generateRecoveryCode();
    const recoveryCodeHash = await hashPassword(normalizeRecoveryCode(recoveryCode));
    const mustChange = !!args.forceChange;

    const existing = await pool.query('SELECT * FROM users WHERE phone = $1 LIMIT 1', [phone]);

    if (existing.rows[0] && !args.update) {
      const u = existing.rows[0];
      console.log(`\n⚠️  该手机号已存在账号，未做任何修改：`);
      console.log(`   姓名: ${u.name}`);
      console.log(`   角色: ${u.role}（状态：${u.status}）`);
      console.log(`   如需重置为管理员密码，请追加 --update 参数重跑。\n`);
      await pool.end();
      process.exit(0);
    }

    if (existing.rows[0]) {
      const u = existing.rows[0];
      await pool.query(
        `UPDATE users SET name = $2, "passwordHash" = $3, role = $4, status = 'active',
                "recoveryCodeHash" = $5, "mustChangePassword" = $6,
                "resetFailCount" = 0, "resetLockedUntil" = '',
                "lastResetAt" = to_char(now(), 'YYYY-MM-DD HH24:MI:SS'), "lastResetBy" = 'cli',
                "updatedAt" = to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
         WHERE id = $1`,
        [u.id, name, passwordHash, role, recoveryCodeHash, mustChange]
      );
      await pool.query(
        `INSERT INTO password_reset_logs (id, "userId", phone, action, operator) VALUES ($1, $2, $3, $4, $5)`,
        [generateId(), u.id, phone, 'cli_update_admin', 'cli']
      );
      console.log(`\n✅ 已更新账号（原 ID ${u.id}）`);
    } else {
      const id = generateId();
      await pool.query(
        `INSERT INTO users (id, name, phone, "passwordHash", role, status, source,
                            "recoveryCodeHash", "mustChangePassword",
                            "resetFailCount", "resetLockedUntil", "lastLoginAt")
         VALUES ($1, $2, $3, $4, $5, 'active', 'cli', $6, $7, 0, '', '')`,
        [id, name, phone, passwordHash, role, recoveryCodeHash, mustChange]
      );
      await pool.query(
        `INSERT INTO password_reset_logs (id, "userId", phone, action, operator) VALUES ($1, $2, $3, $4, $5)`,
        [generateId(), id, phone, 'cli_create_admin', 'cli']
      );
      console.log(`\n✅ 管理员账号已创建（ID ${id}）`);
    }

    console.log('──────────────────────────────────────────────');
    console.log(`   姓名    : ${name}`);
    console.log(`   手机号  : ${phone}`);
    console.log(`   角色    : ${role}`);
    console.log(`   密码    : ${password}${mustChange ? '   （首次登录后必须修改）' : ''}`);
    console.log(`   恢复码  : ${recoveryCode}   （忘记密码时在登录页「忘记密码」中使用）`);
    console.log('──────────────────────────────────────────────');
    console.log('⚠️  密码与恢复码只显示这一次，请立即保存；打开系统首页即可用手机号 + 密码登录。\n');

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('❌ 执行失败:', err.message);
    try { await pool.end(); } catch (e) { /* ignore */ }
    process.exit(1);
  }
})();
