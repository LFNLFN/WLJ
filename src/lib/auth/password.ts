/**
 * 密码哈希（仅 Node Runtime 使用）
 *
 * 使用 Node 内置 crypto.scrypt 加盐哈希，不引入 bcrypt 等外部依赖：
 *   存储格式：scrypt$<salt-hex>$<key-hex>
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { PASSWORD_MIN_LENGTH } from './config';

const scrypt = promisify(scryptCb as any) as (
  password: string,
  salt: Buffer,
  keylen: number
) => Promise<Buffer>;

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/** 生成密码哈希 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

/** 校验密码（任何异常一律视为不匹配） */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const parts = String(stored || '').split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
    const salt = Buffer.from(parts[1], 'hex');
    const expected = Buffer.from(parts[2], 'hex');
    if (!salt.length || !expected.length) return false;
    const key = await scrypt(password, salt, expected.length);
    return key.length === expected.length && timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

/** 密码强度校验，返回错误信息；通过时返回 null */
export function validatePassword(password: unknown): string | null {
  const pw = String(password == null ? '' : password);
  if (!pw) return '请输入密码';
  if (pw.length < PASSWORD_MIN_LENGTH) return `密码至少 ${PASSWORD_MIN_LENGTH} 位`;
  if (pw.length > 64) return '密码最长 64 位';
  return null;
}
