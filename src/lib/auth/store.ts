/**
 * 用户表数据访问层（仅 Node Runtime 使用）
 *
 * 所有函数都显式接收 db（pg Pool），便于单测时注入内存版 PostgreSQL。
 */
import type { Pool } from 'pg';
import { generateId } from '@/lib/api/db';

export interface UserRow {
  id: string;
  name: string;
  phone: string;
  passwordHash: string;
  role: string;
  status: string;
  source: string;
  lastLoginAt: string;
  createdAt: string;
  updatedAt: string;
  securityQuestion: string;
  securityAnswerHash: string;
  recoveryCodeHash: string;
  mustChangePassword: boolean;
  resetFailCount: number;
  resetLockedUntil: string;
  lastResetAt: string;
  lastResetBy: string;
  teacherId: string;
}

/** 对外返回的用户信息（绝不包含密码/答案/恢复码哈希） */
export interface PublicUser {
  id: string;
  name: string;
  phone: string;
  role: string;
  status: string;
  source: string;
  lastLoginAt: string;
  createdAt: string;
  /** 是否设置了密保问题（不返回问题之外的任何答案信息） */
  hasSecurityQuestion: boolean;
  securityQuestion: string;
  mustChangePassword: boolean;
  lastResetAt: string;
  lastResetBy: string;
  /** 关联的教师档案 ID（教师管理里「开通账号」时写入） */
  teacherId: string;
}

/** 密码找回失败锁定策略 */
export const MAX_RESET_ATTEMPTS = 5;
export const RESET_LOCK_MS = 15 * 60 * 1000; // 15 分钟

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

const CREATE_RESET_LOG_TABLE = `
  CREATE TABLE IF NOT EXISTS password_reset_logs (
    id TEXT PRIMARY KEY,
    "userId" TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    action TEXT DEFAULT '',
    operator TEXT DEFAULT '',
    "createdAt" TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
  );
`;

/** 幂等建表 + 兼容旧表结构（补列） */
export async function ensureAuthSchema(db: Pool): Promise<void> {
  await db.query(CREATE_USERS_TABLE);
  for (const sql of [
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'web'`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS "securityQuestion" TEXT DEFAULT ''`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS "securityAnswerHash" TEXT DEFAULT ''`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS "recoveryCodeHash" TEXT DEFAULT ''`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN DEFAULT false`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS "resetFailCount" INTEGER DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS "resetLockedUntil" TEXT DEFAULT ''`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS "lastResetAt" TEXT DEFAULT ''`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS "lastResetBy" TEXT DEFAULT ''`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS "teacherId" TEXT DEFAULT ''`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS "lastLoginAt" TEXT DEFAULT ''`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS "updatedAt" TEXT DEFAULT ''`,
    `CREATE UNIQUE INDEX IF NOT EXISTS users_phone_key ON users (phone)`,
  ]) {
    try {
      await db.query(sql);
    } catch (e: any) {
      console.warn('[auth] 建表迁移提示:', e.message);
    }
  }
  await db.query(CREATE_RESET_LOG_TABLE);
}

function pick(row: any, camel: string, lower: string, fallback: any = '') {
  const v = row?.[camel] !== undefined ? row[camel] : row?.[lower];
  return v === undefined || v === null ? fallback : v;
}

export function toPublicUser(row: any): PublicUser {
  return {
    id: row.id,
    name: row.name || '',
    phone: row.phone || '',
    role: row.role || 'teacher',
    status: row.status || 'active',
    source: row.source || 'web',
    lastLoginAt: pick(row, 'lastLoginAt', 'lastloginat'),
    createdAt: pick(row, 'createdAt', 'createdat'),
    securityQuestion: pick(row, 'securityQuestion', 'securityquestion'),
    hasSecurityQuestion: !!pick(row, 'securityQuestion', 'securityquestion'),
    mustChangePassword: !!pick(row, 'mustChangePassword', 'mustchangepassword', false),
    lastResetAt: pick(row, 'lastResetAt', 'lastresetat'),
    lastResetBy: pick(row, 'lastResetBy', 'lastresetby'),
    teacherId: pick(row, 'teacherId', 'teacherid'),
  };
}

export function getPasswordHash(row: any): string {
  return pick(row, 'passwordHash', 'passwordhash');
}

export function getSecurityAnswerHash(row: any): string {
  return pick(row, 'securityAnswerHash', 'securityanswerhash');
}

export function getRecoveryCodeHash(row: any): string {
  return pick(row, 'recoveryCodeHash', 'recoverycodehash');
}

export async function findUserByPhone(db: Pool, phone: string): Promise<UserRow | null> {
  const r = await db.query('SELECT * FROM users WHERE phone = $1 LIMIT 1', [phone]);
  return (r.rows[0] as UserRow) || null;
}

export async function findUserById(db: Pool, id: string): Promise<UserRow | null> {
  const r = await db.query('SELECT * FROM users WHERE id = $1 LIMIT 1', [id]);
  return (r.rows[0] as UserRow) || null;
}

export async function listUsers(db: Pool, keyword = ''): Promise<any[]> {
  if (keyword) {
    const like = `%${keyword}%`;
    const r = await db.query(
      'SELECT * FROM users WHERE LOWER(name) LIKE LOWER($1) OR phone LIKE $1 ORDER BY "createdAt" DESC',
      [like]
    );
    return r.rows;
  }
  const r = await db.query('SELECT * FROM users ORDER BY "createdAt" DESC');
  return r.rows;
}

export async function insertUser(
  db: Pool,
  data: {
    name: string;
    phone: string;
    passwordHash: string;
    role: string;
    source?: string;
    securityQuestion?: string;
    securityAnswerHash?: string;
    recoveryCodeHash?: string;
  }
): Promise<UserRow> {
  const id = generateId();
  const r = await db.query(
    `INSERT INTO users (id, name, phone, "passwordHash", role, status, source,
                        "securityQuestion", "securityAnswerHash", "recoveryCodeHash",
                        "mustChangePassword", "resetFailCount", "resetLockedUntil", "lastLoginAt")
     VALUES ($1, $2, $3, $4, $5, 'active', $6, $7, $8, $9, false, 0, '', '')
     RETURNING *`,
    [
      id,
      data.name,
      data.phone,
      data.passwordHash,
      data.role,
      data.source || 'web',
      data.securityQuestion || '',
      data.securityAnswerHash || '',
      data.recoveryCodeHash || '',
    ]
  );
  return r.rows[0] as UserRow;
}

/** 修改密码（可顺带更新是否强制改密、重置人记录） */
export async function updatePassword(
  db: Pool,
  id: string,
  passwordHash: string,
  opts: { mustChangePassword?: boolean; resetBy?: string } = {}
): Promise<void> {
  const mustChange = opts.mustChangePassword === true;
  const resetBy = opts.resetBy === undefined ? null : opts.resetBy;
  if (resetBy === null) {
    await db.query(
      `UPDATE users SET "passwordHash" = $2, "mustChangePassword" = $3,
              "updatedAt" = to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
       WHERE id = $1`,
      [id, passwordHash, mustChange]
    );
  } else {
    await db.query(
      `UPDATE users SET "passwordHash" = $2, "mustChangePassword" = $3,
              "lastResetAt" = to_char(now(), 'YYYY-MM-DD HH24:MI:SS'), "lastResetBy" = $4,
              "updatedAt" = to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
       WHERE id = $1`,
      [id, passwordHash, mustChange, resetBy]
    );
  }
}

/** 重新生成恢复码 */
export async function updateRecoveryCode(db: Pool, id: string, recoveryCodeHash: string): Promise<void> {
  await db.query(`UPDATE users SET "recoveryCodeHash" = $2 WHERE id = $1`, [id, recoveryCodeHash]);
}

/** 设置/更新密保问题 */
export async function updateSecurityQuestion(
  db: Pool,
  id: string,
  question: string,
  answerHash: string
): Promise<void> {
  await db.query(
    `UPDATE users SET "securityQuestion" = $2, "securityAnswerHash" = $3,
            "updatedAt" = to_char(now(), 'YYYY-MM-DD HH24:MI:SS') WHERE id = $1`,
    [id, question, answerHash]
  );
}

export async function updateRoleAndStatus(
  db: Pool,
  id: string,
  data: { role?: string; status?: string }
): Promise<UserRow> {
  const r = await db.query(
    `UPDATE users SET role = COALESCE($2, role), status = COALESCE($3, status),
            "updatedAt" = to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
     WHERE id = $1 RETURNING *`,
    [id, data.role ?? null, data.status ?? null]
  );
  return r.rows[0] as UserRow;
}

export async function touchLastLogin(db: Pool, id: string): Promise<void> {
  await db.query(
    `UPDATE users SET "lastLoginAt" = to_char(now(), 'YYYY-MM-DD HH24:MI:SS'),
                      "updatedAt" = to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
     WHERE id = $1`,
    [id]
  );
}

/** 是否处于找回密码锁定状态 */
export function isResetLocked(row: any): boolean {
  const until = Number(pick(row, 'resetLockedUntil', 'resetlockeduntil', '') || 0);
  return until > Date.now();
}

export function resetLockRemainMinutes(row: any): number {
  const until = Number(pick(row, 'resetLockedUntil', 'resetlockeduntil', '') || 0);
  const remain = until - Date.now();
  return remain > 0 ? Math.ceil(remain / 60000) : 0;
}

/** 记录一次找回失败；达到阈值则锁定 */
export async function registerResetFailure(db: Pool, row: any): Promise<{ locked: boolean; count: number }> {
  const count = Number(pick(row, 'resetFailCount', 'resetfailcount', 0) || 0) + 1;
  const locked = count >= MAX_RESET_ATTEMPTS;
  const lockedUntil = locked ? String(Date.now() + RESET_LOCK_MS) : '';
  await db.query(
    `UPDATE users SET "resetFailCount" = $2, "resetLockedUntil" = $3 WHERE id = $1`,
    [row.id, count, lockedUntil]
  );
  return { locked, count };
}

export async function clearResetFailures(db: Pool, id: string): Promise<void> {
  await db.query(`UPDATE users SET "resetFailCount" = 0, "resetLockedUntil" = '' WHERE id = $1`, [id]);
}

/** 写入密码变更审计日志 */
export async function logPasswordReset(
  db: Pool,
  data: { userId: string; phone?: string; action: string; operator: string }
): Promise<void> {
  try {
    await db.query(
      `INSERT INTO password_reset_logs (id, "userId", phone, action, operator) VALUES ($1, $2, $3, $4, $5)`,
      [generateId(), data.userId, data.phone || '', data.action, data.operator]
    );
  } catch (e: any) {
    console.warn('[auth] 写入密码变更日志失败:', e.message);
  }
}

export async function listResetLogs(db: Pool, limit = 50): Promise<any[]> {
  const r = await db.query(
    `SELECT * FROM password_reset_logs ORDER BY "createdAt" DESC LIMIT ${Math.max(1, Math.min(limit, 200))}`
  );
  return r.rows;
}

/** 教师档案列表（只取账号管理需要的字段） */
export async function listTeachers(db: Pool): Promise<
  { id: string; name: string; phone: string; rank: string }[]
> {
  const r = await db.query('SELECT id, name, phone, rank FROM teachers ORDER BY "createdAt" DESC');
  return r.rows as any[];
}

export async function findTeacherById(db: Pool, id: string): Promise<any | null> {
  const r = await db.query('SELECT * FROM teachers WHERE id = $1 LIMIT 1', [id]);
  return (r.rows[0] as any) || null;
}

/** 按 teacherId 或手机号找登录账号（兼容教师先自行注册的情况） */
export async function findUserByTeacher(db: Pool, teacherId: string, phone: string): Promise<UserRow | null> {
  const byTeacher = await db.query('SELECT * FROM users WHERE "teacherId" = $1 LIMIT 1', [teacherId]);
  if (byTeacher.rows[0]) return byTeacher.rows[0] as UserRow;
  if (phone) {
    const byPhone = await db.query('SELECT * FROM users WHERE phone = $1 LIMIT 1', [phone]);
    if (byPhone.rows[0]) return byPhone.rows[0] as UserRow;
  }
  return null;
}

/** 把登录账号与教师档案绑定 */
export async function linkTeacher(db: Pool, userId: string, teacherId: string): Promise<void> {
  await db.query(`UPDATE users SET "teacherId" = $2 WHERE id = $1`, [userId, teacherId]);
}

export async function countUsers(db: Pool): Promise<number> {
  const r = await db.query('SELECT COUNT(*)::int AS count FROM users');
  return Number(r.rows[0]?.count || 0);
}

export type { Pool };
