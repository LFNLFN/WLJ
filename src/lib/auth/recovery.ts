/**
 * 密码自助找回所需的凭证工具（零第三方、零短信/邮件）
 *
 * 两种凭证：
 *  1. 密保问题（注册时可选设置，答案哈希存储）
 *  2. 恢复码（注册成功后一次性展示，用户自行保存，哈希存储）
 * 两者都失败时，由管理员在「用户管理」里重置密码兜底。
 */
import { randomInt } from 'node:crypto';
import { SECURITY_QUESTIONS } from './config';

/** 可选密保问题（定义在 config.ts，客户端也直接用那一份） */
export { SECURITY_QUESTIONS };

/** 恢复码字符集（去掉 0/O/1/I 等易混字符） */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 12;

/**
 * 生成恢复码，形如 XXXX-XXXX-XXXX（约 59 bit 熵，不可枚举）
 */
export function generateRecoveryCode(): string {
  let raw = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    raw += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
  }
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

/** 规范化恢复码输入：去掉分隔符、统一大写 */
export function normalizeRecoveryCode(input: unknown): string {
  return String(input == null ? '' : input)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/** 恢复码格式校验（去分隔符后应为 12 位合法字符） */
export function isValidRecoveryCodeFormat(code: string): boolean {
  if (code.length !== CODE_LENGTH) return false;
  for (const ch of code) {
    if (CODE_ALPHABET.indexOf(ch) === -1) return false;
  }
  return true;
}

/** 规范化密保答案：去空白、统一小写、去掉常见标点（避免用户多打空格/句号导致永远匹配不上） */
export function normalizeSecurityAnswer(input: unknown): string {
  return String(input == null ? '' : input)
    .trim()
    .toLowerCase()
    .replace(/[\s\u3000]+/g, '')
    .replace(/[。．.，,、！!？?；;：:'"“”‘’（）()【】\[\]]/g, '');
}

/** 密保问题合法性校验，返回错误信息；通过返回 null */
export function validateSecurityQuestion(question: unknown): string | null {
  const q = String(question == null ? '' : question).trim();
  if (!q) return null; // 允许不设置密保问题
  if (q.length < 4) return '密保问题太短（至少 4 个字）';
  if (q.length > 40) return '密保问题太长（最多 40 个字）';
  return null;
}

/** 手机号脱敏：138****0000 */
export function maskPhone(phone: string): string {
  const p = String(phone || '');
  if (p.length < 7) return p;
  return `${p.slice(0, 3)}****${p.slice(-4)}`;
}

/** 生成易读的临时密码（管理员重置时使用） */
export function generateTempPassword(): string {
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const all = lower + upper + digits;
  // 保证同时含大小写与数字，便于通过复杂度校验
  let pw = upper[randomInt(0, upper.length)] + lower[randomInt(0, lower.length)] + digits[randomInt(0, digits.length)];
  for (let i = 0; i < 5; i++) pw += all[randomInt(0, all.length)];
  // 打乱顺序
  return pw.split('').sort(() => (randomInt(0, 2) ? 1 : -1)).join('');
}
