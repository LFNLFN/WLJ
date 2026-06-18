'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import StepsIndicator from '@/components/StepsIndicator';

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

    // 学习能力评估
    assessmentDate?: string;
    listeningAbility?: string;
    speakingAbility?: string;
    readingAbility?: string;
    writingAbility?: string;
    mathAbility?: string;
    selfCareAbility?: string;
    socialAbility?: string;
    assessmentNotes?: string;

    // 结果分析报告
    analysisDate?: string;
    strengthAreas?: string;
    developmentAreas?: string;
    recommendedInterventions?: string;
    followUpPlan?: string;
    reportNotes?: string;

    // 个别化教育计划
    iepDate?: string;
    individualizedEducationPlan?: string;

    // 个别教学记录卡
    teachingRecordDate?: string;
    teachingRecordCard?: string;

    // 学习进度报告表
    progressReportDate?: string;
    learningProgressReport?: string;

    // 后续教育跟踪表
    educationTrackingDate?: string;
    followUpEducationTracking?: string;

    createdAt: string;
}

const STEPS = [
    { id: 1, label: '入学登记表', description: '基本信息与诊断' },
    { id: 2, label: '学习能力评估表', description: '能力评估与测评' },
    { id: 3, label: '结果分析报告', description: '分析与建议' },
    { id: 4, label: '个别化教育计划', description: '教育目标与策略' },
    { id: 5, label: '个别教学记录卡', description: '教学过程记录' },
    { id: 6, label: '学习进度报告表', description: '学习效果追踪' },
    { id: 7, label: '后续教育跟踪表', description: '后续跟进计划' },
];

export default function NewRehabilitationRecordPage() {
    const router = useRouter();
    const [currentStep, setCurrentStep] = useState(1);
    const [formData, setFormData] = useState<RehabilitationRecord>({
        id: '',
        studentId: '',
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
        assessmentDate: new Date().toISOString().split('T')[0],
        listeningAbility: '',
        speakingAbility: '',
        readingAbility: '',
        writingAbility: '',
        mathAbility: '',
        selfCareAbility: '',
        socialAbility: '',
        assessmentNotes: '',
        analysisDate: new Date().toISOString().split('T')[0],
        strengthAreas: '',
        developmentAreas: '',
        recommendedInterventions: '',
        followUpPlan: '',
        reportNotes: '',
        iepDate: new Date().toISOString().split('T')[0],
        individualizedEducationPlan: '',
        teachingRecordDate: new Date().toISOString().split('T')[0],
        teachingRecordCard: '',
        progressReportDate: new Date().toISOString().split('T')[0],
        learningProgressReport: '',
        educationTrackingDate: new Date().toISOString().split('T')[0],
        followUpEducationTracking: '',
        createdAt: new Date().toISOString(),
    });

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

    const generateId = () => {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    };

    const handleInputChange = (field: string, value: any) => {
        if (field === 'birthDate' && value) {
            const age = calculateAge(value);
            setFormData(prev => ({
                ...prev,
                [field]: value,
                age: age,
            }));
        } else {
            setFormData(prev => ({
                ...prev,
                [field]: value,
            }));
        }
    };

    const isStep1Valid = (): boolean => {
        return !!(formData.studentName && formData.birthDate && formData.admissionDate);
    };

    const isStep2Valid = (): boolean => {
        return !!(formData.listeningAbility || formData.speakingAbility || formData.readingAbility);
    };

    const isStep3Valid = (): boolean => {
        return !!(formData.strengthAreas || formData.developmentAreas);
    };

    const handleNext = () => {
        if (currentStep === 1 && !isStep1Valid()) {
            alert('请填写必填项：姓名、出生日期、入院日期');
            return;
        }
        if (currentStep < STEPS.length) {
            setCurrentStep(currentStep + 1);
        }
    };

    const handlePrev = () => {
        if (currentStep > 1) {
            setCurrentStep(currentStep - 1);
        }
    };

    const handleSubmit = async () => {
        const newRecord: RehabilitationRecord = {
            ...formData,
            id: generateId(),
            studentId: `MR${Date.now()}`,
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

    return (
        <div className="flex h-screen">
            <Sidebar />
            <div className="flex-1 flex flex-col overflow-hidden">
                <Header />
                <main className="flex-1 overflow-y-auto p-8">
                    {/* 页面标题 */}
                    <div className="mb-8">
                        <h2 className="text-2xl font-bold text-gray-800">新建康复档案</h2>
                        <p className="text-gray-500 text-sm mt-1">填写档案信息，按步骤完成档案建立流程</p>
                    </div>

                    {/* 步骤条 */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-8">
                        <StepsIndicator
                            steps={STEPS}
                            currentStep={currentStep}
                            onChange={(step) => {
                                // 允许返回上一步，但前进需要验证
                                if (step < currentStep) {
                                    setCurrentStep(step);
                                } else if (step === currentStep + 1) {
                                    handleNext();
                                }
                            }}
                        />
                    </div>

                    {/* 表单内容区域 */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 mb-6">
                        {/* 第一步：入学登记表 */}
                        {currentStep === 1 && (
                            <div className="space-y-6">
                                <div className="border-b pb-4">
                                    <h3 className="text-lg font-semibold text-gray-800">第一步：入学登记表</h3>
                                    <p className="text-sm text-gray-500 mt-1">请填写儿童的基本信息与诊断情况</p>
                                </div>

                                {/* 基本信息 */}
                                <div>
                                    <h4 className="text-sm font-medium text-gray-700 mb-4">基本信息</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                姓名 <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                value={formData.studentName}
                                                onChange={(e) => handleInputChange('studentName', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                                                placeholder="请输入姓名"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">性别</label>
                                            <select
                                                value={formData.gender}
                                                onChange={(e) => handleInputChange('gender', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                                            >
                                                <option value="男">男</option>
                                                <option value="女">女</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                出生日期 <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="date"
                                                value={formData.birthDate}
                                                onChange={(e) => handleInputChange('birthDate', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">年龄</label>
                                            <input
                                                type="number"
                                                value={formData.age}
                                                readOnly
                                                className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500"
                                                placeholder="自动计算"
                                            />
                                        </div>
                                        <div className="md:col-span-2">
                                            <label className="block text-sm font-medium text-gray-700 mb-2">身份证号码</label>
                                            <input
                                                type="text"
                                                value={formData.idNumber}
                                                onChange={(e) => handleInputChange('idNumber', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                                                placeholder="18位身份证号码"
                                                maxLength={18}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                入院日期 <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="date"
                                                value={formData.admissionDate}
                                                onChange={(e) => handleInputChange('admissionDate', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">康复机构</label>
                                            <input
                                                type="text"
                                                value={formData.institution}
                                                onChange={(e) => handleInputChange('institution', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                                                placeholder="所属康复机构"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* 诊断信息 */}
                                <div>
                                    <h4 className="text-sm font-medium text-gray-700 mb-4">诊断信息</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="md:col-span-2">
                                            <label className="block text-sm font-medium text-gray-700 mb-2">诊断结果</label>
                                            <textarea
                                                value={formData.diagnosis}
                                                onChange={(e) => handleInputChange('diagnosis', e.target.value)}
                                                rows={3}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                                                placeholder="如：智力发育迟缓、唐氏综合征等"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">残障等级</label>
                                            <select
                                                value={formData.disabilityLevel}
                                                onChange={(e) => handleInputChange('disabilityLevel', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                                            >
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
                                            <input
                                                type="text"
                                                value={formData.iqScore}
                                                onChange={(e) => handleInputChange('iqScore', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                                                placeholder="如：IQ 50-70"
                                            />
                                        </div>
                                        <div className="md:col-span-2">
                                            <label className="block text-sm font-medium text-gray-700 mb-2">病史</label>
                                            <textarea
                                                value={formData.medicalHistory}
                                                onChange={(e) => handleInputChange('medicalHistory', e.target.value)}
                                                rows={3}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                                                placeholder="既往病史、家族遗传史等"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* 联系信息 */}
                                <div>
                                    <h4 className="text-sm font-medium text-gray-700 mb-4">联系信息</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">监护人</label>
                                            <input
                                                type="text"
                                                value={formData.guardian}
                                                onChange={(e) => handleInputChange('guardian', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                                                placeholder="监护人姓名"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">联系电话</label>
                                            <input
                                                type="text"
                                                value={formData.phone}
                                                onChange={(e) => handleInputChange('phone', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                                                placeholder="联系电话"
                                            />
                                        </div>
                                        <div className="md:col-span-2">
                                            <label className="block text-sm font-medium text-gray-700 mb-2">家庭地址</label>
                                            <input
                                                type="text"
                                                value={formData.address}
                                                onChange={(e) => handleInputChange('address', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                                                placeholder="家庭地址"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 第二步：学习能力评估表 */}
                        {currentStep === 2 && (
                            <div className="space-y-6">
                                <div className="border-b pb-4">
                                    <h3 className="text-lg font-semibold text-gray-800">第二步：学习能力评估表</h3>
                                    <p className="text-sm text-gray-500 mt-1">评估儿童的各项学习能力</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-4">评估日期</label>
                                    <input
                                        type="date"
                                        value={formData.assessmentDate || ''}
                                        onChange={(e) => handleInputChange('assessmentDate', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                                    />
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">听觉理解能力</label>
                                        <select
                                            value={formData.listeningAbility || ''}
                                            onChange={(e) => handleInputChange('listeningAbility', e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                                        >
                                            <option value="">请评估</option>
                                            <option value="优秀">优秀</option>
                                            <option value="良好">良好</option>
                                            <option value="一般">一般</option>
                                            <option value="需要改进">需要改进</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">语言表达能力</label>
                                        <select
                                            value={formData.speakingAbility || ''}
                                            onChange={(e) => handleInputChange('speakingAbility', e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                                        >
                                            <option value="">请评估</option>
                                            <option value="优秀">优秀</option>
                                            <option value="良好">良好</option>
                                            <option value="一般">一般</option>
                                            <option value="需要改进">需要改进</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">阅读理解能力</label>
                                        <select
                                            value={formData.readingAbility || ''}
                                            onChange={(e) => handleInputChange('readingAbility', e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                                        >
                                            <option value="">请评估</option>
                                            <option value="优秀">优秀</option>
                                            <option value="良好">良好</option>
                                            <option value="一般">一般</option>
                                            <option value="需要改进">需要改进</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">写作表达能力</label>
                                        <select
                                            value={formData.writingAbility || ''}
                                            onChange={(e) => handleInputChange('writingAbility', e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                                        >
                                            <option value="">请评估</option>
                                            <option value="优秀">优秀</option>
                                            <option value="良好">良好</option>
                                            <option value="一般">一般</option>
                                            <option value="需要改进">需要改进</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">数学计算能力</label>
                                        <select
                                            value={formData.mathAbility || ''}
                                            onChange={(e) => handleInputChange('mathAbility', e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                                        >
                                            <option value="">请评估</option>
                                            <option value="优秀">优秀</option>
                                            <option value="良好">良好</option>
                                            <option value="一般">一般</option>
                                            <option value="需要改进">需要改进</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">自理能力</label>
                                        <select
                                            value={formData.selfCareAbility || ''}
                                            onChange={(e) => handleInputChange('selfCareAbility', e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                                        >
                                            <option value="">请评估</option>
                                            <option value="优秀">优秀</option>
                                            <option value="良好">良好</option>
                                            <option value="一般">一般</option>
                                            <option value="需要改进">需要改进</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">社交互动能力</label>
                                        <select
                                            value={formData.socialAbility || ''}
                                            onChange={(e) => handleInputChange('socialAbility', e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                                        >
                                            <option value="">请评估</option>
                                            <option value="优秀">优秀</option>
                                            <option value="良好">良好</option>
                                            <option value="一般">一般</option>
                                            <option value="需要改进">需要改进</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">评估备注</label>
                                        <textarea
                                            value={formData.assessmentNotes || ''}
                                            onChange={(e) => handleInputChange('assessmentNotes', e.target.value)}
                                            rows={4}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                                            placeholder="补充说明、观察记录等"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 第三步：结果分析报告 */}
                        {currentStep === 3 && (
                            <div className="space-y-6">
                                <div className="border-b pb-4">
                                    <h3 className="text-lg font-semibold text-gray-800">第三步：结果分析报告</h3>
                                    <p className="text-sm text-gray-500 mt-1">生成综合分析报告和建议</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-4">报告日期</label>
                                    <input
                                        type="date"
                                        value={formData.analysisDate || ''}
                                        onChange={(e) => handleInputChange('analysisDate', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                                    />
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">优势领域</label>
                                        <textarea
                                            value={formData.strengthAreas || ''}
                                            onChange={(e) => handleInputChange('strengthAreas', e.target.value)}
                                            rows={4}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                                            placeholder="描述儿童在哪些方面表现良好..."
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">发展需求领域</label>
                                        <textarea
                                            value={formData.developmentAreas || ''}
                                            onChange={(e) => handleInputChange('developmentAreas', e.target.value)}
                                            rows={4}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                                            placeholder="描述需要改进和加强的领域..."
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">建议的干预措施</label>
                                        <textarea
                                            value={formData.recommendedInterventions || ''}
                                            onChange={(e) => handleInputChange('recommendedInterventions', e.target.value)}
                                            rows={4}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                                            placeholder="针对性的康复训练、教学建议等..."
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">后续跟进计划</label>
                                        <textarea
                                            value={formData.followUpPlan || ''}
                                            onChange={(e) => handleInputChange('followUpPlan', e.target.value)}
                                            rows={4}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                                            placeholder="下一步的评估计划、复查时间等..."
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">报告备注</label>
                                        <textarea
                                            value={formData.reportNotes || ''}
                                            onChange={(e) => handleInputChange('reportNotes', e.target.value)}
                                            rows={3}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                                            placeholder="其他重要信息和建议..."
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">康复进展状态</label>
                                        <select
                                            value={formData.status}
                                            onChange={(e) => handleInputChange('status', e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                                        >
                                            <option value="在训">在训</option>
                                            <option value="结业">结业</option>
                                            <option value="转介">转介</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 第四步：个别化教育计划 */}
                        {currentStep === 4 && (
                            <div className="space-y-6">
                                <div className="border-b pb-4">
                                    <h3 className="text-lg font-semibold text-gray-800">第四步：个别化教育计划</h3>
                                    <p className="text-sm text-gray-500 mt-1">制定个性化学习目标与支持策略</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-4">计划日期</label>
                                    <input
                                        type="date"
                                        value={formData.iepDate || ''}
                                        onChange={(e) => handleInputChange('iepDate', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">个别化教育计划内容</label>
                                    <textarea
                                        value={formData.individualizedEducationPlan || ''}
                                        onChange={(e) => handleInputChange('individualizedEducationPlan', e.target.value)}
                                        rows={6}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                                        placeholder="填写教育目标、教学策略、支持服务等内容..."
                                    />
                                </div>
                            </div>
                        )}

                        {/* 第五步：个别教学记录卡 */}
                        {currentStep === 5 && (
                            <div className="space-y-6">
                                <div className="border-b pb-4">
                                    <h3 className="text-lg font-semibold text-gray-800">第五步：个别教学记录卡</h3>
                                    <p className="text-sm text-gray-500 mt-1">记录每次教学活动与教学要点</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-4">记录日期</label>
                                    <input
                                        type="date"
                                        value={formData.teachingRecordDate || ''}
                                        onChange={(e) => handleInputChange('teachingRecordDate', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">教学记录卡内容</label>
                                    <textarea
                                        value={formData.teachingRecordCard || ''}
                                        onChange={(e) => handleInputChange('teachingRecordCard', e.target.value)}
                                        rows={6}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                                        placeholder="记录教学主题、教学材料、学生反应、调整内容等..."
                                    />
                                </div>
                            </div>
                        )}

                        {/* 第六步：学习进度报告表 */}
                        {currentStep === 6 && (
                            <div className="space-y-6">
                                <div className="border-b pb-4">
                                    <h3 className="text-lg font-semibold text-gray-800">第六步：学习进度报告表</h3>
                                    <p className="text-sm text-gray-500 mt-1">跟踪学习成效与掌握情况</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-4">报告日期</label>
                                    <input
                                        type="date"
                                        value={formData.progressReportDate || ''}
                                        onChange={(e) => handleInputChange('progressReportDate', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">学习进度报告内容</label>
                                    <textarea
                                        value={formData.learningProgressReport || ''}
                                        onChange={(e) => handleInputChange('learningProgressReport', e.target.value)}
                                        rows={6}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                                        placeholder="填写技能进度、掌握情况、改进建议等..."
                                    />
                                </div>
                            </div>
                        )}

                        {/* 第七步：后续教育跟踪表 */}
                        {currentStep === 7 && (
                            <div className="space-y-6">
                                <div className="border-b pb-4">
                                    <h3 className="text-lg font-semibold text-gray-800">第七步：后续教育跟踪表</h3>
                                    <p className="text-sm text-gray-500 mt-1">记录后续教育安排与跟进情况</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-4">跟踪日期</label>
                                    <input
                                        type="date"
                                        value={formData.educationTrackingDate || ''}
                                        onChange={(e) => handleInputChange('educationTrackingDate', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">后续教育跟踪内容</label>
                                    <textarea
                                        value={formData.followUpEducationTracking || ''}
                                        onChange={(e) => handleInputChange('followUpEducationTracking', e.target.value)}
                                        rows={6}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                                        placeholder="填写后续教育计划、转介安排、复查结果等..."
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 导航按钮 */}
                    <div className="flex justify-between gap-4">
                        <button
                            onClick={() => (currentStep === 1 ? router.back() : handlePrev())}
                            className="px-6 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                        >
                            {currentStep === 1 ? '返回' : '上一步'}
                        </button>

                        <div className="flex gap-4">
                            {currentStep < STEPS.length && (
                                <button
                                    onClick={handleNext}
                                    className="px-6 py-2 bg-[#F08020] text-white rounded-lg hover:bg-[#D06010] transition-colors font-medium"
                                >
                                    下一步
                                </button>
                            )}

                            {currentStep === STEPS.length && (
                                <button
                                    onClick={handleSubmit}
                                    className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                                >
                                    完成建档
                                </button>
                            )}
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}
