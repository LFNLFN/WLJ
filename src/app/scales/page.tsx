'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import Table from '@/components/Table';
import Card from '@/components/Card';
import { getScaleTemplates, deleteScaleTemplate } from '@/lib/api';

type ScaleField = {
  id: string;
  label: string;
  type: 'score' | 'select' | 'text' | 'date';
  options?: string[];
  unit?: string;
  sortOrder: number;
};

type ScaleTemplate = {
  _id: string;
  id: string;
  name: string;
  category: string;
  description: string;
  fields: ScaleField[];
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
  '其他': 'bg-gray-100 text-gray-700',
};

export default function ScalesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<ScaleTemplate[]>([]);

  const loadData = () => {
    getScaleTemplates()
      .then(setTemplates)
      .catch(err => console.error('加载量表失败:', err));
  };

  useEffect(() => { loadData(); }, []);

  const handleDelete = (template: ScaleTemplate) => {
    if (confirm(`确定要删除量表 "${template.name}" 吗？`)) {
      deleteScaleTemplate(template._id || template.id)
        .then(loadData)
        .catch(err => alert('删除失败'));
    }
  };

  const columns = [
    { key: 'name', label: '量表名称' },
    {
      key: 'category',
      label: '类别',
      render: (val: string) => (
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${categoryColors[val] || categoryColors['其他']}`}>
          {val || '其他'}
        </span>
      ),
    },
    {
      key: 'fields',
      label: '评估维度',
      render: (val: ScaleField[]) => (
        <span className="text-gray-500">{val ? `${val.length} 项` : '0 项'}</span>
      ),
    },
    { key: 'description', label: '描述' },
    {
      key: 'createdAt',
      label: '创建时间',
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
              <h2 className="text-2xl font-bold text-gray-800">量表管理</h2>
              <p className="text-gray-500 text-sm mt-1">管理评估量表模板，为学生创建评估记录</p>
            </div>
            <button
              onClick={() => router.push('/scales/new')}
              className="px-4 py-2 bg-[#F08020] text-white rounded-lg hover:bg-[#D06010] transition-colors"
            >
              ➕ 新建量表
            </button>
          </div>

          {/* 统计卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card title="量表总数" value={templates.length} icon="📋" color="bg-purple-50" />
            <Card title="智力类" value={templates.filter(t => t.category === '智力').length} icon="🧠" color="bg-purple-50" />
            <Card title="感统类" value={templates.filter(t => t.category === '感统').length} icon="🤸" color="bg-blue-50" />
            <Card title="语言类" value={templates.filter(t => t.category === '语言').length} icon="🗣️" color="bg-green-50" />
          </div>

          <Table
            columns={columns}
            data={templates}
            onEdit={(row) => router.push(`/scales/edit?id=${row._id || row.id}`)}
            onDelete={handleDelete}
            rowKey="id"
          />
        </main>
      </div>
    </div>
  );
}
