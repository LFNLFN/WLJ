'use client';

import { useEffect, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import Card from '@/components/Card';

type SyncRecord = {
  id: string;
  studentName: string;
  scaleName: string;
  category: string;
  evaluator: string;
  evaluationDate: string;
  source: string;
  summary: string;
  status: string;
  createdAt: string;
};

type SyncStatus = {
  dbType: string;
  syncedCount: number;
  recentSyncs: SyncRecord[];
};

export default function ScaleSyncPage() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');

  const loadStatus = () => {
    setLoading(true);
    setError('');
    fetch('/api/weapp-sync/status')
      .then(res => res.json())
      .then(data => {
        setStatus(data);
        setLoading(false);
      })
      .catch(err => {
        setError(`加载失败: ${err.message}`);
        setLoading(false);
      });
  };

  useEffect(() => { loadStatus(); }, []);

  const handleSyncNow = () => {
    setSyncing(true);
    setError('');
    // 触发同步（这里模拟，实际需要用户在小程序端操作）
    // 或者直接通过小程序发请求已保存的数据
    fetch('/api/weapp-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reports: [] }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          alert(`同步完成: ${data.synced} 条成功, ${data.failed} 条失败`);
          loadStatus();
        } else {
          setError(`同步失败: ${data.error}`);
        }
        setSyncing(false);
      })
      .catch(err => {
        setError(`同步请求失败: ${err.message}`);
        setSyncing(false);
      });
  };

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold text-gray-800 mb-2">📱 微信小程序数据同步</h2>
            <p className="text-gray-500 mb-6">
              将微信小程序「未来家评估助手」中的评估记录同步到本系统
            </p>

            {/* 状态卡片 */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <Card title="数据库类型" value={status?.dbType || '-'} icon="🗄️" color="bg-gray-50" />
              <Card title="已同步记录" value={status?.syncedCount ?? '-'} icon="📊" color="bg-blue-50" />
              <Card title="评估量表" value="4 个" icon="📋" color="bg-purple-50" subtitle="感统+TML量表" />
              <Card title="同步入口" value="小程序端" icon="📱" color="bg-green-50" subtitle="在历史记录页点击同步" />
            </div>

            {/* 操作说明 */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
              <h3 className="text-lg font-semibold text-gray-700 mb-4">📖 同步说明</h3>
              <div className="space-y-3 text-sm text-gray-600">
                <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                  <span className="text-blue-500 font-bold">1</span>
                  <div>
                    <p className="font-medium text-gray-700">在微信小程序完成评估</p>
                    <p className="text-gray-500">打开「未来家评估助手」小程序，完成感觉统合或TML量表评估</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg">
                  <span className="text-green-500 font-bold">2</span>
                  <div>
                    <p className="font-medium text-gray-700">自动同步到本系统</p>
                    <p className="text-gray-500">每次完成评估后，数据会自动同步到本系统的评估记录中</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-orange-50 rounded-lg">
                  <span className="text-orange-500 font-bold">3</span>
                  <div>
                    <p className="font-medium text-gray-700">手动批量同步</p>
                    <p className="text-gray-500">
                      在微信小程序的「历史记录」页面，点击右上角的「同步」按钮可批量同步所有记录
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-purple-50 rounded-lg">
                  <span className="text-purple-500 font-bold">4</span>
                  <div>
                    <p className="font-medium text-gray-700">查看同步结果</p>
                    <p className="text-gray-500">同步后，可在「量表评估记录」页面查看和管理已同步的数据</p>
                  </div>
                </div>
              </div>
            </div>

            {/* 同步状态 */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-700">🔄 最近同步记录</h3>
                <button
                  onClick={handleSyncNow}
                  disabled={syncing}
                  className="px-4 py-2 bg-[#F08020] text-white text-sm rounded-lg hover:bg-[#D06010] transition-colors disabled:opacity-50"
                >
                  {syncing ? '同步中...' : '🔄 手动同步'}
                </button>
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg">
                  ⚠️ {error}
                </div>
              )}

              {loading ? (
                <div className="text-center py-8 text-gray-400">加载中...</div>
              ) : !status || status.recentSyncs.length === 0 ? (
                <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                  <p className="text-gray-400">暂无同步记录</p>
                  <p className="text-gray-300 text-sm mt-1">请在微信小程序中完成评估后同步</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-2 text-gray-500 font-medium">学生姓名</th>
                        <th className="text-left py-3 px-2 text-gray-500 font-medium">量表</th>
                        <th className="text-left py-3 px-2 text-gray-500 font-medium">类别</th>
                        <th className="text-left py-3 px-2 text-gray-500 font-medium">评估人</th>
                        <th className="text-left py-3 px-2 text-gray-500 font-medium">评估日期</th>
                        <th className="text-left py-3 px-2 text-gray-500 font-medium">同步时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {status.recentSyncs.map((record, idx) => (
                        <tr key={record.id || idx} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-3 px-2 font-medium">{record.studentName}</td>
                          <td className="py-3 px-2">{record.scaleName}</td>
                          <td className="py-3 px-2">
                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                              {record.category}
                            </span>
                          </td>
                          <td className="py-3 px-2 text-gray-500">{record.evaluator || '-'}</td>
                          <td className="py-3 px-2 text-gray-500">
                            {record.evaluationDate ? new Date(record.evaluationDate).toLocaleDateString('zh-CN') : '-'}
                          </td>
                          <td className="py-3 px-2 text-gray-400">
                            {record.createdAt ? new Date(record.createdAt).toLocaleString('zh-CN') : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
