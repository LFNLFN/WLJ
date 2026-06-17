'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { getStudent, getStudentScaleRecords } from '@/lib/api';

type ScaleScore = {
  fieldId: string;
  fieldLabel: string;
  value: string | number;
  remark?: string;
};

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
  scores: ScaleScore[];
  summary: string;
  recommendations: string;
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

const categoryIcons: Record<string, string> = {
  '智力': '🧠',
  '感统': '🤸',
  '语言': '🗣️',
  '行为': '📋',
  '情绪': '💖',
  '注意力': '🎯',
  '社交': '👥',
  '其他': '📌',
};

export default function StudentAssessmentsPage() {
  const router = useRouter();
  const [studentId, setStudentId] = useState('');
  const [student, setStudent] = useState<any>(null);
  const [allRecords, setAllRecords] = useState<StudentScaleRecord[]>([]);
  const [selectedScaleId, setSelectedScaleId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sid = params.get('studentId') || '';
    setStudentId(sid);

    if (!sid) {
      setLoading(false);
      return;
    }

    const loadData = async () => {
      try {
        const [studentData, recordsData] = await Promise.all([
          getStudent(sid),
          getStudentScaleRecords(),
        ]);
        setStudent(studentData);

        const studentRecords = (recordsData || []).filter(
          (r: any) => (r.studentId === sid || r._id === sid)
        );
        setAllRecords(studentRecords);

        if (studentRecords.length > 0) {
          setSelectedScaleId(studentRecords[0]._id || studentRecords[0].id);
        }
      } catch (err) {
        console.error('加载失败:', err);
      }
      setLoading(false);
    };

    if (typeof window !== 'undefined') {
      loadData();
    }
  }, []);

  const selectedRecord = allRecords.find(
    r => (r._id || r.id) === selectedScaleId
  );

  // 按量表名称分组
  const scaleGroups = allRecords.reduce<Record<string, StudentScaleRecord[]>>((acc, record) => {
    const key = record.scaleName;
    if (!acc[key]) acc[key] = [];
    acc[key].push(record);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="flex h-screen">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <main className="flex-1 overflow-y-auto p-8">
            <div className="text-center py-12 text-gray-400">加载中...</div>
          </main>
        </div>
      </div>
    );
  }

  if (!studentId) {
    return (
      <div className="flex h-screen">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <main className="flex-1 overflow-y-auto p-8">
            <div className="text-center py-12">
              <p className="text-4xl mb-4">👤</p>
              <p className="text-gray-400 text-lg">请从学生管理中选择一个学生查看评估结果</p>
              <button
                onClick={() => router.push('/students')}
                className="mt-4 px-4 py-2 bg-[#F08020] text-white rounded-lg hover:bg-[#D06010] transition-colors"
              >
                返回学生管理
              </button>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-8">
          {/* 页面标题 */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => router.push('/students')}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                  title="返回学生列表"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <h2 className="text-2xl font-bold text-gray-800">
                  学生量表评估
                </h2>
              </div>
              <p className="text-gray-500 text-sm mt-1 ml-9">
                查看 {student?.name || '该学生'} 的所有量表评估记录
              </p>
            </div>
            <button
              onClick={() => router.push(`/scales/records/new?studentId=${studentId}`)}
              className="px-4 py-2 bg-[#F08020] text-white rounded-lg hover:bg-[#D06010] transition-colors"
            >
              ➕ 新建评估
            </button>
          </div>

          {/* 学生信息卡片 */}
          {student && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
              <div className="flex items-center gap-6">
                <div className="w-14 h-14 rounded-full bg-[#FFF0E0] flex items-center justify-center text-2xl">
                  👦
                </div>
                <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-gray-400">姓名</p>
                    <p className="text-sm font-medium text-gray-800">{student.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">年级</p>
                    <p className="text-sm font-medium text-gray-800">{student.grade || '未设置'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">家长姓名</p>
                    <p className="text-sm font-medium text-gray-800">{student.parentName || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">家长电话</p>
                    <p className="text-sm font-medium text-gray-800">{student.parentPhone || '-'}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 评估概览统计 */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <p className="text-sm text-gray-500">评估总次数</p>
              <p className="text-2xl font-bold text-gray-800">{allRecords.length}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <p className="text-sm text-gray-500">已完成</p>
              <p className="text-2xl font-bold text-green-600">
                {allRecords.filter(r => r.status === 'completed').length}
              </p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <p className="text-sm text-gray-500">量表种类</p>
              <p className="text-2xl font-bold text-purple-600">{Object.keys(scaleGroups).length}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <p className="text-sm text-gray-500">最近评估</p>
              <p className="text-sm font-medium text-gray-700 mt-1">
                {allRecords.length > 0
                  ? new Date(allRecords[0].evaluationDate).toLocaleDateString('zh-CN')
                  : '暂无'}
              </p>
            </div>
          </div>

          {allRecords.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
              <p className="text-4xl mb-3">📋</p>
              <p className="text-gray-400 text-lg mb-2">暂无评估记录</p>
              <p className="text-gray-400 text-sm mb-4">点击"新建评估"为该学生创建量表评估</p>
              <button
                onClick={() => router.push(`/scales/records/new?studentId=${studentId}`)}
                className="px-4 py-2 bg-[#F08020] text-white rounded-lg hover:bg-[#D06010] transition-colors"
              >
                ➕ 新建评估
              </button>
            </div>
          ) : (
            <div className="flex gap-6">
              {/* ===== 左侧：档案列表 ===== */}
              <div className="w-80 flex-shrink-0">
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="p-4 border-b border-gray-100">
                    <h3 className="text-sm font-semibold text-gray-700">评估档案</h3>
                    <p className="text-xs text-gray-400 mt-1">共 {allRecords.length} 份档案，点击查看详情</p>
                  </div>

                  {/* 按量表类型分组显示 */}
                  <div className="divide-y divide-gray-50 max-h-[calc(100vh-350px)] overflow-y-auto">
                    {Object.entries(scaleGroups).map(([scaleName, records]) => {
                      const category = records[0]?.category || '其他';
                      const icon = categoryIcons[category] || '📌';
                      const isGroupActive = records.some(r => (r._id || r.id) === selectedScaleId);

                      return (
                        <div key={scaleName} className={`${isGroupActive ? 'bg-[#FFF8F0]' : ''}`}>
                          {/* 量表名称标题 */}
                          <div className="px-4 py-2.5 flex items-center gap-2 bg-gray-50/50">
                            <span className="text-sm">{icon}</span>
                            <span className="text-xs font-medium text-gray-600">{scaleName}</span>
                            <span className="text-[10px] text-gray-400 ml-auto">{records.length} 次</span>
                          </div>

                          {/* 该量表下的每次评估记录 */}
                          {records.map((record) => {
                            const isSelected = (record._id || record.id) === selectedScaleId;
                            return (
                              <button
                                key={record._id || record.id}
                                onClick={() => setSelectedScaleId(record._id || record.id)}
                                className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors border-l-2 ${
                                  isSelected
                                    ? 'border-[#F08020] bg-[#FFF0E0]'
                                    : 'border-transparent hover:bg-gray-50'
                                }`}
                              >
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                                  isSelected ? 'bg-[#F08020] text-white' : 'bg-gray-100 text-gray-400'
                                }`}>
                                  {records.length - records.indexOf(record)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className={`text-xs font-medium truncate ${isSelected ? 'text-[#F08020]' : 'text-gray-700'}`}>
                                    {new Date(record.evaluationDate).toLocaleDateString('zh-CN')}
                                  </p>
                                  <p className="text-[10px] text-gray-400 truncate">
                                    {record.evaluator || '未填评估人'}
                                    {' · '}
                                    <span className={record.status === 'completed' ? 'text-green-500' : 'text-yellow-500'}>
                                      {record.status === 'completed' ? '已完成' : '草稿'}
                                    </span>
                                  </p>
                                </div>
                                <svg className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-[#F08020]' : 'text-gray-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* ===== 右侧：评估详情 ===== */}
              <div className="flex-1 min-w-0">
                {selectedRecord ? (
                  <div className="space-y-6">
                    {/* 评估基本信息 */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <h3 className="text-lg font-semibold text-gray-800">
                            {selectedRecord.scaleName}
                          </h3>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            categoryColors[selectedRecord.category] || 'bg-gray-100 text-gray-700'
                          }`}>
                            {selectedRecord.category}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            selectedRecord.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                          }`}>
                            {selectedRecord.status === 'completed' ? '已完成' : '草稿'}
                          </span>
                        </div>
                        <button
                          onClick={() => router.push(`/scales/records/edit?id=${selectedRecord._id || selectedRecord.id}`)}
                          className="px-3 py-1.5 text-[#F08020] hover:bg-[#FFF0E0] rounded-lg transition-colors text-sm flex items-center gap-1"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          编辑
                        </button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-gray-400">评估人：</span>
                          <span className="text-gray-700 font-medium">{selectedRecord.evaluator || '未记录'}</span>
                        </div>
                        <div>
                          <span className="text-gray-400">评估日期：</span>
                          <span className="text-gray-700 font-medium">
                            {new Date(selectedRecord.evaluationDate).toLocaleDateString('zh-CN')}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-400">记录时间：</span>
                          <span className="text-gray-700 font-medium">
                            {new Date(selectedRecord.createdAt).toLocaleDateString('zh-CN')}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 各维度得分 */}
                    {selectedRecord.scores && selectedRecord.scores.length > 0 && (
                      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                        <h3 className="text-base font-semibold text-gray-700 mb-4 flex items-center gap-2">
                          <svg className="w-5 h-5 text-[#F08020]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                          </svg>
                          评估维度得分
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {selectedRecord.scores.map((score, idx) => (
                            <div key={score.fieldId || idx} className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                              <span className="text-sm text-gray-400 w-6">{idx + 1}.</span>
                              <span className="text-sm font-medium text-gray-700 flex-1">{score.fieldLabel}</span>
                              <div className="text-right">
                                <span className="text-lg font-bold text-[#F08020]">{score.value}</span>
                                {typeof score.value === 'number' && (
                                  <span className="text-xs text-gray-400 ml-0.5">分</span>
                                )}
                              </div>
                              {score.remark && (
                                <span className="text-[10px] text-gray-400 italic max-w-[100px] truncate" title={score.remark}>
                                  {score.remark}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 评估结论与建议 */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {selectedRecord.summary && (
                        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                          <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                            <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            综合评估结论
                          </h3>
                          <div className="bg-green-50 rounded-lg p-4">
                            <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">
                              {selectedRecord.summary}
                            </p>
                          </div>
                        </div>
                      )}
                      {selectedRecord.recommendations && (
                        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                          <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                            <svg className="w-5 h-5 text-[#F08020]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            康复建议
                          </h3>
                          <div className="bg-[#FFF5F0] rounded-lg p-4">
                            <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">
                              {selectedRecord.recommendations}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
                    <p className="text-4xl mb-3">📂</p>
                    <p className="text-gray-400">请在左侧选择一份评估档案查看详情</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
