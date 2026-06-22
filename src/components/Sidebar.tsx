'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { useState } from 'react';

const navItems = [
  { href: '/teachers', label: '教师管理', icon: '👨‍🏫' },
  { href: '/students', label: '学生管理', icon: '👦' },
  { href: '/courses', label: '课程管理', icon: '📚' },
  { href: '/lesson-plans', label: '教案中心', icon: '📖' },
];

const subNavGroups = [
  {
    label: '康复档案',
    icon: '📋',
    items: [
      { href: '/rehabilitation/mental-retardation', label: '智障儿童' },
    ],
  },
  {
    label: '量表管理',
    icon: '📏',
    items: [
      { href: '/scales', label: '量表模板' },
      { href: '/scales/records', label: '评估记录' },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [expandedGroup, setExpandedGroup] = useState<string | null>(() => {
    if (pathname.startsWith('/rehabilitation')) return '康复档案';
    if (pathname.startsWith('/scales')) return '量表管理';
    return null;
  });

  const toggleGroup = (label: string) => {
    setExpandedGroup(expandedGroup === label ? null : label);
  };

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
            <p className="text-[10px] text-gray-400 mt-0.5">工作台</p>
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
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive
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

          {/* 分隔线 */}
          <li className="pt-4 border-t border-gray-100 mt-4" />

          {/* 分组导航 */}
          {subNavGroups.map((group) => {
            const isGroupActive = group.items.some(
              (item) => pathname === item.href || pathname.startsWith(item.href)
            );
            return (
              <li key={group.label}>
                <button
                  onClick={() => toggleGroup(group.label)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isGroupActive
                      ? 'bg-[#FFF0E0] text-[#F08020] font-medium'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
                    }`}
                >
                  <span className="text-lg">{group.icon}</span>
                  <span className="flex-1 text-left">{group.label}</span>
                  <svg
                    className={`w-4 h-4 transition-transform ${expandedGroup === group.label ? 'rotate-90' : ''
                      }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
                {expandedGroup === group.label && (
                  <ul className="ml-4 mt-1 space-y-1">
                    {group.items.map((item) => {
                      const isActive =
                        pathname === item.href ||
                        pathname.startsWith(item.href);
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${isActive
                                ? 'bg-[#FFF0E0] text-[#F08020] font-medium'
                                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                              }`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
                            <span>{item.label}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
