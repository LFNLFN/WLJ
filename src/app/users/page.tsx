'use client';

import { useEffect, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { ROLE_LABELS, USER_ROLES } from '@/lib/auth/config';

interface AdminUser {
  id: string;
  name: string;
  phone: string;
  role: string;
  status: string;
  lastLoginAt: string;
  createdAt: string;
  hasSecurityQuestion: boolean;
  mustChangePassword: boolean;
  lastResetAt: string;
  lastResetBy: string;
}

type SecretDialog =
  | { kind: 'password'; title: string; hint: string; value: string; name: string }
  | { kind: 'recovery'; title: string; hint: string; value: string; name: string }
  | null;

export default function UsersPage() {
  const [me, setMe] = useState<AdminUser | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<SecretDialog>(null);
  const [copied, setCopied] = useState(false);

  const loadUsers = (kw = keyword) => {
    setError(null);
    fetch(`/api/admin/users${kw ? `?keyword=${encodeURIComponent(kw)}` : ''}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || '加载失败');
        return data;
      })
      .then((data) => setUsers(Array.isArray(data) ? data : []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setMe(data?.user || null))
      .catch(() => setMe(null))
      .finally(() => loadUsers(''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patchUser = async (id: string, payload: { role?: string; status?: string }) => {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '更新失败');
      loadUsers();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const resetPassword = async (u: AdminUser) => {
    if (!confirm(`确定要重置「${u.name}」的密码吗？\n系统会生成一个临时密码，你需要线下告知他，并要求其登录后立即修改。`)) {
      return;
    }
    setBusyId(u.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${u.id}/reset-password`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '重置失败');
      setDialog({
        kind: 'password',
        title: '临时密码（只显示这一次）',
        hint: '请复制并线下告知用户，对方登录后会被要求立即修改密码。',
        value: data.tempPassword,
        name: u.name,
      });
      loadUsers();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const reissueRecoveryCode = async (u: AdminUser) => {
    if (!confirm(`确定为「${u.name}」重新生成恢复码吗？\n旧恢复码立即失效。`)) return;
    setBusyId(u.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${u.id}/recovery-code`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '生成失败');
      setDialog({
        kind: 'recovery',
        title: '新恢复码（只显示这一次）',
        hint: '请复制并线下告知用户，用于他在「找回密码」页自助重置密码。',
        value: data.recoveryCode,
        name: u.name,
      });
      loadUsers();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const copyValue = (v: string) => {
    navigator.clipboard?.writeText(v).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => setCopied(false)
    );
  };

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-8">
          {me && me.role !== 'admin' ? (
            <div className="bg-white rounded-xl shadow-sm p-8 text-center text-gray-500">
              该功能仅管理员可用
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-6 gap-4">
                <p className="text-gray-500">
                  {error ? <span className="text-red-500">{error}</span> : `共 ${users.length} 个账号`}
                </p>
                <div className="flex items-center gap-2">
                  <input
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#F08020]"
                    placeholder="搜索姓名 / 手机号"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') loadUsers();
                    }}
                  />
                  <button
                    onClick={() => loadUsers()}
                    className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                  >
                    搜索
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">姓名</th>
                      <th className="px-4 py-3 text-left font-medium">手机号</th>
                      <th className="px-4 py-3 text-left font-medium">角色</th>
                      <th className="px-4 py-3 text-left font-medium">状态</th>
                      <th className="px-4 py-3 text-left font-medium">密保 / 最近登录</th>
                      <th className="px-4 py-3 text-right font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {loading && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                          加载中…
                        </td>
                      </tr>
                    )}
                    {!loading && users.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                          暂无账号
                        </td>
                      </tr>
                    )}
                    {users.map((u) => {
                      const isSelf = me?.id === u.id;
                      return (
                        <tr key={u.id} className="hover:bg-gray-50/60">
                          <td className="px-4 py-3 text-gray-800">
                            {u.name}
                            {isSelf && <span className="ml-2 text-xs text-[#F08020]">（我）</span>}
                          </td>
                          <td className="px-4 py-3 text-gray-600">{u.phone}</td>
                          <td className="px-4 py-3">
                            <select
                              value={u.role}
                              disabled={isSelf || busyId === u.id}
                              onChange={(e) => patchUser(u.id, { role: e.target.value })}
                              className="rounded-lg border border-gray-300 px-2 py-1 text-sm disabled:bg-gray-100 disabled:text-gray-400"
                            >
                              {USER_ROLES.map((r) => (
                                <option key={r} value={r}>
                                  {ROLE_LABELS[r] || r}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs ${
                                u.status === 'active'
                                  ? 'bg-green-50 text-green-700'
                                  : 'bg-gray-100 text-gray-500'
                              }`}
                            >
                              {u.status === 'active' ? '正常' : '已停用'}
                            </span>
                            {u.mustChangePassword && (
                              <span className="ml-2 text-xs text-amber-600">待改密</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs leading-relaxed">
                            <div>{u.hasSecurityQuestion ? '已设密保问题' : '未设密保问题'}</div>
                            <div>最近登录：{u.lastLoginAt || '从未登录'}</div>
                            {u.lastResetAt && <div>最近重置：{u.lastResetAt}</div>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => resetPassword(u)}
                                disabled={busyId === u.id}
                                className="px-3 py-1.5 rounded-lg border border-[#F08020] text-[#F08020] hover:bg-orange-50 disabled:opacity-60"
                              >
                                重置密码
                              </button>
                              <button
                                onClick={() => reissueRecoveryCode(u)}
                                disabled={busyId === u.id}
                                className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-60"
                              >
                                重发恢复码
                              </button>
                              <button
                                onClick={() =>
                                  patchUser(u.id, {
                                    status: u.status === 'active' ? 'inactive' : 'active',
                                  })
                                }
                                disabled={isSelf || busyId === u.id}
                                className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                              >
                                {u.status === 'active' ? '停用' : '启用'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <p className="mt-4 text-xs text-gray-400 leading-relaxed">
                说明：管理员不能修改自己的角色或停用自己（避免把自己锁在系统外），如需变更请让其他管理员操作。
              </p>
            </>
          )}
        </main>
      </div>

      {/* 一次性凭证弹窗 */}
      {dialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center px-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-base font-medium text-gray-800 mb-1">
              {dialog.name} · {dialog.title}
            </h3>
            <p className="text-xs text-gray-500 mb-4">{dialog.hint}</p>
            <div className="rounded-xl border-2 border-dashed border-[#F08020] bg-orange-50/50 p-4 text-center">
              <div className="text-xl font-mono font-semibold tracking-wider text-[#E04020] break-all">
                {dialog.value}
              </div>
              <button
                type="button"
                onClick={() => copyValue(dialog.value)}
                className="mt-3 rounded-lg bg-white border border-[#F08020] px-4 py-1.5 text-sm text-[#F08020]"
              >
                {copied ? '已复制 ✓' : '复制'}
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setDialog(null);
                setCopied(false);
              }}
              className="mt-4 w-full rounded-lg bg-gradient-to-r from-[#F08020] to-[#E04020] py-2.5 text-white"
            >
              我已记录，关闭
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
