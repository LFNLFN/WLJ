'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import Table from '@/components/Table';
import Card from '@/components/Card';
import { getStudentScaleRecords, deleteStudentScaleRecord, getStudents } from '@/lib/api';

type StudentScaleRecord = {
  _id: string;
  id: string;
  studentId: string;
  studentName: string;
  scaleTemplateId: string;
  scaleName: string;
  category: string;
  evaluator: string;
  evaluationDate: string;
  summary: string;
  status: 'draft' | 'completed';
  createdAt: string;
};

const categoryColors: Record<string, string> = {
  '智力': 'bg-purple-100 text-purple-700',
  '感统': 'bg-blue-100 text-blue-700',
  '语言': 'bg-green-100 text-green-700',
  '行为': 'bg-orange-100 text-orange-700',
  '情绪': 'bg-pink-100 text-pink-700',
  '注意力': 'bg-cyan-100 text-cyan-700',
  '社交': 'bg-indigo-100 text-indigo-700',
};

export default function ScaleRecordsPage() {
  const router = useRouter();
  const [records, setRecords] = useState<StudentScaleRecord[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [filterStudentId, setFilterStudentId] = useState('');

  const loadData = () => {
    getStudentScaleRecords()
      .then(setRecords)
      .catch(err => console.error('加载评估记录失败:', err));
    getStudents()
      .then(setStudents)
      .catch(console.error);
  };

  useEffect(() => { loadData(); }, []);

  const handleDelete = (record: StudentScaleRecord) => {
    if (confirm(`确定要删除 ${record.studentName} 的「${record.scaleName}」评估记录吗？`)) {
      deleteStudentScaleRecord(record._id || record.id)
        .then(loadData)
        .catch(err => alert('删除失败'));
    }
  };

  const filteredRecords = filterStudentId
    ? records.filter(r => r.studentId === filterStudentId)
    : records;

  const columns = [
    { key: 'studentName', label: '学生姓名' },
    { key: 'scaleName', label: '量表名称' },
    {
      key: 'category',
      label: '类别',
      render: (val: string) => (
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${categoryColors[val] || 'bg-gray-100 text-gray-700'}`}>
          {val || '其他'}
        </span>
      ),
    },
    { key: 'evaluator', label: '评估人' },
    {
      key: 'evaluationDate',
      label: '评估日期',
      render: (val: string) => val ? new Date(val).toLocaleDateString('zh-CN') : '-',
    },
    {
      key: 'status',
      label: '状态',
      render: (val: string) => (
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
          val === 'completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
        }`}>
          {val === 'completed' ? '已完成' : '草稿'}
        </span>
      ),
    },
    {
      key: 'createdAt',
      label: '记录时间',
      render: (val: string) => new Date(val).toLocaleDateString('zh-CN'),
    },
  ];

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-800">量表评估记录</h2>
              <p className="text-gray-500 text-sm mt-1">查看和管理学生的所有量表评估记录</p>
            </div>
            <button
              onClick={() => router.push('/scales/records/new')}
              className="px-4 py-2 bg-[#F08020] text-white rounded-lg hover:bg-[#D06010] transition-colors"
            >
              ➕ 新建评估
            </button>
          </div>

          {/* 统计卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card title="评估总次数" value={records.length} icon="📊" color="bg-purple-50" />
            <Card title="已完成" value={records.filter(r => r.status === 'completed').length} icon="✅" color="bg-green-50" />
            <Card title="草稿" value={records.filter(r => r.status === 'draft').length} icon="📝" color="bg-yellow-50" />
            <Card title="涉及学生" value={new Set(records.map(r => r.studentId)).size} icon="👦" color="bg-blue-50" />
          </div>

          {/* 筛选 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-gray-700">按学生筛选：</span>
              <select
                value={filterStudentId}
                onChange={e => setFilterStudentId(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent text-sm"
              >
                <option value="">全部学生</option>
                {students.map(s => (
                  <option key={s._id || s.id} value={s._id || s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {filterStudentId && (
                <span className="text-xs text-gray-400">
                  找到 {filteredRecords.length} 条记录
                </span>
              )}
            </div>
          </div>

          <Table
            columns={columns}
            data={filteredRecords}
            onEdit={(row) => router.push(`/scales/records/edit?id=${row._id || row.id}`)}
            onDelete={handleDelete}
            rowKey="id"
          />
        </main>
      </div>
    </div>
  );
}
