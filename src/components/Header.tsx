'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ROLE_LABELS } from '@/lib/auth/config';

const pageTitles: Record<string, string> = {
  '/': '工作台',
  '/teachers': '教师管理',
  '/teachers/new': '添加教师',
  '/students': '学生管理',
  '/students/new': '添加学生',
  '/courses': '课程管理',
  '/courses/new': '添加课程',
  '/records': '上课记录',
};

interface CurrentUser {
  id: string;
  name: string;
  phone: string;
  role: string;
}

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const title = pageTitles[pathname] || '未来家儿童能力发展中心';

  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.user) setUser(data.user);
      })
      .catch(() => {
        /* 未登录时静默忽略，middleware 会负责跳转 */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = async () => {
    if (!confirm('确定要退出登录吗？')) return;
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      /* 忽略网络错误，直接跳登录页 */
    } finally {
      router.replace('/login');
      router.refresh();
    }
  };

  return (
    <header className="bg-gradient-to-r from-[#F08020] to-[#E04020] shadow-sm px-8 py-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">{title}</h2>
        <div className="flex items-center gap-4">
          <span className="text-sm text-white/80">
            {new Date().toLocaleDateString('zh-CN', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              weekday: 'long',
            })}
          </span>

          {user && (
            <div className="flex items-center gap-3 pl-4 border-l border-white/30">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/25 text-sm text-white">
                  {user.name.slice(0, 1)}
                </span>
                <div className="leading-tight">
                  <div className="text-sm text-white">{user.name}</div>
                  <div className="text-[11px] text-white/70">{ROLE_LABELS[user.role] || user.role}</div>
                </div>
              </div>
              <Link
                href="/account"
                className="rounded-lg bg-white/15 px-3 py-1.5 text-xs text-white hover:bg-white/25"
              >
                账号设置
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                disabled={loggingOut}
                className="rounded-lg bg-white/15 px-3 py-1.5 text-xs text-white hover:bg-white/25 disabled:opacity-60"
              >
                {loggingOut ? '退出中…' : '退出登录'}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
