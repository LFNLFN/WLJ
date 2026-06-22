'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import Table from '@/components/Table';
import { getClassRecords, deleteClassRecord, getCourse } from '@/lib/api';

const TYPE_LABELS: Record<string, string> = {
  personal: '个人课程',
  group: '集体课程',
};

function RecordsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const courseId = searchParams.get('courseId');

  const [records, setRecords] = useState<any[]>([]);
  const [courseName, setCourseName] = useState('');

  const loadData = () => {
    getClassRecords().then(allRecords => {
      if (courseId) {
        setRecords(allRecords.filter((r: any) => r.courseId === courseId));
        // 获取课程名称
        getCourse(courseId).then(c => {
          if (c) setCourseName(c.name);
        }).catch(() => {});
      } else {
        setRecords(allRecords);
      }
    }).catch(err => console.error('加载失败:', err));
  };

  useEffect(() => { loadData(); }, [courseId]);

  const handleDelete = (record: any) => {
    if (confirm(`确定要删除这条上课记录吗？`)) {
      deleteClassRecord(record._id).then(loadData).catch(err => alert('删除失败'));
    }
  };

  const columns = [
    { key: 'date', label: '上课日期',
      render: (val: string) => val ? new Date(val).toLocaleDateString('zh-CN') : '-'
    },
    { key: 'courseName', label: '课程' },
    { key: 'teacherName', label: '上课老师' },
    { key: 'studentName', label: '上课学生' },
    { key: 'startTime', label: '开始时间' },
    { key: 'endTime', label: '结束时间' },
    { key: 'duration', label: '时长',
      render: (val: number) => `${val}小时`
    },
    { key: 'content', label: '教学内容',
      render: (val: string) => (
        <span className="max-w-[200px] inline-block truncate" title={val}>{val || '-'}</span>
      )
    },
  ];

  return (
    <main className="flex-1 overflow-y-auto p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          {courseId && courseName ? (
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/courses')}
                className="text-gray-400 hover:text-gray-600"
              >
                ← 返回课程
              </button>
              <h2 className="text-lg font-semibold text-gray-800">{courseName} - 上课记录</h2>
            </div>
          ) : (
            <p className="text-gray-500">共 {records.length} 条上课记录</p>
          )}
        </div>
        {courseId && (
          <button
            onClick={() => router.push(`/records/new?courseId=${courseId}`)}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            ➕ 添加上课记录
          </button>
        )}
      </div>

      <Table
        columns={columns}
        data={records}
        onEdit={(row) => router.push(`/records/edit?id=${row._id}`)}
        onDelete={handleDelete}
      />
    </main>
  );
}

export default function RecordsPage() {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <Suspense fallback={<div className="flex-1 p-8 text-center text-gray-400">加载中...</div>}>
          <RecordsContent />
        </Suspense>
      </div>
    </div>
  );
}
