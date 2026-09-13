/**
 * 认证相关常量与配置
 *
 * 说明：本模块不依赖任何 Node 专属 API，middleware（Edge Runtime）与
 * Route Handler（Node Runtime）都可以安全导入。
 */

/** 会话 Cookie 名称 */
export const SESSION_COOKIE = 'wlj_session';

/** 会话有效期（秒）：7 天 */
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

/** 密码最短长度 */
export const PASSWORD_MIN_LENGTH = 6;

/** 可选角色（存库存英文 code，界面显示中文） */
export const USER_ROLES = ['admin', 'teacher', 'therapist'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_LABELS: Record<string, string> = {
  admin: '管理员',
  teacher: '教师',
  therapist: '治疗师',
};

/** 可选密保问题（客户端与服务端共用，不依赖任何 Node API） */
export const SECURITY_QUESTIONS = [
  '我的小学名称是？',
  '我的出生城市是？',
  '我母亲的生日是几月几日？',
  '我的第一只宠物叫什么名字？',
  '我最喜欢的老师姓什么？',
];

/** 默认角色 */
export const DEFAULT_ROLE: UserRole = 'teacher';

let warnedAboutSecret = false;

/**
 * 会话签名密钥。
 * 线上（阿里云服务器）请在服务器的环境变量里配置 AUTH_SECRET（随机长字符串），
 * 未配置时使用内置开发默认值并打印一次警告（重启后旧会话仍有效，因为没有随机化）。
 */
export function getAuthSecret(): string {
  const secret =
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.JWT_SECRET ||
    '';
  if (secret && secret.length >= 16) return secret;
  if (!warnedAboutSecret) {
    warnedAboutSecret = true;
    console.warn(
      '⚠️  未配置 AUTH_SECRET 环境变量，正在使用开发默认密钥。生产环境请务必设置 AUTH_SECRET（至少 16 位随机字符）。'
    );
  }
  return 'wlj-dev-only-secret-please-set-AUTH_SECRET';
}

/** 会话 Cookie 属性 */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_MAX_AGE,
    secure: process.env.NODE_ENV === 'production',
  };
}

/** 手机号规范化：去掉空格、横线、+86 前缀 */
export function normalizePhone(raw: unknown): string {
  return String(raw == null ? '' : raw)
    .replace(/[\s-]/g, '')
    .replace(/^\+?86/, '');
}

/** 中国大陆手机号校验（不发送短信，仅作为登录账号格式校验） */
export function isValidPhone(phone: string): boolean {
  return /^1[3-9]\d{9}$/.test(phone);
}
