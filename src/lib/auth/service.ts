/**
 * 注册 / 登录 / 密码找回 / 管理员重置 业务逻辑（与 HTTP 层解耦，便于单测）
 */
import type { Pool } from 'pg';
import {
  DEFAULT_ROLE,
  USER_ROLES,
  isValidPhone,
  normalizePhone,
  type UserRole,
} from './config';
import { hashPassword, validatePassword, verifyPassword } from './password';
import {
  generateRecoveryCode,
  generateTempPassword,
  isValidRecoveryCodeFormat,
  maskPhone,
  normalizeRecoveryCode,
  normalizeSecurityAnswer,
  validateSecurityQuestion,
} from './recovery';
import {
  RESET_LOCK_MS,
  clearResetFailures,
  countUsers,
  findUserByPhone,
  findUserById,
  getPasswordHash,
  getRecoveryCodeHash,
  getSecurityAnswerHash,
  insertUser,
  isResetLocked,
  listUsers,
  logPasswordReset,
  registerResetFailure,
  resetLockRemainMinutes,
  toPublicUser,
  touchLastLogin,
  updatePassword,
  updateRecoveryCode,
  updateRoleAndStatus,
  updateSecurityQuestion,
  type PublicUser,
} from './store';

export interface RegisterPayload {
  name?: unknown;
  phone?: unknown;
  password?: unknown;
  confirmPassword?: unknown;
  role?: unknown;
  securityQuestion?: unknown;
  securityAnswer?: unknown;
  registerCode?: unknown;
}

export interface LoginPayload {
  phone?: unknown;
  password?: unknown;
}

export type Result<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

function asString(v: unknown): string {
  return String(v == null ? '' : v).trim();
}

function parseRole(v: unknown): UserRole {
  const role = asString(v) as UserRole;
  return (USER_ROLES as readonly string[]).includes(role) ? role : DEFAULT_ROLE;
}

/** 注册参数校验（纯格式校验，不查库） */
export function validateRegisterInput(
  payload: RegisterPayload
): Result<{ name: string; phone: string; password: string; role: UserRole; securityQuestion: string; securityAnswer: string }> {
  const name = asString(payload.name);
  const phone = normalizePhone(payload.phone);
  const password = String(payload.password == null ? '' : payload.password);

  if (!name) return { ok: false, status: 400, error: '请输入姓名' };
  if (name.length > 20) return { ok: false, status: 400, error: '姓名最长 20 个字' };
  if (!phone) return { ok: false, status: 400, error: '请输入手机号' };
  if (!isValidPhone(phone)) return { ok: false, status: 400, error: '手机号格式不正确（11 位中国大陆号码）' };

  const pwError = validatePassword(password);
  if (pwError) return { ok: false, status: 400, error: pwError };

  if (payload.confirmPassword !== undefined && payload.confirmPassword !== null) {
    if (String(payload.confirmPassword) !== password) {
      return { ok: false, status: 400, error: '两次输入的密码不一致' };
    }
  }

  const securityQuestion = asString(payload.securityQuestion);
  const securityAnswer = normalizeSecurityAnswer(payload.securityAnswer);
  const qError = validateSecurityQuestion(securityQuestion);
  if (qError) return { ok: false, status: 400, error: qError };
  if (securityQuestion && !securityAnswer) {
    return { ok: false, status: 400, error: '设置了密保问题就必须填写答案' };
  }

  return {
    ok: true,
    value: { name, phone, password, role: parseRole(payload.role), securityQuestion, securityAnswer },
  };
}

/**
 * 注册：写入 users 表，并生成一次性恢复码
 *
 * 规则：
 *  - 系统内第一个注册用户自动成为「管理员」（否则新装的系统没人能进用户管理）
 *  - 之后注册的用户只能选 教师 / 治疗师，管理员需由现有管理员在用户管理中指定
 *  - 若配置了环境变量 REGISTER_CODE，则注册需要填写该邀请码
 */
export async function registerUser(
  db: Pool,
  payload: RegisterPayload
): Promise<Result<{ user: PublicUser; recoveryCode: string; isFirstAdmin: boolean }>> {
  const validated = validateRegisterInput(payload);
  if (!validated.ok) return validated;
  const { name, phone, password, role, securityQuestion, securityAnswer } = validated.value;

  const registerCode = process.env.REGISTER_CODE || '';
  if (registerCode && asString(payload.registerCode) !== registerCode) {
    return { ok: false, status: 403, error: '注册邀请码不正确' };
  }

  const total = await countUsers(db);
  const isFirstAdmin = total === 0;
  let finalRole: string = role;
  if (isFirstAdmin) {
    finalRole = 'admin';
  } else if (role === 'admin') {
    return {
      ok: false,
      status: 400,
      error: '管理员账号需由现有管理员在「用户管理」中设置',
    };
  }

  const existing = await findUserByPhone(db, phone);
  if (existing) {
    return { ok: false, status: 409, error: '该手机号已注册，请直接登录' };
  }

  const passwordHash = await hashPassword(password);
  const securityAnswerHash = securityAnswer ? await hashPassword(securityAnswer) : '';
  const recoveryCode = generateRecoveryCode();
  const recoveryCodeHash = await hashPassword(normalizeRecoveryCode(recoveryCode));

  try {
    const row = await insertUser(db, {
      name,
      phone,
      passwordHash,
      role: finalRole,
      source: 'web',
      securityQuestion,
      securityAnswerHash,
      recoveryCodeHash,
    });
    return { ok: true, value: { user: toPublicUser(row), recoveryCode, isFirstAdmin } };
  } catch (e: any) {
    // 并发注册同一手机号：依赖 phone 唯一索引兜底
    if (e && (e.code === '23505' || /duplicate key/i.test(String(e.message)))) {
      return { ok: false, status: 409, error: '该手机号已注册，请直接登录' };
    }
    throw e;
  }
}

/** 登录：校验手机号 + 密码 */
export async function authenticateUser(
  db: Pool,
  payload: LoginPayload
): Promise<Result<PublicUser>> {
  const phone = normalizePhone(payload.phone);
  const password = String(payload.password == null ? '' : payload.password);

  if (!phone) return { ok: false, status: 400, error: '请输入手机号' };
  if (!password) return { ok: false, status: 400, error: '请输入密码' };

  const user = await findUserByPhone(db, phone);
  // 统一话术，避免暴露“该手机号是否已注册”
  if (!user) return { ok: false, status: 401, error: '手机号或密码不正确' };

  const matched = await verifyPassword(password, getPasswordHash(user));
  if (!matched) return { ok: false, status: 401, error: '手机号或密码不正确' };

  if ((user.status || 'active') !== 'active') {
    return { ok: false, status: 403, error: '该账号已被停用，请联系管理员' };
  }

  try {
    await touchLastLogin(db, user.id);
  } catch (e: any) {
    console.warn('[auth] 更新最近登录时间失败:', e.message);
  }

  return { ok: true, value: toPublicUser(user) };
}

/** 已登录用户修改自己的密码 */
export async function changeOwnPassword(
  db: Pool,
  userId: string,
  payload: { oldPassword?: unknown; newPassword?: unknown; confirmPassword?: unknown }
): Promise<Result<{ success: true }>> {
  const oldPassword = String(payload.oldPassword == null ? '' : payload.oldPassword);
  const newPassword = String(payload.newPassword == null ? '' : payload.newPassword);

  if (!oldPassword) return { ok: false, status: 400, error: '请输入当前密码' };
  const pwError = validatePassword(newPassword);
  if (pwError) return { ok: false, status: 400, error: '新密码：' + pwError };
  if (payload.confirmPassword !== undefined && String(payload.confirmPassword) !== newPassword) {
    return { ok: false, status: 400, error: '两次输入的新密码不一致' };
  }

  const user = await findUserById(db, userId);
  if (!user) return { ok: false, status: 401, error: '未登录' };

  const currentHash = getPasswordHash(user);
  if (!(await verifyPassword(oldPassword, currentHash))) {
    return { ok: false, status: 400, error: '当前密码不正确' };
  }
  if (await verifyPassword(newPassword, currentHash)) {
    return { ok: false, status: 400, error: '新密码不能与当前密码相同' };
  }

  const newHash = await hashPassword(newPassword);
  await updatePassword(db, user.id, newHash, { mustChangePassword: false, resetBy: '' });
  await logPasswordReset(db, {
    userId: user.id,
    phone: user.phone,
    action: 'self_change',
    operator: user.id,
  });
  return { ok: true, value: { success: true } };
}

/** 找回密码第一步：查询该手机号可用的找回方式 */
export async function getForgotInfo(
  db: Pool,
  rawPhone: unknown
): Promise<
  Result<{
    phone: string;
    maskedPhone: string;
    question: string;
    hasRecoveryCode: boolean;
    locked: boolean;
    remainMinutes: number;
  }>
> {
  const phone = normalizePhone(rawPhone);
  if (!isValidPhone(phone)) {
    return { ok: false, status: 400, error: '请输入正确的 11 位手机号' };
  }

  const user = await findUserByPhone(db, phone);
  // 未注册的手机号不抛错，统一返回“无可用方式”，避免批量探测账号
  if (!user) {
    return {
      ok: true,
      value: {
        phone,
        maskedPhone: maskPhone(phone),
        question: '',
        hasRecoveryCode: false,
        locked: false,
        remainMinutes: 0,
      },
    };
  }

  return {
    ok: true,
    value: {
      phone,
      maskedPhone: maskPhone(user.phone),
      question: asString((user as any).securityQuestion || (user as any).securityquestion),
      hasRecoveryCode: !!getRecoveryCodeHash(user),
      locked: isResetLocked(user),
      remainMinutes: resetLockRemainMinutes(user),
    },
  };
}

type ResetCredential =
  | { method: 'security'; answer: unknown }
  | { method: 'recovery'; recoveryCode: unknown };

/** 找回密码（密保问题 / 恢复码两条自助通道，共用落库逻辑） */
export async function resetPassword(
  db: Pool,
  payload: ResetCredential & { phone?: unknown; newPassword?: unknown; confirmPassword?: unknown }
): Promise<Result<{ success: true; name: string }>> {
  const phone = normalizePhone(payload.phone);
  const newPassword = String(payload.newPassword == null ? '' : payload.newPassword);

  if (!isValidPhone(phone)) {
    return { ok: false, status: 400, error: '请输入正确的 11 位手机号' };
  }
  const pwError = validatePassword(newPassword);
  if (pwError) return { ok: false, status: 400, error: pwError };
  if (payload.confirmPassword !== undefined && String(payload.confirmPassword) !== newPassword) {
    return { ok: false, status: 400, error: '两次输入的新密码不一致' };
  }

  const user = await findUserByPhone(db, phone);
  if (!user) return { ok: false, status: 404, error: '该手机号尚未注册' };

  if (isResetLocked(user)) {
    return {
      ok: false,
      status: 429,
      error: `找回密码尝试次数过多，请 ${resetLockRemainMinutes(user)} 分钟后再试，或联系管理员重置`,
    };
  }

  let credentialOk = false;
  let action = '';

  if (payload.method === 'security') {
    const hash = getSecurityAnswerHash(user);
    if (!asString((user as any).securityQuestion || (user as any).securityquestion) || !hash) {
      return { ok: false, status: 400, error: '该账号未设置密保问题，请改用恢复码或联系管理员重置' };
    }
    const answer = normalizeSecurityAnswer(payload.answer);
    if (!answer) return { ok: false, status: 400, error: '请输入密保答案' };
    credentialOk = await verifyPassword(answer, hash);
    action = 'self_security_answer';
  } else {
    const hash = getRecoveryCodeHash(user);
    if (!hash) {
      return { ok: false, status: 400, error: '该账号没有可用的恢复码，请联系管理员重置密码' };
    }
    const code = normalizeRecoveryCode(payload.recoveryCode);
    if (!isValidRecoveryCodeFormat(code)) {
      credentialOk = false;
      action = 'self_recovery_code';
    } else {
      credentialOk = await verifyPassword(code, hash);
      action = 'self_recovery_code';
    }
  }

  if (!credentialOk) {
    const { locked } = await registerResetFailure(db, user);
    const base = payload.method === 'security' ? '密保答案不正确' : '恢复码不正确';
    if (locked) {
      return {
        ok: false,
        status: 429,
        error: `${base}，尝试次数过多，已锁定 ${Math.round(RESET_LOCK_MS / 60000)} 分钟`,
      };
    }
    return { ok: false, status: 400, error: base };
  }

  const newHash = await hashPassword(newPassword);
  // 恢复码是可长期复用的凭证（不失效），如需一次性使用可在此处清空 recoveryCodeHash
  await updatePassword(db, user.id, newHash, { mustChangePassword: false, resetBy: 'self' });
  await clearResetFailures(db, user.id);
  await logPasswordReset(db, {
    userId: user.id,
    phone: user.phone,
    action,
    operator: 'self',
  });

  return { ok: true, value: { success: true, name: user.name || '' } };
}

/** 校验管理员身份（每次从库里取，避免用过期 Cookie 里的角色） */
export async function requireAdmin(
  db: Pool,
  userId: string | undefined
): Promise<Result<{ id: string; name: string }>> {
  if (!userId) return { ok: false, status: 401, error: '未登录' };
  const row = await findUserById(db, userId);
  if (!row) return { ok: false, status: 401, error: '未登录' };
  if ((row.status || 'active') !== 'active') {
    return { ok: false, status: 403, error: '该账号已被停用' };
  }
  if (row.role !== 'admin') {
    return { ok: false, status: 403, error: '需要管理员权限' };
  }
  return { ok: true, value: { id: row.id, name: row.name || '' } };
}

/** 管理员：用户列表 */
export async function adminListUsers(
  db: Pool,
  adminId: string | undefined,
  keyword = ''
): Promise<Result<PublicUser[]>> {
  const admin = await requireAdmin(db, adminId);
  if (!admin.ok) return admin;
  const rows = await listUsers(db, keyword);
  return { ok: true, value: rows.map(toPublicUser) };
}

/** 管理员：重置某用户密码（生成临时密码，只返回一次） */
export async function adminResetPassword(
  db: Pool,
  adminId: string | undefined,
  targetUserId: string
): Promise<Result<{ tempPassword: string; user: PublicUser }>> {
  const admin = await requireAdmin(db, adminId);
  if (!admin.ok) return admin;

  const target = await findUserById(db, targetUserId);
  if (!target) return { ok: false, status: 404, error: '用户不存在' };

  const tempPassword = generateTempPassword();
  const hash = await hashPassword(tempPassword);
  // 强制用户下次登录后修改密码
  await updatePassword(db, target.id, hash, { mustChangePassword: true, resetBy: admin.value.id });
  await clearResetFailures(db, target.id);
  await logPasswordReset(db, {
    userId: target.id,
    phone: target.phone,
    action: 'admin_reset',
    operator: admin.value.name || admin.value.id,
  });

  const fresh = await findUserById(db, target.id);
  return { ok: true, value: { tempPassword, user: toPublicUser(fresh || target) } };
}

/** 管理员：调整用户角色 / 启停（不允许改自己，避免把自己锁死） */
export async function adminUpdateUser(
  db: Pool,
  adminId: string | undefined,
  targetUserId: string,
  payload: { role?: unknown; status?: unknown }
): Promise<Result<PublicUser>> {
  const admin = await requireAdmin(db, adminId);
  if (!admin.ok) return admin;

  if (!targetUserId) return { ok: false, status: 400, error: '缺少用户 ID' };
  if (targetUserId === admin.value.id) {
    return { ok: false, status: 400, error: '不能修改自己的角色或状态，请让其他管理员操作' };
  }

  const target = await findUserById(db, targetUserId);
  if (!target) return { ok: false, status: 404, error: '用户不存在' };

  const data: { role?: string; status?: string } = {};
  if (payload.role !== undefined) {
    const role = asString(payload.role);
    if (!(USER_ROLES as readonly string[]).includes(role)) {
      return { ok: false, status: 400, error: '角色取值不合法' };
    }
    data.role = role;
  }
  if (payload.status !== undefined) {
    const status = asString(payload.status);
    if (!['active', 'inactive'].includes(status)) {
      return { ok: false, status: 400, error: '状态取值不合法' };
    }
    data.status = status;
  }
  if (!data.role && !data.status) {
    return { ok: false, status: 400, error: '没有需要更新的字段' };
  }

  const row = await updateRoleAndStatus(db, target.id, data);
  if (data.status === 'inactive' || data.role) {
    await logPasswordReset(db, {
      userId: target.id,
      phone: target.phone,
      action: data.status === 'inactive' ? 'admin_disable' : 'admin_role_change',
      operator: `${admin.value.name || admin.value.id}${data.role ? ' → ' + data.role : ''}${data.status ? ' → ' + data.status : ''}`,
    });
  }
  return { ok: true, value: toPublicUser(row) };
}

/** 管理员：为用户重发恢复码（用户丢失恢复码时用） */
export async function adminIssueRecoveryCode(
  db: Pool,
  adminId: string | undefined,
  targetUserId: string
): Promise<Result<{ recoveryCode: string; user: PublicUser }>> {
  const admin = await requireAdmin(db, adminId);
  if (!admin.ok) return admin;

  const target = await findUserById(db, targetUserId);
  if (!target) return { ok: false, status: 404, error: '用户不存在' };

  const recoveryCode = generateRecoveryCode();
  const hash = await hashPassword(normalizeRecoveryCode(recoveryCode));
  await updateRecoveryCode(db, target.id, hash);
  await logPasswordReset(db, {
    userId: target.id,
    phone: target.phone,
    action: 'admin_reissue_recovery_code',
    operator: admin.value.name || admin.value.id,
  });
  return { ok: true, value: { recoveryCode, user: toPublicUser(target) } };
}

/** 用户自行设置/更新密保问题 */
export async function setOwnSecurityQuestion(
  db: Pool,
  userId: string,
  payload: { securityQuestion?: unknown; securityAnswer?: unknown }
): Promise<Result<{ success: true }>> {
  const question = asString(payload.securityQuestion);
  const answer = normalizeSecurityAnswer(payload.securityAnswer);
  const qError = validateSecurityQuestion(question);
  if (qError) return { ok: false, status: 400, error: qError };
  if (!question) return { ok: false, status: 400, error: '请选择或填写密保问题' };
  if (!answer) return { ok: false, status: 400, error: '请填写密保答案' };

  const user = await findUserById(db, userId);
  if (!user) return { ok: false, status: 401, error: '未登录' };

  await updateSecurityQuestion(db, user.id, question, await hashPassword(answer));
  return { ok: true, value: { success: true } };
}
