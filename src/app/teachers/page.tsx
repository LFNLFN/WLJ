'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import Table from '@/components/Table';
import { getTeachers, deleteTeacher } from '@/lib/api';

// 简单的客户端缓存（避免重复请求）
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5分钟缓存

export default function TeachersPage() {
  const router = useRouter();
  const [teachers, setTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const loadData = useCallback(async (force = false) => {
    // 检查缓存
    if (!force) {
      const cached = cache.get('teachers');
      if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        setTeachers(cached.data);
        setLoading(false);
        return;
      }
    }

    try {
      setLoading(true);
      setError(null);
      const data = await getTeachers();
      
      if (mountedRef.current) {
        setTeachers(data);
        // 写入缓存
        cache.set('teachers', { data, timestamp: Date.now() });
      }
    } catch (err: any) {
      if (mountedRef.current) {
        setError(err.message || '加载失败，请重试');
        console.error('加载教师列表失败:', err);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    loadData();
    return () => { mountedRef.current = false; };
  }, [loadData]);

  const handleDelete = useCallback(async (teacher: any) => {
    if (!confirm(`确定要删除教师 "${teacher.name}" 吗？`)) return;
    
    try {
      await deleteTeacher(teacher._id);
      // 清除缓存并重新加载
      cache.delete('teachers');
      loadData(true);
    } catch (err) {
      alert('删除失败，请重试');
    }
  }, [loadData]);

  const columns = [
    { key: 'name', label: '姓名' },
    { key: 'gender', label: '性别',
      render: (val: string) => val || '-'
    },
    { key: 'phone', label: '电话' },
    { key: 'hireDate', label: '入职时间',
      render: (val: string) => val ? new Date(val).toLocaleDateString('zh-CN') : '-'
    },
    { key: 'rank', label: '职级',
      render: (val: string) => val ? (
        <span className="px-2 py-0.5 bg-purple-50 text-purple-700 text-xs rounded-full">{val}</span>
      ) : '-'
    },
    { key: 'createdAt', label: '添加时间',
      render: (val: string) => new Date(val).toLocaleDateString('zh-CN')
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
              <p className="text-gray-500">
                {loading ? '加载中...' : `共 ${teachers.length} 位教师`}
              </p>
              <button
                onClick={() => { cache.delete('teachers'); loadData(true); }}
                className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                title="刷新数据"
              >
                🔄 刷新
              </button>
            </div>
            <button
              onClick={() => router.push('/teachers/new')}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              ➕ 添加教师
            </button>
          </div>

          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
              ❌ {error}
              <button
                onClick={() => { cache.delete('teachers'); loadData(true); }}
                className="ml-3 underline hover:no-underline"
              >
                重试
              </button>
            </div>
          )}

          <Table
            columns={columns}
            data={teachers}
            onEdit={(row) => router.push(`/teachers/edit?id=${row._id}`)}
            onDelete={handleDelete}
            rowKey="_id"
          />
        </main>
      </div>
    </div>
  );
}
