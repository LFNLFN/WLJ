'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import Table from '@/components/Table';
import { getStudents, saveStudent, deleteStudent } from '@/lib/api';
import type { Student } from '@/lib/types';

// 智障儿童康复档案扩展字段
interface RehabilitationRecord {
  id: string;
  studentId: string;
  studentName: string;
  gender: string;
  birthDate: string;         // 出生日期
  age: number;
  idNumber: string;          // 身份证号码
  diagnosis: string;         // 诊断结果
  disabilityLevel: string;   // 残障等级
  iqScore: string;           // 智商评分
  institution: string;       // 康复机构
  guardian: string;          // 监护人
  phone: string;
  address: string;
  admissionDate: string;     // 入院日期
  medicalHistory: string;    // 病史
  treatmentPlan: string;     // 治疗方案
  progress: string;          // 康复进展
  status: string;            // 状态: 在训/结业/转介
  createdAt: string;
}

export default function MentalRetardationPage() {
  const router = useRouter();
  const [records, setRecords] = useState<RehabilitationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editRecord, setEditRecord] = useState<RehabilitationRecord | null>(null);

  // --- 搜索条件 ---
  const [searchName, setSearchName] = useState('');           // 姓名模糊搜索
  const [searchIdNumber, setSearchIdNumber] = useState('');   // 身份证模糊搜索
  const [searchInstitution, setSearchInstitution] = useState(''); // 康复机构模糊搜索
  const [birthDateStart, setBirthDateStart] = useState('');   // 出生日期范围-开始
  const [birthDateEnd, setBirthDateEnd] = useState('');       // 出生日期范围-结束

  const [formData, setFormData] = useState({
    studentName: '',
    gender: '男',
    birthDate: '',
    idNumber: '',
    age: '',
    diagnosis: '',
    disabilityLevel: '',
    iqScore: '',
    institution: '',
    guardian: '',
    phone: '',
    address: '',
    admissionDate: '',
    medicalHistory: '',
    treatmentPlan: '',
    progress: '',
    status: '在训',
  });

  // 从 localStorage 加载康复档案数据
  const loadRecords = () => {
    try {
      const data = localStorage.getItem('rehabilitation_mental_retardation');
      if (data) {
        setRecords(JSON.parse(data));
      }
    } catch (err) {
      console.error('加载康复档案失败:', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadRecords();
  }, []);

  // 保存到 localStorage
  const saveRecords = (newRecords: RehabilitationRecord[]) => {
    localStorage.setItem('rehabilitation_mental_retardation', JSON.stringify(newRecords));
    setRecords(newRecords);
  };

  // 根据出生日期计算年龄
  const calculateAge = (birthDate: string): number => {
    if (!birthDate) return 0;
    const birth = new Date(birthDate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  // 高级搜索过滤
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      // 姓名模糊搜索
      if (searchName.trim()) {
        const keyword = searchName.trim().toLowerCase();
        if (!r.studentName.toLowerCase().includes(keyword)) return false;
      }

      // 身份证号码模糊搜索
      if (searchIdNumber.trim()) {
        const keyword = searchIdNumber.trim().toLowerCase();
        if (!r.idNumber.toLowerCase().includes(keyword)) return false;
      }

      // 康复机构模糊搜索
      if (searchInstitution.trim()) {
        const keyword = searchInstitution.trim().toLowerCase();
        if (!r.institution.toLowerCase().includes(keyword)) return false;
      }

      // 出生日期范围搜索
      if (birthDateStart && r.birthDate) {
        if (new Date(r.birthDate) < new Date(birthDateStart)) return false;
      }
      if (birthDateEnd && r.birthDate) {
        if (new Date(r.birthDate) > new Date(birthDateEnd)) return false;
      }

      return true;
    });
  }, [records, searchName, searchIdNumber, searchInstitution, birthDateStart, birthDateEnd]);

  // 是否有任何搜索条件
  const hasSearchCriteria = searchName || searchIdNumber || searchInstitution || birthDateStart || birthDateEnd;

  const generateId = () => {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const now = new Date().toISOString();
    const age = formData.birthDate ? calculateAge(formData.birthDate) : Number(formData.age);

    if (editRecord) {
      // 更新
      const updated = records.map((r) =>
        r.id === editRecord.id
          ? { ...r, ...formData, age }
          : r
      );
      saveRecords(updated);
    } else {
      // 新增
      const newRecord: RehabilitationRecord = {
        id: generateId(),
        studentId: `MR${Date.now()}`,
        ...formData,
        age,
        createdAt: now,
      };
      saveRecords([newRecord, ...records]);
    }

    resetForm();
  };

  const resetForm = () => {
    setShowForm(false);
    setEditRecord(null);
    setFormData({
      studentName: '',
      gender: '男',
      birthDate: '',
      idNumber: '',
      age: '',
      diagnosis: '',
      disabilityLevel: '',
      iqScore: '',
      institution: '',
      guardian: '',
      phone: '',
      address: '',
      admissionDate: '',
      medicalHistory: '',
      treatmentPlan: '',
      progress: '',
      status: '在训',
    });
  };

  const handleEdit = (record: RehabilitationRecord) => {
    setEditRecord(record);
    setFormData({
      studentName: record.studentName,
      gender: record.gender,
      birthDate: record.birthDate || '',
      idNumber: record.idNumber || '',
      age: String(record.age || ''),
      diagnosis: record.diagnosis,
      disabilityLevel: record.disabilityLevel,
      iqScore: record.iqScore,
      institution: record.institution || '',
      guardian: record.guardian,
      phone: record.phone,
      address: record.address,
      admissionDate: record.admissionDate,
      medicalHistory: record.medicalHistory,
      treatmentPlan: record.treatmentPlan,
      progress: record.progress,
      status: record.status,
    });
    setShowForm(true);
  };

  const handleDelete = (record: RehabilitationRecord) => {
    if (confirm(`确定要删除 ${record.studentName} 的康复档案吗？`)) {
      const filtered = records.filter((r) => r.id !== record.id);
      saveRecords(filtered);
    }
  };

  const clearAllSearch = () => {
    setSearchName('');
    setSearchIdNumber('');
    setSearchInstitution('');
    setBirthDateStart('');
    setBirthDateEnd('');
  };

  const columns = [
    { key: 'studentName', label: '姓名' },
    { key: 'gender', label: '性别' },
    {
      key: 'birthDate',
      label: '出生日期',
      render: (val: string) => val ? new Date(val).toLocaleDateString('zh-CN') : '-',
    },
    { key: 'age', label: '年龄' },
    { key: 'idNumber', label: '身份证号码' },
    { key: 'diagnosis', label: '诊断结果' },
    {
      key: 'disabilityLevel',
      label: '残障等级',
      render: (val: string) => {
        const colors: Record<string, string> = {
          '一级': 'text-red-600 bg-red-50',
          '二级': 'text-orange-600 bg-orange-50',
          '三级': 'text-yellow-600 bg-yellow-50',
          '四级': 'text-green-600 bg-green-50',
        };
        return (
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[val] || 'text-gray-600 bg-gray-50'}`}>
            {val || '-'}
          </span>
        );
      },
    },
    { key: 'institution', label: '康复机构' },
    { key: 'guardian', label: '监护人' },
    { key: 'phone', label: '联系电话' },
    {
      key: 'status',
      label: '状态',
      render: (val: string) => {
        const colors: Record<string, string> = {
          '在训': 'text-blue-600 bg-blue-50',
          '结业': 'text-green-600 bg-green-50',
          '转介': 'text-purple-600 bg-purple-50',
        };
        return (
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[val] || 'text-gray-600 bg-gray-50'}`}>
            {val}
          </span>
        );
      },
    },
    {
      key: 'admissionDate',
      label: '入院日期',
      render: (val: string) => val ? new Date(val).toLocaleDateString('zh-CN') : '-',
    },
    {
      key: 'createdAt',
      label: '建档时间',
      render: (val: string) => new Date(val).toLocaleDateString('zh-CN'),
    },
  ];

  // 统计
  const totalCount = records.length;
  const activeCount = records.filter((r) => r.status === '在训').length;
  const graduatedCount = records.filter((r) => r.status === '结业').length;
  const referralCount = records.filter((r) => r.status === '转介').length;

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-8">
          {/* 页面标题 */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-800">智障儿童康复档案</h2>
              <p className="text-gray-500 text-sm mt-1">管理和追踪智障儿童的康复训练记录</p>
            </div>
            <Link
              href="/rehabilitation/mental-retardation/new"
              className="px-4 py-2 bg-[#F08020] text-white rounded-lg hover:bg-[#D06010] transition-colors inline-flex items-center gap-2"
            >
              <span>➕</span>
              <span>新建康复档案</span>
            </Link>
          </div>

          {/* 统计卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <p className="text-sm text-gray-500">总档案数</p>
              <p className="text-2xl font-bold text-gray-800">{totalCount}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <p className="text-sm text-gray-500">在训</p>
              <p className="text-2xl font-bold text-blue-600">{activeCount}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <p className="text-sm text-gray-500">结业</p>
              <p className="text-2xl font-bold text-green-600">{graduatedCount}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <p className="text-sm text-gray-500">转介</p>
              <p className="text-2xl font-bold text-purple-600">{referralCount}</p>
            </div>
          </div>

          {/* ========== 高级搜索栏 ========== */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-5 h-5 text-[#F08020]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span className="text-sm font-medium text-gray-700">高级搜索</span>
              {hasSearchCriteria && (
                <span className="text-xs text-gray-400">
                  找到 {filteredRecords.length} 条结果
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {/* 姓名模糊搜索 */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">儿童姓名</label>
                <input
                  type="text"
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                  placeholder="支持模糊查询"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent text-sm"
                />
              </div>

              {/* 出生日期范围搜索 */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">出生日期（开始）</label>
                <input
                  type="date"
                  value={birthDateStart}
                  onChange={(e) => setBirthDateStart(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">出生日期（结束）</label>
                <input
                  type="date"
                  value={birthDateEnd}
                  onChange={(e) => setBirthDateEnd(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent text-sm"
                />
              </div>

              {/* 身份证号码模糊搜索 */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">身份证号码</label>
                <input
                  type="text"
                  value={searchIdNumber}
                  onChange={(e) => setSearchIdNumber(e.target.value)}
                  placeholder="支持模糊查询"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent text-sm"
                />
              </div>

              {/* 康复机构模糊搜索 */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">康复机构</label>
                <input
                  type="text"
                  value={searchInstitution}
                  onChange={(e) => setSearchInstitution(e.target.value)}
                  placeholder="支持模糊查询"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent text-sm"
                />
              </div>
            </div>

            {/* 搜索/重置按钮 */}
            {hasSearchCriteria && (
              <div className="flex justify-end mt-3 pt-3 border-t border-gray-100">
                <button
                  onClick={clearAllSearch}
                  className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  清空所有搜索条件
                </button>
              </div>
            )}
          </div>

          {/* 新增/编辑表单弹窗 */}
          {showForm && (
            <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={(e) => {
              if (e.target === e.currentTarget) resetForm();
            }}>
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto m-4">
                <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-xl">
                  <h3 className="text-lg font-semibold text-gray-800">
                    {editRecord ? '编辑康复档案' : '新建康复档案'}
                  </h3>
                  <button onClick={resetForm} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
                </div>
                <form onSubmit={handleSubmit} className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* 基本信息 */}
                    <div className="md:col-span-2">
                      <h4 className="text-sm font-medium text-gray-500 mb-3 pb-2 border-b">基本信息</h4>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">姓名 <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        required
                        value={formData.studentName}
                        onChange={(e) => setFormData({ ...formData, studentName: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                        placeholder="请输入姓名"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">性别</label>
                      <select
                        value={formData.gender}
                        onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                      >
                        <option value="男">男</option>
                        <option value="女">女</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">出生日期 <span className="text-red-500">*</span></label>
                      <input
                        type="date"
                        required
                        value={formData.birthDate}
                        onChange={(e) => {
                          const birthDate = e.target.value;
                          const age = birthDate ? calculateAge(birthDate) : 0;
                          setFormData({ ...formData, birthDate, age: String(age) });
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">年龄</label>
                      <input
                        type="number"
                        value={formData.age}
                        readOnly
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 text-sm"
                        placeholder="根据出生日期自动计算"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">身份证号码</label>
                      <input
                        type="text"
                        value={formData.idNumber}
                        onChange={(e) => setFormData({ ...formData, idNumber: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                        placeholder="18位身份证号码"
                        maxLength={18}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">入院日期</label>
                      <input
                        type="date"
                        value={formData.admissionDate}
                        onChange={(e) => setFormData({ ...formData, admissionDate: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">康复机构</label>
                      <input
                        type="text"
                        value={formData.institution}
                        onChange={(e) => setFormData({ ...formData, institution: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                        placeholder="所属康复机构名称"
                      />
                    </div>

                    {/* 诊断信息 */}
                    <div className="md:col-span-2 mt-2">
                      <h4 className="text-sm font-medium text-gray-500 mb-3 pb-2 border-b">诊断信息</h4>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">诊断结果</label>
                      <input
                        type="text"
                        value={formData.diagnosis}
                        onChange={(e) => setFormData({ ...formData, diagnosis: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                        placeholder="如：智力发育迟缓、唐氏综合征等"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">残障等级</label>
                      <select
                        value={formData.disabilityLevel}
                        onChange={(e) => setFormData({ ...formData, disabilityLevel: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                      >
                        <option value="">请选择</option>
                        <option value="一级">一级</option>
                        <option value="二级">二级</option>
                        <option value="三级">三级</option>
                        <option value="四级">四级</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">智商评分</label>
                      <input
                        type="text"
                        value={formData.iqScore}
                        onChange={(e) => setFormData({ ...formData, iqScore: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                        placeholder="如：IQ 50-70"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">病史</label>
                      <textarea
                        value={formData.medicalHistory}
                        onChange={(e) => setFormData({ ...formData, medicalHistory: e.target.value })}
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                        placeholder="既往病史、家族遗传史等"
                      />
                    </div>

                    {/* 联系信息 */}
                    <div className="md:col-span-2 mt-2">
                      <h4 className="text-sm font-medium text-gray-500 mb-3 pb-2 border-b">联系信息</h4>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">监护人</label>
                      <input
                        type="text"
                        value={formData.guardian}
                        onChange={(e) => setFormData({ ...formData, guardian: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                        placeholder="监护人姓名"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">联系电话</label>
                      <input
                        type="text"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                        placeholder="联系电话"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">家庭地址</label>
                      <input
                        type="text"
                        value={formData.address}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                        placeholder="家庭地址"
                      />
                    </div>

                    {/* 康复信息 */}
                    <div className="md:col-span-2 mt-2">
                      <h4 className="text-sm font-medium text-gray-500 mb-3 pb-2 border-b">康复信息</h4>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">治疗方案</label>
                      <textarea
                        value={formData.treatmentPlan}
                        onChange={(e) => setFormData({ ...formData, treatmentPlan: e.target.value })}
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                        placeholder="个性化康复治疗方案"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">康复进展</label>
                      <textarea
                        value={formData.progress}
                        onChange={(e) => setFormData({ ...formData, progress: e.target.value })}
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                        placeholder="近期康复训练进展与效果评估"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">状态</label>
                      <select
                        value={formData.status}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                      >
                        <option value="在训">在训</option>
                        <option value="结业">结业</option>
                        <option value="转介">转介</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
                    <button
                      type="button"
                      onClick={resetForm}
                      className="px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      className="px-6 py-2 bg-[#F08020] text-white rounded-lg hover:bg-[#D06010] transition-colors"
                    >
                      {editRecord ? '保存修改' : '创建档案'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* 表格 */}
          {filteredRecords.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
              <p className="text-4xl mb-3">📋</p>
              <p className="text-gray-400">
                {hasSearchCriteria ? '未找到匹配的康复档案' : '暂无康复档案'}
              </p>
              <p className="text-gray-300 text-sm mt-1">
                {hasSearchCriteria ? '试试调整搜索条件' : '点击上方"新建康复档案"按钮添加'}
              </p>
            </div>
          ) : (
            <Table
              columns={columns}
              data={filteredRecords}
              onEdit={handleEdit}
              onDelete={handleDelete}
              rowKey="id"
            />
          )}
        </main>
      </div>
    </div>
  );
}
