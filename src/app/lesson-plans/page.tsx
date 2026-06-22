'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import Table from '@/components/Table';
import { getLessonPlans, deleteLessonPlan } from '@/lib/api';

const TYPE_LABELS: Record<string, string> = {
  personal: '个人教案',
  group: '集体教案',
};

const TYPE_COLORS: Record<string, string> = {
  personal: 'bg-blue-50 text-blue-700',
  group: 'bg-green-50 text-green-700',
};

const TYPE_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'personal', label: '个人教案' },
  { value: 'group', label: '集体教案' },
];

export default function LessonPlansPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<any[]>([]);
  const [keyword, setKeyword] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const loadData = useCallback((kw?: string, tp?: string) => {
    getLessonPlans(kw, tp).then(setPlans).catch(err => console.error('加载失败:', err));
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDelete = (plan: any) => {
    if (confirm(`确定要删除教案 "${plan.title}" 吗？`)) {
      deleteLessonPlan(plan._id).then(() => loadData(keyword, typeFilter)).catch(err => alert('删除失败'));
    }
  };

  const handleSearch = () => {
    loadData(keyword, typeFilter);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const handleTypeChange = (tp: string) => {
    setTypeFilter(tp);
    loadData(keyword, tp);
  };

  const columns = [
    { key: 'title', label: '标题' },
    {
      key: 'type', label: '类型',
      render: (val: string) => (
        <span className={`px-2 py-0.5 text-xs rounded-full ${TYPE_COLORS[val] || 'bg-gray-50 text-gray-600'}`}>
          {TYPE_LABELS[val] || val || '个人教案'}
        </span>
      )
    },
    { key: 'content', label: '教学内容',
      render: (val: string) => (
        <div className="max-w-md truncate text-gray-500" title={val}>
          {val || '-'}
        </div>
      )
    },
    { key: 'createdAt', label: '创建时间',
      render: (val: string) => val ? new Date(val).toLocaleDateString('zh-CN') : '-'
    },
    { key: 'updatedAt', label: '更新时间',
      render: (val: string) => val ? new Date(val).toLocaleDateString('zh-CN') : '-'
    },
  ];

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={keyword}
                  onChange={e => setKeyword(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="搜索教案标题..."
                  className="w-64 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none text-sm"
                />
                <button
                  onClick={handleSearch}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
                >
                  搜索
                </button>
                {keyword && (
                  <button
                    onClick={() => { setKeyword(''); loadData('', typeFilter); }}
                    className="px-3 py-2 text-gray-500 hover:text-gray-700 text-sm"
                  >
                    清空
                  </button>
                )}
              </div>

              {/* 类型筛选标签 */}
              <div className="flex items-center gap-1 ml-4 border-l border-gray-200 pl-4">
                {TYPE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => handleTypeChange(opt.value)}
                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                      typeFilter === opt.value
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <p className="text-gray-500 text-sm ml-2">共 {plans.length} 个教案</p>
            </div>
            <button
              onClick={() => router.push('/lesson-plans/new')}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              ➕ 新建教案
            </button>
          </div>
          <Table
            columns={columns}
            data={plans}
            onEdit={(row) => router.push(`/lesson-plans/edit?id=${row._id}`)}
            onDelete={handleDelete}
            rowKey="_id"
          />
        </main>
      </div>
    </div>
  );
}
