'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { ROLE_LABELS, SECURITY_QUESTIONS } from '@/lib/auth/config';

interface Me {
  id: string;
  name: string;
  phone: string;
  role: string;
  lastLoginAt: string;
  securityQuestion: string;
  hasSecurityQuestion: boolean;
  mustChangePassword: boolean;
  lastResetAt: string;
  lastResetBy: string;
}

export default function AccountPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  // 修改密码
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwMsg, setPwMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [pwSubmitting, setPwSubmitting] = useState(false);

  // 密保问题
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [qaMsg, setQaMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [qaSubmitting, setQaSubmitting] = useState(false);

  const loadMe = () => {
    setLoading(true);
    fetch('/api/auth/me')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('获取用户信息失败'))))
      .then((data) => {
        setMe(data.user);
        setQuestion(data.user?.securityQuestion || '');
      })
      .catch(() => router.replace('/login'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg(null);
    if (!oldPassword) {
      setPwMsg({ type: 'err', text: '请输入当前密码' });
      return;
    }
    if (newPassword.length < 6) {
      setPwMsg({ type: 'err', text: '新密码至少 6 位' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwMsg({ type: 'err', text: '两次输入的新密码不一致' });
      return;
    }
    setPwSubmitting(true);
    try {
      const res = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword, newPassword, confirmPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '修改失败');
      setPwMsg({ type: 'ok', text: '密码已更新' });
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      loadMe();
    } catch (err: any) {
      setPwMsg({ type: 'err', text: err.message || '修改失败' });
    } finally {
      setPwSubmitting(false);
    }
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    setQaMsg(null);
    if (!question) {
      setQaMsg({ type: 'err', text: '请选择密保问题' });
      return;
    }
    if (!answer.trim()) {
      setQaMsg({ type: 'err', text: '请填写密保答案' });
      return;
    }
    setQaSubmitting(true);
    try {
      const res = await fetch('/api/auth/security-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ securityQuestion: question, securityAnswer: answer }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '保存失败');
      setQaMsg({ type: 'ok', text: '密保问题已保存，忘记密码时可用它自助重置' });
      setAnswer('');
      loadMe();
    } catch (err: any) {
      setQaMsg({ type: 'err', text: err.message || '保存失败' });
    } finally {
      setQaSubmitting(false);
    }
  };

  const inputClass =
    'w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-800 outline-none focus:border-[#F08020] focus:ring-2 focus:ring-[#F08020]/20';

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-8">
          {loading && !me ? (
            <p className="text-gray-500">加载中…</p>
          ) : (
            <div className="max-w-3xl space-y-6">
              {me?.mustChangePassword && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
                  管理员已为你重置密码，请立即设置一个只有你知道的新密码。
                </div>
              )}

              {/* 我的信息 */}
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h3 className="text-base font-medium text-gray-800 mb-4">我的信息</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-gray-400">姓名</div>
                    <div className="text-gray-800 mt-1">{me?.name || '-'}</div>
                  </div>
                  <div>
                    <div className="text-gray-400">手机号</div>
                    <div className="text-gray-800 mt-1">{me?.phone || '-'}</div>
                  </div>
                  <div>
                    <div className="text-gray-400">角色</div>
                    <div className="text-gray-800 mt-1">{ROLE_LABELS[me?.role || ''] || me?.role}</div>
                  </div>
                  <div>
                    <div className="text-gray-400">最近登录</div>
                    <div className="text-gray-800 mt-1">{me?.lastLoginAt || '-'}</div>
                  </div>
                  {me?.lastResetAt && (
                    <div className="col-span-2">
                      <div className="text-gray-400">密码最近被重置</div>
                      <div className="text-gray-800 mt-1">
                        {me.lastResetAt}（{me.lastResetBy === 'self' ? '本人自助找回' : `操作人：${me.lastResetBy}`}）
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 修改密码 */}
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h3 className="text-base font-medium text-gray-800 mb-4">修改密码</h3>
                {pwMsg && (
                  <div
                    className={`mb-4 rounded-lg px-4 py-2.5 text-sm ${
                      pwMsg.type === 'ok'
                        ? 'bg-green-50 border border-green-200 text-green-700'
                        : 'bg-red-50 border border-red-200 text-red-600'
                    }`}
                  >
                    {pwMsg.text}
                  </div>
                )}
                <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
                  <input
                    className={inputClass}
                    type="password"
                    placeholder="当前密码"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                  />
                  <input
                    className={inputClass}
                    type="password"
                    placeholder="新密码（至少 6 位）"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <input
                    className={inputClass}
                    type="password"
                    placeholder="确认新密码"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                  <button
                    type="submit"
                    disabled={pwSubmitting}
                    className="px-5 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-60"
                  >
                    {pwSubmitting ? '提交中…' : '保存新密码'}
                  </button>
                </form>
              </div>

              {/* 密保问题 */}
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h3 className="text-base font-medium text-gray-800 mb-1">密保问题</h3>
                <p className="text-sm text-gray-500 mb-4">
                  用于忘记密码时自助重置（无需短信验证码）。答案不区分大小写和空格。
                </p>
                {qaMsg && (
                  <div
                    className={`mb-4 rounded-lg px-4 py-2.5 text-sm ${
                      qaMsg.type === 'ok'
                        ? 'bg-green-50 border border-green-200 text-green-700'
                        : 'bg-red-50 border border-red-200 text-red-600'
                    }`}
                  >
                    {qaMsg.text}
                  </div>
                )}
                <form onSubmit={handleSaveQuestion} className="space-y-4 max-w-md">
                  <select className={inputClass} value={question} onChange={(e) => setQuestion(e.target.value)}>
                    <option value="">请选择密保问题</option>
                    {SECURITY_QUESTIONS.map((q) => (
                      <option key={q} value={q}>
                        {q}
                      </option>
                    ))}
                  </select>
                  <input
                    className={inputClass}
                    type="text"
                    placeholder="密保答案"
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                  />
                  <button
                    type="submit"
                    disabled={qaSubmitting}
                    className="px-5 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-60"
                  >
                    {qaSubmitting ? '保存中…' : me?.hasSecurityQuestion ? '更新密保问题' : '设置密保问题'}
                  </button>
                </form>
              </div>

              {/* 恢复码说明 */}
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h3 className="text-base font-medium text-gray-800 mb-2">恢复码</h3>
                <p className="text-sm text-gray-500 leading-relaxed">
                  注册成功时展示过一串 12 位恢复码（形如 XXXX-XXXX-XXXX），它只显示一次。
                  忘记密码时可在「
                  <a href="/forgot" className="text-[#F08020]">
                    找回密码
                  </a>
                  」页凭它重置密码。
                  <br />
                  如果已遗失：让管理员在「用户管理」中为你<strong>重发恢复码</strong>，或直接
                  <strong>重置密码</strong>。
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
