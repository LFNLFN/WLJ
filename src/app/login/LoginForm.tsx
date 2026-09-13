'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { SECURITY_QUESTIONS } from '@/lib/auth/config';
import { login, register as registerApi } from '@/lib/api';

type Mode = 'login' | 'register';

const ROLES = [
  { value: 'teacher', label: '教师' },
  { value: 'therapist', label: '治疗师' },
  { value: 'admin', label: '管理员' },
];

export default function LoginForm({ nextPath = '/' }: { nextPath?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('login');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // 登录表单
  const [loginPhone, setLoginPhone] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // 注册表单
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regRole, setRegRole] = useState('teacher');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  // 可选密保问题（用于将来自助找回密码）
  const [regQuestion, setRegQuestion] = useState('');
  const [regAnswer, setRegAnswer] = useState('');
  // 注册成功后一次性展示恢复码
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [isFirstAdmin, setIsFirstAdmin] = useState(false);
  const [copied, setCopied] = useState(false);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
  };

  const afterSuccess = () => {
    router.replace(nextPath || '/');
    router.refresh();
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!/^1[3-9]\d{9}$/.test(loginPhone.trim())) {
      setError('请输入正确的 11 位手机号');
      return;
    }
    if (!loginPassword) {
      setError('请输入密码');
      return;
    }

    setSubmitting(true);
    try {
      // 与其它接口同一入口（src/lib/api.ts，相对路径 /api，与页面同源）
      const data = await login(loginPhone.trim(), loginPassword);
      // 管理员重置过密码的账号：先跳到账号设置页强制改密
      if (data.user?.mustChangePassword) {
        router.replace('/account');
        router.refresh();
        return;
      }
      afterSuccess();
    } catch (err: any) {
      setError(err.message || '登录失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!regName.trim()) {
      setError('请输入姓名');
      return;
    }
    if (!/^1[3-9]\d{9}$/.test(regPhone.trim())) {
      setError('请输入正确的 11 位手机号');
      return;
    }
    if (regPassword.length < 6) {
      setError('密码至少 6 位');
      return;
    }
    if (regPassword !== regConfirm) {
      setError('两次输入的密码不一致');
      return;
    }
    if (regQuestion && !regAnswer.trim()) {
      setError('已选择密保问题，请填写密保答案');
      return;
    }

    setSubmitting(true);
    try {
      const data = await registerApi({
        name: regName.trim(),
        phone: regPhone.trim(),
        role: regRole,
        password: regPassword,
        confirmPassword: regConfirm,
        securityQuestion: regQuestion,
        securityAnswer: regQuestion ? regAnswer : '',
      });
      // 恢复码只返回一次，必须先让用户保存
      if (data.recoveryCode) {
        setRecoveryCode(data.recoveryCode);
        setIsFirstAdmin(!!data.isFirstAdmin);
        return;
      }
      afterSuccess();
    } catch (err: any) {
      setError(err.message || '注册失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-800 outline-none focus:border-[#F08020] focus:ring-2 focus:ring-[#F08020]/20';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#F08020] to-[#E04020] px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <div className="bg-white rounded-2xl p-3 shadow-lg mb-3">
            <Image src="/logo.jpg" alt="未来家" width={72} height={72} className="rounded-xl" />
          </div>
          <h1 className="text-white text-xl font-semibold">未来家儿童能力发展中心</h1>
          <p className="text-white/80 text-sm mt-1">课程管理系统</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* 切换 Tab */}
          <div className="flex border-b border-gray-100">
            {(['login', 'register'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className={`flex-1 py-4 text-sm font-medium transition-colors ${
                  mode === m
                    ? 'text-[#F08020] border-b-2 border-[#F08020] bg-orange-50/50'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {m === 'login' ? '账号登录' : '新用户注册'}
              </button>
            ))}
          </div>

          <div className="p-6">
            {recoveryCode ? (
              <div className="space-y-4">
                <div className="text-center">
                  <div className="text-2xl">🎉</div>
                  <div className="text-base font-medium text-gray-800 mt-1">注册成功</div>
                  {isFirstAdmin && (
                    <div className="mt-2 text-xs text-[#F08020] bg-orange-50 border border-orange-100 rounded-lg px-3 py-2">
                      你是系统的第一个用户，已自动成为<strong>管理员</strong>，可在「用户管理」中维护其他账号
                    </div>
                  )}
                </div>
                <div className="rounded-xl border-2 border-dashed border-[#F08020] bg-orange-50/50 p-4 text-center">
                  <div className="text-xs text-gray-600 mb-2">
                    你的恢复码（忘记密码时使用，<strong>只显示这一次</strong>）
                  </div>
                  <div className="text-xl font-mono font-semibold tracking-wider text-[#E04020]">
                    {recoveryCode}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(recoveryCode).then(
                        () => {
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        },
                        () => setCopied(false)
                      );
                    }}
                    className="mt-3 rounded-lg bg-white border border-[#F08020] px-4 py-1.5 text-sm text-[#F08020]"
                  >
                    {copied ? '已复制 ✓' : '复制恢复码'}
                  </button>
                  <div className="text-[11px] text-gray-500 mt-3 leading-relaxed">
                    请立即保存（截图或抄写）。遗失后可让管理员重发，或直接让管理员重置密码。
                  </div>
                </div>
                <button
                  type="button"
                  onClick={afterSuccess}
                  className="w-full rounded-lg bg-gradient-to-r from-[#F08020] to-[#E04020] py-3 text-white font-medium shadow-sm hover:opacity-90"
                >
                  我已保存，进入系统
                </button>
              </div>
            ) : (
            <>
            {error && (
              <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-600">
                {error}
              </div>
            )}

            {mode === 'login' ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1.5">手机号</label>
                  <input
                    className={inputClass}
                    type="tel"
                    inputMode="numeric"
                    maxLength={11}
                    placeholder="请输入手机号"
                    value={loginPhone}
                    onChange={(e) => setLoginPhone(e.target.value.replace(/\D/g, ''))}
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1.5">密码</label>
                  <div className="relative">
                    <input
                      className={inputClass}
                      type={showPassword ? 'text' : 'password'}
                      placeholder="请输入密码"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"
                    >
                      {showPassword ? '隐藏' : '显示'}
                    </button>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-lg bg-gradient-to-r from-[#F08020] to-[#E04020] py-3 text-white font-medium shadow-sm hover:opacity-90 disabled:opacity-60"
                >
                  {submitting ? '登录中…' : '登 录'}
                </button>
                <div className="text-right">
                  <Link href="/forgot" className="text-sm text-[#F08020] hover:underline">
                    忘记密码？
                  </Link>
                </div>
                <p className="text-center text-sm text-gray-500">
                  还没有账号？
                  <button
                    type="button"
                    onClick={() => switchMode('register')}
                    className="text-[#F08020] font-medium ml-1"
                  >
                    立即注册
                  </button>
                </p>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1.5">姓名</label>
                  <input
                    className={inputClass}
                    type="text"
                    placeholder="请输入真实姓名"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1.5">手机号</label>
                  <input
                    className={inputClass}
                    type="tel"
                    inputMode="numeric"
                    maxLength={11}
                    placeholder="请输入手机号（作为登录账号）"
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value.replace(/\D/g, ''))}
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1.5">角色</label>
                  <select
                    className={inputClass}
                    value={regRole}
                    onChange={(e) => setRegRole(e.target.value)}
                  >
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1.5">密码</label>
                  <input
                    className={inputClass}
                    type={showPassword ? 'text' : 'password'}
                    placeholder="至少 6 位"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1.5">确认密码</label>
                  <input
                    className={inputClass}
                    type={showPassword ? 'text' : 'password'}
                    placeholder="请再次输入密码"
                    value={regConfirm}
                    onChange={(e) => setRegConfirm(e.target.value)}
                  />
                </div>
                <div className="rounded-lg bg-orange-50 border border-orange-100 p-3 space-y-3">
                  <div className="text-xs text-gray-600">
                    密保问题（可选）：忘记密码时可用它自助重置，不需短信验证码
                  </div>
                  <select
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 outline-none focus:border-[#F08020]"
                    value={regQuestion}
                    onChange={(e) => setRegQuestion(e.target.value)}
                  >
                    <option value="">暂不设置密保问题</option>
                    {SECURITY_QUESTIONS.map((q) => (
                      <option key={q} value={q}>
                        {q}
                      </option>
                    ))}
                  </select>
                  {regQuestion && (
                    <input
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 outline-none focus:border-[#F08020]"
                      type="text"
                      placeholder="请输入密保答案（请牢记）"
                      value={regAnswer}
                      onChange={(e) => setRegAnswer(e.target.value)}
                    />
                  )}
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-lg bg-gradient-to-r from-[#F08020] to-[#E04020] py-3 text-white font-medium shadow-sm hover:opacity-90 disabled:opacity-60"
                >
                  {submitting ? '注册中…' : '注册并进入系统'}
                </button>
                <p className="text-center text-xs text-gray-400">
                  注册信息将保存到后台数据库，无需短信验证
                </p>
              </form>
            )}
            </>
            )}
          </div>
        </div>

        <p className="text-center text-white/70 text-xs mt-6">
          © {new Date().getFullYear()} 未来家儿童能力发展中心
        </p>
      </div>
    </div>
  );
}
