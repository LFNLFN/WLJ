'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import Table from '@/components/Table';
import { getTeachers, deleteTeacher } from '@/lib/api';
import type { Teacher } from '@/lib/types';

export default function TeachersPage() {
  const router = useRouter();
  const [teachers, setTeachers] = useState<any[]>([]);

  const loadData = () => {
    getTeachers().then(setTeachers).catch(err => console.error('加载失败:', err));
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDelete = (teacher: any) => {
    if (confirm(`确定要删除教师 "${teacher.name}" 吗？`)) {
      deleteTeacher(teacher._id).then(loadData).catch(err => alert('删除失败'));
    }
  };

  const columns = [
    { key: 'name', label: '姓名' },
    { key: 'phone', label: '电话' },
    { key: 'subjects', label: '可教科目',
      render: (val: string[]) => (
        <div className="flex gap-1 flex-wrap">
          {val.map((s, i) => (
            <span key={i} className="px-2 py-0.5 bg-primary-50 text-primary-700 text-xs rounded-full">
              {s}
            </span>
          ))}
        </div>
      )
    },
    { key: 'createdAt', label: '添加时间',
      render: (val: string) => new Date(val).toLocaleDateString('zh-CN')
    },
  ];

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-8">
          <div className="flex items-center justify-between mb-6">
            <p className="text-gray-500">共 {teachers.length} 位教师</p>
            <button
              onClick={() => router.push('/teachers/new')}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              ➕ 添加教师
            </button>
          </div>
          <Table
            columns={columns}
            data={teachers}
            onEdit={(row) => router.push(`/teachers/edit?id=${row._id}`)}
            onDelete={handleDelete}
            rowKey="_id"
          />
        </main>
      </div>
    </div>
  );
}
