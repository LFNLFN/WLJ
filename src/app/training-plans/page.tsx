'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import Table from '@/components/Table';
import { getTrainingPlans, deleteTrainingPlan } from '@/lib/api';

export default function TrainingPlansListPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<any[]>([]);

  const loadData = () => {
    getTrainingPlans().then(setPlans).catch(err => console.error('加载失败:', err));
  };

  useEffect(() => { loadData(); }, []);

  const handleDelete = (plan: any) => {
    if (confirm(`确定要删除训练计划吗？`)) {
      deleteTrainingPlan(plan._id).then(loadData).catch(err => alert('删除失败'));
    }
  };

  const columns = [
    { key: 'title', label: '计划名称' },
    { key: 'childName', label: '儿童姓名' },
    {
      key: 'createdAt', label: '创建时间',
      render: (val: string) => val ? new Date(val).toLocaleDateString('zh-CN') : '-'
    },
    {
      key: 'updatedAt', label: '更新时间',
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
            <p className="text-gray-500">共 {plans.length} 个训练计划</p>
            <button onClick={() => router.push('/training-plan')}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors">
              ➕ 新建训练计划
            </button>
          </div>
          <Table
            columns={columns}
            data={plans}
            onEdit={(row) => router.push(`/training-plan?id=${row._id}`)}
            onDelete={handleDelete}
            rowKey="_id"
          />
        </main>
      </div>
    </div>
  );
}
