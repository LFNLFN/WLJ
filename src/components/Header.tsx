'use client';

import { usePathname } from 'next/navigation';

const pageTitles: Record<string, string> = {
  '/': '仪表盘',
  '/teachers': '教师管理',
  '/teachers/new': '添加教师',
  '/students': '学生管理',
  '/students/new': '添加学生',
  '/courses': '课程管理',
  '/courses/new': '添加课程',
  '/records': '上课记录',
};

export default function Header() {
  const pathname = usePathname();
  const title = pageTitles[pathname] || '未来家儿童能力发展中心';

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
              weekday: 'long'
            })}
          </span>
        </div>
      </div>
    </header>
  );
}
