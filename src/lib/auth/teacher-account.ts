/**
 * 教师 ↔ 登录账号 打通（仅管理员可用）
 *
 * 背景：`teachers` 是教师档案，`users` 是登录账号，两者原本互不相干。
 * 这里按「teacherId 优先，其次手机号相同即视为同一人」的规则建立关联，
 * 让管理员能在「教师管理」页面直接为教师开通账号或重置密码。
 */
import type { Pool } from 'pg';
import { isValidPhone, normalizePhone } from './config';
import { hashPassword } from './password';
import { generateTempPassword } from './recovery';
import { requireAdmin } from './service';
import {
  findTeacherById,
  findUserById,
  findUserByTeacher,
  insertUser,
  linkTeacher,
  listTeachers,
  logPasswordReset,
  toPublicUser,
  updatePassword,
  clearResetFailures,
  type PublicUser,
} from './store';

export interface TeacherAccountInfo {
  teacherId: string;
  teacherName: string;
  phone: string;
  hasAccount: boolean;
  userId: string;
  accountName: string;
  role: string;
  status: string;
  lastLoginAt: string;
  mustChangePassword: boolean;
}

export type Result<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

/** 教师账号一览：教师管理页用它渲染「登录账号」列 */
export async function listTeacherAccounts(
  db: Pool,
  adminId: string | undefined
): Promise<Result<TeacherAccountInfo[]>> {
  const admin = await requireAdmin(db, adminId);
  if (!admin.ok) return admin;

  const teachers = await listTeachers(db);
  const usersResult = await db.query('SELECT * FROM users');
  const users = usersResult.rows as any[];

  const byTeacherId = new Map<string, any>();
  const byPhone = new Map<string, any>();
  for (const u of users) {
    const tid = u.teacherId || u.teacherid || '';
    if (tid) byTeacherId.set(tid, u);
    if (u.phone) byPhone.set(u.phone, u);
  }

  const list: TeacherAccountInfo[] = teachers.map((t) => {
    const phone = normalizePhone(t.phone);
    const user = byTeacherId.get(t.id) || (phone ? byPhone.get(phone) : undefined);
    return {
      teacherId: t.id,
      teacherName: t.name || '',
      phone: phone,
      hasAccount: !!user,
      userId: user ? user.id : '',
      accountName: user ? user.name || '' : '',
      role: user ? user.role || 'teacher' : '',
      status: user ? user.status || 'active' : '',
      lastLoginAt: user ? user.lastLoginAt || user.lastloginat || '' : '',
      mustChangePassword: user ? !!(user.mustChangePassword || user.mustchangepassword) : false,
    };
  });

  return { ok: true, value: list };
}

/** 为教师开通登录账号：生成一次性初始密码，并要求首次登录后改密 */
export async function createTeacherAccount(
  db: Pool,
  adminId: string | undefined,
  teacherId: string
): Promise<Result<{ tempPassword: string; user: PublicUser }>> {
  const admin = await requireAdmin(db, adminId);
  if (!admin.ok) return admin;

  const teacher = await findTeacherById(db, teacherId);
  if (!teacher) return { ok: false, status: 404, error: '教师不存在' };

  const phone = normalizePhone(teacher.phone);
  if (!phone) {
    return { ok: false, status: 400, error: '该教师没有填写手机号，请先在编辑教师里补充手机号' };
  }
  if (!isValidPhone(phone)) {
    return { ok: false, status: 400, error: '该教师的手机号格式不正确，请先在编辑教师里修正' };
  }

  const existing = await findUserByTeacher(db, teacherId, phone);
  if (existing) {
    // 已有账号（可能是教师自行注册的）→ 直接建立关联，不重复建号
    await linkTeacher(db, existing.id, teacherId);
    return { ok: false, status: 409, error: '该教师已有登录账号，请使用「重置密码」' };
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  const row = await insertUser(db, {
    name: teacher.name || phone,
    phone,
    passwordHash,
    role: 'teacher',
    source: 'admin_create',
  });
  // 首次登录必须改密
  await updatePassword(db, row.id, passwordHash, { mustChangePassword: true, resetBy: admin.value.id });
  await linkTeacher(db, row.id, teacherId);
  await logPasswordReset(db, {
    userId: row.id,
    phone,
    action: 'admin_create_account',
    operator: admin.value.name || admin.value.id,
  });

  const fresh = await findUserById(db, row.id);
  return { ok: true, value: { tempPassword, user: toPublicUser(fresh || row) } };
}

/** 重置教师的登录密码：生成一次性临时密码并要求改密 */
export async function resetTeacherAccountPassword(
  db: Pool,
  adminId: string | undefined,
  teacherId: string
): Promise<Result<{ tempPassword: string; user: PublicUser }>> {
  const admin = await requireAdmin(db, adminId);
  if (!admin.ok) return admin;

  const teacher = await findTeacherById(db, teacherId);
  if (!teacher) return { ok: false, status: 404, error: '教师不存在' };

  const phone = normalizePhone(teacher.phone);
  const target = await findUserByTeacher(db, teacherId, phone);
  if (!target) {
    return { ok: false, status: 404, error: '该教师还没有登录账号，请先点「开通账号」' };
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  await updatePassword(db, target.id, passwordHash, {
    mustChangePassword: true,
    resetBy: admin.value.id,
  });
  await clearResetFailures(db, target.id);
  await linkTeacher(db, target.id, teacherId);
  await logPasswordReset(db, {
    userId: target.id,
    phone: target.phone,
    action: 'admin_reset_teacher',
    operator: admin.value.name || admin.value.id,
  });

  const fresh = await findUserById(db, target.id);
  return { ok: true, value: { tempPassword, user: toPublicUser(fresh || target) } };
}
