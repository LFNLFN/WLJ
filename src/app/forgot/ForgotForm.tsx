'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { getForgotInfo, resetPassword } from '@/lib/api';

type Step = 'phone' | 'verify' | 'done';
type Method = 'security' | 'recovery';

export default function ForgotForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('phone');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [phone, setPhone] = useState('');
  const [question, setQuestion] = useState('');
  const [hasRecoveryCode, setHasRecoveryCode] = useState(false);
  const [locked, setLocked] = useState(false);
  const [remainMinutes, setRemainMinutes] = useState(0);
  const [method, setMethod] = useState<Method>('security');

  const [answer, setAnswer] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const inputClass =
    'w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-800 outline-none focus:border-[#F08020] focus:ring-2 focus:ring-[#F08020]/20';

  /** 第一步：查询该手机号可用的找回方式 */
  const handleQueryPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^1[3-9]\d{9}$/.test(phone.trim())) {
      setError('请输入正确的 11 位手机号');
      return;
    }
    setSubmitting(true);
    try {
      // 与其它接口同一入口（src/lib/api.ts，相对路径 /api，与页面同源）
      const data = await getForgotInfo(phone.trim());
      setQuestion(data.question || '');
      setHasRecoveryCode(!!data.hasRecoveryCode);
      setLocked(!!data.locked);
      setRemainMinutes(data.remainMinutes || 0);
      // 没设密保问题但有恢复码 → 默认走恢复码
      setMethod(data.question ? 'security' : 'recovery');
      setStep('verify');
    } catch (err: any) {
      setError(err.message || '查询失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  /** 第二步：凭密保答案 / 恢复码设置新密码 */
  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (method === 'security' && !answer.trim()) {
      setError('请填写密保答案');
      return;
    }
    if (method === 'recovery' && !recoveryCode.trim()) {
      setError('请填写恢复码');
      return;
    }
    if (newPassword.length < 6) {
      setError('新密码至少 6 位');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致');
      return;
    }

    setSubmitting(true);
    try {
      await resetPassword({
        phone: phone.trim(),
        method,
        answer: method === 'security' ? answer : '',
        recoveryCode: method === 'recovery' ? recoveryCode : '',
        newPassword,
        confirmPassword,
      });
      setStep('done');
      setTimeout(() => router.replace('/login'), 2500);
    } catch (err: any) {
      setError(err.message || '重置失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#F08020] to-[#E04020] px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <div className="bg-white rounded-2xl p-3 shadow-lg mb-3">
            <Image src="/logo.jpg" alt="未来家" width={64} height={64} className="rounded-xl" />
          </div>
          <h1 className="text-white text-xl font-semibold">找回密码</h1>
          <p className="text-white/80 text-sm mt-1">不需要短信验证码</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6">
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-600">
              {error}
            </div>
          )}

          {step === 'phone' && (
            <form onSubmit={handleQueryPhone} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1.5">注册时使用的手机号</label>
                <input
                  className={inputClass}
                  type="tel"
                  inputMode="numeric"
                  maxLength={11}
                  placeholder="请输入手机号"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-gradient-to-r from-[#F08020] to-[#E04020] py-3 text-white font-medium shadow-sm hover:opacity-90 disabled:opacity-60"
              >
                {submitting ? '查询中…' : '下一步'}
              </button>
              <p className="text-center text-sm text-gray-500">
                想起来了？
                <Link href="/login" className="text-[#F08020] font-medium ml-1">
                  返回登录
                </Link>
              </p>
            </form>
          )}

          {step === 'verify' && (
            <form onSubmit={handleReset} className="space-y-4">
              {locked && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5 text-sm text-amber-700">
                  该账号找回尝试次数过多，已锁定约 {remainMinutes} 分钟；也可以联系管理员直接重置密码。
                </div>
              )}

              <div className="text-sm text-gray-500">
                账号：<span className="text-gray-800">{phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2')}</span>
              </div>

              {!question && !hasRecoveryCode && (
                <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 text-sm text-gray-600 leading-relaxed">
                  该账号没有设置密保问题，也没有可用的恢复码。
                  <br />
                  请联系管理员在「用户管理」中为你重置密码。
                </div>
              )}

              {(question || hasRecoveryCode) && (
                <div className="flex rounded-lg bg-gray-100 p-1 text-sm">
                  {question && (
                    <button
                      type="button"
                      onClick={() => setMethod('security')}
                      className={`flex-1 rounded-md py-2 ${method === 'security' ? 'bg-white shadow text-[#F08020] font-medium' : 'text-gray-500'}`}
                    >
                      密保问题
                    </button>
                  )}
                  {hasRecoveryCode && (
                    <button
                      type="button"
                      onClick={() => setMethod('recovery')}
                      className={`flex-1 rounded-md py-2 ${method === 'recovery' ? 'bg-white shadow text-[#F08020] font-medium' : 'text-gray-500'}`}
                    >
                      恢复码
                    </button>
                  )}
                </div>
              )}

              {method === 'security' && question && (
                <div>
                  <label className="block text-sm text-gray-600 mb-1.5">密保问题</label>
                  <div className="rounded-lg bg-orange-50 border border-orange-100 px-3 py-2 text-sm text-gray-700 mb-2">
                    {question}
                  </div>
                  <input
                    className={inputClass}
                    type="text"
                    placeholder="请输入密保答案"
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                  />
                </div>
              )}

              {method === 'recovery' && hasRecoveryCode && (
                <div>
                  <label className="block text-sm text-gray-600 mb-1.5">恢复码</label>
                  <input
                    className={`${inputClass} font-mono tracking-wider`}
                    type="text"
                    placeholder="XXXX-XXXX-XXXX"
                    value={recoveryCode}
                    onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
                  />
                  <p className="mt-1 text-xs text-gray-400">注册成功后展示的那串字符，可不用输入横线</p>
                </div>
              )}

              {(question || hasRecoveryCode) && (
                <>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1.5">新密码</label>
                    <input
                      className={inputClass}
                      type="password"
                      placeholder="至少 6 位"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1.5">确认新密码</label>
                    <input
                      className={inputClass}
                      type="password"
                      placeholder="请再次输入新密码"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submitting || locked}
                    className="w-full rounded-lg bg-gradient-to-r from-[#F08020] to-[#E04020] py-3 text-white font-medium shadow-sm hover:opacity-90 disabled:opacity-60"
                  >
                    {submitting ? '提交中…' : '重置密码'}
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => {
                  setStep('phone');
                  setError(null);
                }}
                className="w-full text-center text-sm text-gray-500"
              >
                ← 换个手机号
              </button>
            </form>
          )}

          {step === 'done' && (
            <div className="text-center space-y-3 py-4">
              <div className="text-3xl">✅</div>
              <div className="text-base font-medium text-gray-800">密码已重置</div>
              <div className="text-sm text-gray-500">正在跳转到登录页，请用新密码登录…</div>
              <Link href="/login" className="inline-block text-sm text-[#F08020] font-medium">
                立即前往登录
              </Link>
            </div>
          )}
        </div>

        <p className="text-center text-white/70 text-xs mt-6">
          忘记密保答案和恢复码？请联系管理员在「用户管理」中重置密码
        </p>
      </div>
    </div>
  );
}
