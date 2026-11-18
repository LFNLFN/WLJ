'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import Table from '@/components/Table';
import { getTrainingPlans, deleteTrainingPlan } from '@/lib/api';

function TrainingPlansListContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const studentId = searchParams.get('studentId') || '';
  const studentName = searchParams.get('studentName') || '';
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = () => {
    setLoading(true);
    getTrainingPlans()
      .then((allPlans: any[]) => {
        if (studentId) {
          // 新计划按 studentId 关联；历史计划没有 studentId 时按姓名兜底
          const filtered = (allPlans || []).filter((p: any) =>
            p.studentId === studentId ||
            (!p.studentId && studentName && p.childName === studentName)
          );
          setPlans(filtered);
        } else {
          setPlans(allPlans || []);
        }
      })
      .catch((err) => console.error('加载失败:', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, [studentId, studentName]);

  const handleDelete = (plan: any) => {
    if (confirm(`确定要删除「${plan.title || '训练计划'}」吗？`)) {
      deleteTrainingPlan(plan._id)
        .then(loadData)
        .catch(() => alert('删除失败'));
    }
  };

  const buildQuery = () => {
    const params = new URLSearchParams();
    if (studentId) params.set('studentId', studentId);
    if (studentName) params.set('studentName', studentName);
    const query = params.toString();
    return query ? `?${query}` : '';
  };

  const goNewPlan = () => router.push(`/training-plan${buildQuery()}`);

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
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-3">
                {studentId && (
                  <button
                    onClick={() => router.push('/students')}
                    className="text-gray-400 hover:text-gray-600 text-sm"
                  >
                    ← 返回学生管理
                  </button>
                )}
                <h2 className="text-2xl font-bold text-gray-800">
                  {studentName ? `${studentName}的训练计划` : '训练计划'}
                </h2>
              </div>
              <p className="text-gray-500 text-sm mt-1">
                共 {plans.length} 个计划；一个学生可以有多份不同阶段/不同目标的训练计划
              </p>
            </div>
            <button
              onClick={goNewPlan}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              ➕ 新建训练计划
            </button>
          </div>

          {loading ? (
            <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-gray-400">
              加载中...
            </div>
          ) : plans.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
              <p className="text-4xl mb-3">📋</p>
              <p className="text-gray-500 mb-2">该学生暂无训练计划</p>
              <p className="text-gray-400 text-sm mb-4">
                可以先点「新建训练计划」；如果还不确定学生的主要问题，可在编辑页用 AI 生成，并选择「不确定 / 综合发展」模板
              </p>
              <button
                onClick={goNewPlan}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
              >
                ➕ 新建训练计划
              </button>
            </div>
          ) : (
            <Table
              columns={columns}
              data={plans}
              onEdit={(row) => router.push(`/training-plan?id=${row._id}${buildQuery().replace('?', '&')}`)}
              onDelete={handleDelete}
              rowKey="_id"
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default function TrainingPlansListPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center text-gray-400">加载中...</div>}>
      <TrainingPlansListContent />
    </Suspense>
  );
}
