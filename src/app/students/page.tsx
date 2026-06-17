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

  const goToAssessments = (student: any) => {
    router.push(`/students/assessments?studentId=${student._id || student.id}`);
  };

  const goToNewAssessment = (student: any) => {
    router.push(`/scales/records/new?studentId=${student._id || student.id}`);
  };

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-800">学生管理</h2>
              <p className="text-gray-500 text-sm mt-1">管理学生信息，查看和录入量表评估</p>
            </div>
            <button
              onClick={() => router.push('/students/new')}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              ➕ 添加学生
            </button>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6 flex items-center gap-4">
            <span className="text-sm text-gray-500">共 {students.length} 位学生</span>
            <span className="text-gray-300">|</span>
            <span className="text-sm text-gray-500">
              点击"查看评估"查看学生所有量表结果，点击"新建评估"快速录入
            </span>
          </div>

          <Table
            columns={columns}
            data={students}
            onEdit={(row) => router.push(`/students/edit?id=${row._id}`)}
            onDelete={handleDelete}
            actions={[
              {
                label: '📊 查看评估',
                onClick: goToAssessments,
                color: 'text-blue-600',
                hoverColor: 'hover:bg-blue-50',
              },
              {
                label: '➕ 新建评估',
                onClick: goToNewAssessment,
                color: 'text-green-600',
                hoverColor: 'hover:bg-green-50',
              },
            ]}
          />
        </main>
      </div>
    </div>
  );
}
