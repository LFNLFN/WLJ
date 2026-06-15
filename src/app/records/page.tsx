'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import Table from '@/components/Table';
import Card from '@/components/Card';
import { getClassRecords, deleteClassRecord } from '@/lib/api';
import { formatDate } from '@/lib/utils';


export default function RecordsPage() {
  const router = useRouter();
  const [records, setRecords] = useState<any[]>([]);

  const loadData = () => getClassRecords().then(setRecords).catch(err => console.error('加载失败:', err));

  useEffect(() => { loadData(); }, []);

  const handleDelete = (record: any) => {
    if (confirm(`确定要删除这条上课记录吗？`)) {
      deleteClassRecord(record._id).then(loadData).catch(err => alert('删除失败'));
    }
  };

  const completed = records.filter(r => r.status === 'completed').length;
  const totalIncome = records
    .filter(r => r.status === 'completed')
    .reduce((sum, r) => sum + (r.duration * 100), 0);

  const columns = [
    { key: 'date', label: '日期', render: (val: string) => formatDate(val) },
    { key: 'courseName', label: '课程' },
    { key: 'studentName', label: '学生' },
    { key: 'teacherName', label: '教师' },
    { key: 'startTime', label: '开始时间' },
    { key: 'endTime', label: '结束时间' },
    { key: 'duration', label: '时长', render: (val: number) => `${val}小时` },
    { key: 'content', label: '教学内容',
      render: (val: string) => (
        <span className="max-w-[200px] inline-block truncate" title={val}>{val || '-'}</span>
      )
    },
    { key: 'status', label: '状态',
      render: (val: string) => {
        const map: { [key: string]: { label: string, color: string } } = {
          'completed': { label: '已完成', color: 'bg-green-100 text-green-800' },
          'cancelled': { label: '已取消', color: 'bg-red-100 text-red-800' },
          'pending': { label: '待确认', color: 'bg-yellow-100 text-yellow-800' },
        };
        const s = map[val] || { label: val, color: 'bg-gray-100 text-gray-800' };
        return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.color}`}>{s.label}</span>;
      }
    },
  ];

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card title="总记录数" value={records.length} icon="📝" color="bg-blue-50" />
            <Card title="已完成课程" value={completed} icon="✅" color="bg-green-50" />
            <Card title="预估收入" value={`约¥${totalIncome}`} icon="💰" color="bg-yellow-50" />
          </div>

          <div className="flex items-center justify-between mb-6">
            <p className="text-gray-500">共 {records.length} 条记录</p>
            <button onClick={() => router.push('/records/new')}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors">
              ➕ 添加上课记录
            </button>
          </div>

          <Table columns={columns} data={records}
            onEdit={(row) => router.push(`/records/edit?id=${row._id}`)}
            onDelete={handleDelete}
          />
        </main>
      </div>
    </div>
  );
}
