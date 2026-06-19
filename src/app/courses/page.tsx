'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import Table from '@/components/Table';
import { getCourses, deleteCourse } from '@/lib/api';
import type { Course } from '@/lib/types';

export default function CoursesPage() {
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);

  const loadData = () => getCourses().then(setCourses).catch(err => console.error('加载失败:', err));

  useEffect(() => { loadData(); }, []);

  const handleDelete = (course: any) => {
    if (confirm(`确定要删除课程 "${course.name}" 吗？`)) {
      deleteCourse(course._id).then(loadData).catch(err => alert('删除失败'));
    }
  };

  const columns = [
    { key: 'name', label: '课程名称' },
    { key: 'subject', label: '科目',
      render: (val: string) => <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full">{val}</span>
    },
    { key: 'teacherName', label: '授课教师' },
    { key: 'studentNames', label: '学生',
      render: (val: string[]) => (
        <div className="flex gap-1 flex-wrap">
          {val.map((s, i) => <span key={i} className="text-gray-600">{s}{i < val.length-1 ? '、' : ''}</span>)}
        </div>
      )
    },
    { key: 'price', label: '课时费',
      render: (val: number) => <span className="font-medium">¥{val}</span>
    },
    { key: 'classHour', label: '时长/课',
      render: (val: number) => `${val}小时`
    },
    { key: 'totalClasses', label: '总课次' },
    { key: 'totalPrice', label: '总费用',
      render: (_: any, row: any) => <span className="font-medium text-primary-600">¥{(row.price || 0) * (row.totalClasses || 0)}</span>
    },
  ];

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-8">
          <div className="flex items-center justify-between mb-6">
            <p className="text-gray-500">共 {courses.length} 门课程</p>
            <button onClick={() => router.push('/courses/new')}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors">
              ➕ 添加课程
            </button>
          </div>
          <Table columns={columns} data={courses}
            onEdit={(row) => router.push(`/courses/edit?id=${row._id}`)}
            onDelete={handleDelete}
          />
        </main>
      </div>
    </div>
  );
}
