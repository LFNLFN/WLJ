'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import Table from '@/components/Table';
import { getStudents, deleteStudent } from '@/lib/api';
import type { Student } from '@/lib/types';

export default function StudentsPage() {
  const router = useRouter();
  const [students, setStudents] = useState<any[]>([]);

  const loadData = () => getStudents().then(setStudents).catch(err => console.error('加载失败:', err));

  useEffect(() => { loadData(); }, []);

  const handleDelete = (student: any) => {
    if (confirm(`确定要删除学生 "${student.name}" 吗？`)) {
      deleteStudent(student._id).then(loadData).catch(err => alert('删除失败'));
    }
  };

  const columns = [
    { key: 'name', label: '姓名' },
    { key: 'grade', label: '年级' },
    { key: 'parentName', label: '家长姓名' },
    { key: 'parentPhone', label: '家长电话' },
    { key: 'phone', label: '学生电话' },
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
            <p className="text-gray-500">共 {students.length} 位学生</p>
            <button
              onClick={() => router.push('/students/new')}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              ➕ 添加学生
            </button>
          </div>
          <Table
            columns={columns}
            data={students}
            onEdit={(row) => router.push(`/students/edit?id=${row._id}`)}
            onDelete={handleDelete}
          />
        </main>
      </div>
    </div>
  );
}
