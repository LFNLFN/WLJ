'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';

interface RehabilitationRecord {
    id: string;
    studentId: string;
    studentName: string;
    gender: string;
    birthDate: string;
    age: number;
    idNumber: string;
    diagnosis: string;
    disabilityLevel: string;
    iqScore: string;
    institution: string;
    guardian: string;
    phone: string;
    address: string;
    admissionDate: string;
    medicalHistory: string;
    treatmentPlan: string;
    progress: string;
    status: string;
    fileUploads?: { [step: number]: string };
    createdAt: string;
}

export default function NewRehabilitationRecordPage() {
    const router = useRouter();
    const [formData, setFormData] = useState({
        studentName: '',
        gender: '男',
        birthDate: '',
        age: 0,
        idNumber: '',
        diagnosis: '',
        disabilityLevel: '',
        iqScore: '',
        institution: '未来家儿童能力发展中心',
        guardian: '',
        phone: '',
        address: '',
        admissionDate: '',
        medicalHistory: '',
        treatmentPlan: '',
        progress: '',
        status: '在训',
    });
    const [fileUploads, setFileUploads] = useState<{ [step: number]: string }>({});

    const calculateAge = (birthDate: string): number => {
        if (!birthDate) return 0;
        const birth = new Date(birthDate);
        const today = new Date();
        let age = today.getFullYear() - birth.getFullYear();
        const monthDiff = today.getMonth() - birth.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
        return age;
    };

    const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 9);

    const handleInputChange = (field: string, value: any) => {
        if (field === 'birthDate' && value) {
            setFormData(prev => ({ ...prev, [field]: value, age: calculateAge(value) }));
        } else {
            setFormData(prev => ({ ...prev, [field]: value }));
        }
    };

    const handleFileUpload = (step: number) => (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const base64 = (reader.result as string).split(',')[1];
            setFileUploads(prev => ({ ...prev, [step]: base64 }));
        };
        reader.readAsDataURL(file);
    };

    const handleSubmit = async () => {
        if (!formData.studentName.trim() || !formData.birthDate || !formData.admissionDate) {
            alert('请填写必填项：姓名、出生日期、入院日期');
            return;
        }

        const newRecord: RehabilitationRecord = {
            ...formData,
            id: generateId(),
            studentId: `MR${Date.now()}`,
            fileUploads,
            createdAt: new Date().toISOString(),
        };

        try {
            const existing = localStorage.getItem('rehabilitation_mental_retardation');
            const records = existing ? JSON.parse(existing) : [];
            records.unshift(newRecord);
            localStorage.setItem('rehabilitation_mental_retardation', JSON.stringify(records));
            router.push('/rehabilitation/mental-retardation');
        } catch (err) {
            alert('保存失败: ' + (err instanceof Error ? err.message : '未知错误'));
        }
    };

    const steps = [
        { step: 1, label: '入学登记表', file: '01_入学登记表.docx', hasTemplate: true },
        { step: 2, label: '学习能力评估表', file: '', hasTemplate: false },
        { step: 3, label: '结果分析报告', file: '', hasTemplate: false },
        { step: 4, label: '个别化教育计划（IEP）', file: '04_个别化教育计划.docx', hasTemplate: true },
        { step: 5, label: '个别教学记录卡', file: '05_个别教学记录卡.docx', hasTemplate: true },
        { step: 6, label: '学习进度报告表', file: '', hasTemplate: false },
        { step: 7, label: '后续教育跟踪表', file: '07_后续教育跟踪表.doc', hasTemplate: true },
    ];

    return (
        <div className="flex h-screen">
            <Sidebar />
            <div className="flex-1 flex flex-col overflow-hidden">
                <Header />
                <main className="flex-1 overflow-y-auto p-8">
                    <div className="max-w-4xl mx-auto">
                        <div className="mb-8">
                            <h2 className="text-2xl font-bold text-gray-800">新建康复档案</h2>
                            <p className="text-gray-500 text-sm mt-1">填写基本信息和上传各步骤的文档</p>
                        </div>

                        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 mb-6">
                            <h3 className="text-lg font-semibold text-gray-800 mb-6">基本信息</h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        姓名 <span className="text-red-500">*</span>
                                    </label>
                                    <input type="text" value={formData.studentName}
                                        onChange={e => handleInputChange('studentName', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020]"
                                        placeholder="请输入姓名" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">性别</label>
                                    <select value={formData.gender}
                                        onChange={e => handleInputChange('gender', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] bg-white">
                                        <option value="男">男</option>
                                        <option value="女">女</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        出生日期 <span className="text-red-500">*</span>
                                    </label>
                                    <input type="date" value={formData.birthDate}
                                        onChange={e => handleInputChange('birthDate', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020]" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">年龄</label>
                                    <input type="number" value={formData.age} readOnly
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500"
                                        placeholder="自动计算" />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">身份证号码</label>
                                    <input type="text" value={formData.idNumber}
                                        onChange={e => handleInputChange('idNumber', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020]"
                                        placeholder="18位身份证号码" maxLength={18} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        入院日期 <span className="text-red-500">*</span>
                                    </label>
                                    <input type="date" value={formData.admissionDate}
                                        onChange={e => handleInputChange('admissionDate', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020]" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">康复机构</label>
                                    <input type="text" value={formData.institution}
                                        onChange={e => handleInputChange('institution', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020]" />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">诊断结果</label>
                                    <textarea value={formData.diagnosis}
                                        onChange={e => handleInputChange('diagnosis', e.target.value)} rows={2}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020]"
                                        placeholder="如：智力发育迟缓、唐氏综合征等" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">残障等级</label>
                                    <select value={formData.disabilityLevel}
                                        onChange={e => handleInputChange('disabilityLevel', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] bg-white">
                                        <option value="">请选择</option>
                                        <option value="无">无</option>
                                        <option value="一级">一级</option>
                                        <option value="二级">二级</option>
                                        <option value="三级">三级</option>
                                        <option value="四级">四级</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">智商评分</label>
                                    <input type="text" value={formData.iqScore}
                                        onChange={e => handleInputChange('iqScore', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020]"
                                        placeholder="如：IQ 50-70" />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">病史</label>
                                    <textarea value={formData.medicalHistory}
                                        onChange={e => handleInputChange('medicalHistory', e.target.value)} rows={2}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020]"
                                        placeholder="既往病史、家族遗传史等" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">监护人</label>
                                    <input type="text" value={formData.guardian}
                                        onChange={e => handleInputChange('guardian', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020]"
                                        placeholder="监护人姓名" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">联系电话</label>
                                    <input type="text" value={formData.phone}
                                        onChange={e => handleInputChange('phone', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020]"
                                        placeholder="联系电话" />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">家庭地址</label>
                                    <input type="text" value={formData.address}
                                        onChange={e => handleInputChange('address', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020]"
                                        placeholder="家庭地址" />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">康复进展状态</label>
                                    <select value={formData.status}
                                        onChange={e => handleInputChange('status', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] bg-white">
                                        <option value="在训">在训</option>
                                        <option value="结业">结业</option>
                                        <option value="转介">转介</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* 文件上传区域 */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 mb-6">
                            <h3 className="text-lg font-semibold text-gray-800 mb-2">文档上传</h3>
                            <p className="text-sm text-gray-500 mb-4">下载模板填写后重新上传，支持 .docx 格式（可选）</p>
                            <div className="space-y-3">
                                {steps.map(({ step, label, file, hasTemplate }) => (
                                    <div key={step} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                        <div className="flex items-center gap-3">
                                            <span className="text-gray-700">{label}</span>
                                            {fileUploads[step] ? (
                                                <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">已上传</span>
                                            ) : (
                                                <span className="text-xs text-gray-400">未上传</span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {hasTemplate && (
                                                <a href={`/templates/${file}`} download
                                                    className="px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                                                    下载模板
                                                </a>
                                            )}
                                            <label className="px-3 py-1.5 text-sm cursor-pointer bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">
                                                上传
                                                <input type="file" accept=".docx" className="hidden" onChange={handleFileUpload(step)} />
                                            </label>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <button onClick={handleSubmit}
                                className="px-6 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors">
                                💾 保存档案
                            </button>
                            <button onClick={() => router.back()}
                                className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
                                取消
                            </button>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}
