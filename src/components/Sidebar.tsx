'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';

const navItems = [
  { href: '/', label: '仪表盘', icon: '📊' },
  { href: '/teachers', label: '教师管理', icon: '👨‍🏫' },
  { href: '/students', label: '学生管理', icon: '👦' },
  { href: '/courses', label: '课程管理', icon: '📚' },
  { href: '/records', label: '上课记录', icon: '📝' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-white shadow-lg min-h-screen">
      <div className="p-6 border-b border-gray-200">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-white shadow-sm border border-gray-100">
            <Image
              src="/logo.jpg"
              alt="未来家儿童能力发展中心"
              width={40}
              height={40}
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-800 leading-tight">未来家儿童能力</h1>
            <h1 className="text-base font-bold text-gray-800 leading-tight">发展中心</h1>
            <p className="text-[10px] text-gray-400 mt-0.5">课程管理系统</p>
          </div>
        </Link>
      </div>
      <nav className="p-4">
        <ul className="space-y-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href || 
              (item.href !== '/' && pathname.startsWith(item.href));
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-[#FFF0E0] text-[#F08020] font-medium border-r-4 border-[#F08020]'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
                  }`}
                >
                  <span className="text-lg">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
