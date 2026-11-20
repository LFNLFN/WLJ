import { normalizePhone } from '../auth/config';

/**
 * 咨询预约通知的固定教师名单。
 *
 * 配置（服务端环境变量）：
 *   CONSULT_NOTIFY_TEACHER_IDS=userId1,userId2
 *   CONSULT_NOTIFY_TEACHER_PHONES=13800000000,13900000000
 *
 * 两种可以只配一种；不在名单内的教师不会显示订阅授权入口，也不会收到消息。
 */

function splitEnv(name: string): string[] {
  const raw = process.env[name] || '';
  return raw
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

export function configuredNotifyIds(): string[] {
  return splitEnv('CONSULT_NOTIFY_TEACHER_IDS');
}

export function configuredNotifyPhones(): string[] {
  return splitEnv('CONSULT_NOTIFY_TEACHER_PHONES').map((p) => normalizePhone(p)).filter(Boolean);
}

/** 名单 = 显式用户 ID + 手机号匹配到的用户 ID */
export async function resolveNotifyTeacherIds(db: any): Promise<string[]> {
  const ids = configuredNotifyIds();
  const phones = configuredNotifyPhones();

  if (phones.length > 0) {
    const res = await db.query('SELECT id FROM users WHERE phone = ANY($1::text[])', [phones]);
    res.rows.forEach((row: any) => ids.push(row.id));
  }

  return Array.from(new Set(ids));
}

export async function isNotifyTeacher(db: any, userId: string): Promise<boolean> {
  if (!userId) return false;
  const ids = await resolveNotifyTeacherIds(db);
  return ids.includes(userId);
}
