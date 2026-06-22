'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import Table from '@/components/Table';
import { getLessonPlans, deleteLessonPlan } from '@/lib/api';

export default function LessonPlansPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<any[]>([]);
  const [keyword, setKeyword] = useState('');

  const loadData = useCallback((kw?: string) => {
    getLessonPlans(kw).then(setPlans).catch(err => console.error('加载失败:', err));
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDelete = (plan: any) => {
    if (confirm(`确定要删除教案 "${plan.title}" 吗？`)) {
      deleteLessonPlan(plan._id).then(() => loadData(keyword)).catch(err => alert('删除失败'));
    }
  };

  const handleSearch = () => {
    loadData(keyword);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const columns = [
    { key: 'title', label: '标题' },
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
                    onClick={() => { setKeyword(''); loadData(); }}
                    className="px-3 py-2 text-gray-500 hover:text-gray-700 text-sm"
                  >
                    清空
                  </button>
                )}
              </div>
              <p className="text-gray-500 text-sm">共 {plans.length} 个教案</p>
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
