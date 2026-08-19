'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import {
  ASSESS_GROUPS,
  initialAssessmentFields,
  loadTemplates,
  openArchivePrintWindow,
} from '@/lib/rehabilitation/print';

// ============================================================
// 新建康复档案
// 移植自 pdf-export-debug 的 PDF 导出实现：
//   表单采集 -> 渲染 HTML 模板（封面/目录/使用说明/入学登记表/
//   学习能力评估表/综合分析报告/IEP/记录卡/进度报告/跟踪表/附件）
//   -> 整册预览 / 打印导出 PDF
// 数据保存到 localStorage（键: rehabilitation_mental_retardation），
// 与列表页保持兼容。
// ============================================================

/* ---------- 工具函数 ---------- */

function todayISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** "2024-09-01" -> "2024年9月1日"（模板展示格式） */
function toCNDate(iso?: string): string {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return String(iso);
  return `${m[1]}年${Number(m[2])}月${Number(m[3])}日`;
}

function calculateAge(birthDate: string): number {
  if (!birthDate) return 0;
  const birth = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

/* ---------- 表单配置 ---------- */

const STEPS = [
  { label: '档案信息', desc: '封面 / 基本信息' },
  { label: '儿童信息', desc: '入学登记表·儿童状况' },
  { label: '家庭情况', desc: '入学登记表·家庭' },
  { label: '生活与康复', desc: '生活习惯 / 特殊行为' },
  { label: '能力评估', desc: '学习能力评估表' },
];

const INPUT_CLS =
  'w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent text-sm bg-white';
const TEXTAREA_CLS =
  'w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent text-sm bg-white resize-y';

const ASSESS_SCORES = ['3', '2', '1', '0'];
const ASSESS_SCORE_HINT: Record<string, string> = {
  '3': '完全能做到',
  '2': '大部分能做到',
  '1': '偶尔能做到',
  '0': '不能做到',
};

const emptyForm = (): Record<string, string> => ({
  // 档案信息（封面 + 列表兼容字段）
  fileNumber: '',
  name: '',
  trainingNumber: '',
  institution: '未来家儿童能力发展中心',
  archiveDate: todayISO(),
  gender: '男',
  birthDate: '',
  idNumber: '',
  diagnosis: '',
  disabilityLevel: '',
  iqScore: '',
  guardian: '',
  phone: '',
  address: '',
  admissionDate: todayISO(),
  status: '在训',
  photo: '',
  // 入学登记表 · 儿童信息
  enrollTime: todayISO(),
  diagnosisTime: '',
  diagnosisInstitution: '',
  nation: '汉族',
  guardianRelation: '',
  hukouLocation: '',
  currentAddress: '',
  familyPhone: '',
  pregnancyAge: '',
  prenatalEducation: '',
  threatenedAbortion: '',
  pregnancyPsychology: '',
  pregnancyPhysiology: '',
  pregnancyEnvironment: '',
  fullTerm: '',
  laborProcess: '',
  deliveryMode: '',
  premature: '',
  asphyxia: '',
  birthWeight: '',
  breastfeeding: '',
  formulaFeeding: '',
  febrileConvulsion: '',
  headTime: '',
  turnTime: '',
  crawlTime: '',
  smileTime: '',
  sitTime: '',
  walkTime: '',
  vocalTime: '',
  wordTime: '',
  phraseTime: '',
  // 入学登记表 · 家庭情况
  fatherName: '',
  fatherAge: '',
  fatherEducation: '',
  fatherWork: '',
  motherName: '',
  motherAge: '',
  motherEducation: '',
  motherWork: '',
  familyMode: '',
  community: '',
  parentingStyle: '',
  language: '',
  caregiver: '',
  otherMembers: '',
  // 入学登记表 · 生活与康复
  medicalHistory: '',
  dietHabit: '',
  indoorActivity: '',
  outdoorActivity: '',
  sleepTime: '',
  tvProgram: '',
  aloneActivity: '',
  favoriteToy: '',
  languageAbility: '',
  playmate: '',
  literacy: '',
  dressing: '',
  toilet: '',
  selfHarm: '',
  runaway: '',
  otherBehavior: '',
  cause: '',
  currentRehab: '',
  rehabHistory: '',
  parentSign: '',
  date: todayISO(),
  fillTime: toCNDate(todayISO()),
  fillPerson: '',
  reviewer: '',
  // 学习能力评估表
  assessmentDate: todayISO(),
  assessmentTeacher: '',
  ...initialAssessmentFields(),
});

/* ---------- 页面 ---------- */

export default function NewRehabilitationRecordPage() {
  const router = useRouter();
  const [formData, setFormData] = useState<Record<string, string>>(emptyForm);
  const [activeStep, setActiveStep] = useState(0);
  const [busy, setBusy] = useState(false);

  const setField = (key: string, value: string) =>
    setFormData((prev) => ({ ...prev, [key]: value }));

  const generateId = () =>
    Date.now().toString(36) + Math.random().toString(36).substr(2, 9);

  /* ---------- 照片 ---------- */
  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setField('photo', reader.result as string);
    reader.readAsDataURL(file);
  };

  /* ---------- 保存到 localStorage（列表页兼容） ---------- */
  const handleSave = () => {
    if (!formData.name.trim()) {
      alert('请填写儿童姓名（第 1 步 · 档案信息）');
      setActiveStep(0);
      return;
    }
    if (!formData.birthDate) {
      alert('请选择出生日期（第 1 步 · 档案信息）');
      setActiveStep(0);
      return;
    }

    const record: Record<string, unknown> = {
      id: generateId(),
      studentId: `MR${Date.now()}`,
      createdAt: new Date().toISOString(),
      // 列表页兼容字段
      studentName: formData.name,
      gender: formData.gender,
      birthDate: formData.birthDate,
      age: calculateAge(formData.birthDate),
      idNumber: formData.idNumber,
      diagnosis: formData.diagnosis,
      disabilityLevel: formData.disabilityLevel,
      iqScore: formData.iqScore,
      institution: formData.institution,
      guardian: formData.guardian,
      phone: formData.phone || formData.familyPhone,
      address: formData.address || formData.currentAddress,
      admissionDate: formData.admissionDate || formData.enrollTime,
      medicalHistory: formData.medicalHistory,
      treatmentPlan: '',
      progress: '',
      status: formData.status,
      fileUploads: {},
      // 模板字段（供 PDF 重新生成）
      ...formData,
    };

    try {
      const existing = localStorage.getItem('rehabilitation_mental_retardation');
      const records = existing ? JSON.parse(existing) : [];
      records.unshift(record);
      localStorage.setItem('rehabilitation_mental_retardation', JSON.stringify(records));
      router.push('/rehabilitation/mental-retardation');
    } catch (err) {
      alert('保存失败: ' + (err instanceof Error ? err.message : '未知错误'));
    }
  };

  /* ---------- 预览 / 导出 PDF ---------- */
  const buildTemplateFields = (): Record<string, unknown> => ({
    ...formData,
    name: formData.name || '未命名',
    birthDate: toCNDate(formData.birthDate) || formData.birthDate,
    enrollTime: toCNDate(formData.enrollTime),
    admissionDate: toCNDate(formData.admissionDate),
    archiveDate: toCNDate(formData.archiveDate || todayISO()),
    date: toCNDate(formData.date || todayISO()),
  });

  const handleExport = async (doPrint: boolean) => {
    if (!formData.name.trim() || !formData.birthDate) {
      alert('请先填写儿童姓名和出生日期（第 1 步 · 档案信息）');
      setActiveStep(0);
      return;
    }
    setBusy(true);
    try {
      const templates = await loadTemplates();
      const win = openArchivePrintWindow(
        buildTemplateFields(),
        templates,
        `康复训练档案_${formData.name}`,
        doPrint
      );
      if (!win) {
        alert('浏览器拦截了弹出窗口，请允许本网站的弹窗后重试');
      }
    } catch (err) {
      alert('生成档案失败: ' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setBusy(false);
    }
  };

  /* ---------- 渲染辅助 ---------- */
  const field = (
    label: string,
    key: string,
    opts: { required?: boolean; full?: boolean; placeholder?: string; type?: string; readOnly?: boolean } = {}
  ) => (
    <div className={opts.full ? 'md:col-span-2' : ''}>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {opts.required && <span className="text-red-500"> *</span>}
      </label>
      <input
        type={opts.type || 'text'}
        value={formData[key] || ''}
        readOnly={opts.readOnly}
        placeholder={opts.placeholder}
        onChange={(e) => setField(key, e.target.value)}
        className={opts.readOnly ? INPUT_CLS + ' bg-gray-50 text-gray-500' : INPUT_CLS}
      />
    </div>
  );

  const area = (label: string, key: string, opts: { full?: boolean; placeholder?: string; rows?: number } = {}) => (
    <div className={opts.full ? 'md:col-span-2' : ''}>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <textarea
        value={formData[key] || ''}
        rows={opts.rows || 2}
        placeholder={opts.placeholder}
        onChange={(e) => setField(key, e.target.value)}
        className={TEXTAREA_CLS}
      />
    </div>
  );

  const select = (
    label: string,
    key: string,
    options: string[],
    opts: { full?: boolean; placeholder?: string } = {}
  ) => (
    <div className={opts.full ? 'md:col-span-2' : ''}>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <select
        value={formData[key] || ''}
        onChange={(e) => setField(key, e.target.value)}
        className={INPUT_CLS}
      >
        <option value="">{opts.placeholder || '请选择'}</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  );

  const sectionTitle = (title: string, desc?: string) => (
    <div className="md:col-span-2 mt-2 mb-1">
      <h4 className="text-sm font-semibold text-gray-800">{title}</h4>
      {desc && <p className="text-xs text-gray-400 mt-0.5">{desc}</p>}
      <div className="mt-2 border-t border-dashed border-gray-200" />
    </div>
  );

  /* ---------- 各步骤内容 ---------- */
  const renderStep = () => {
    switch (activeStep) {
      case 0:
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sectionTitle('封面 / 档案信息', '用于档案封面与首页')}
            {field('档案编号', 'fileNumber', { placeholder: '如 WLJ-2024-0001' })}
            {field('儿童姓名', 'name', { required: true, placeholder: '请输入姓名' })}
            {field('康复训练号', 'trainingNumber', { placeholder: '如 KF-2024-0001' })}
            {select('性别', 'gender', ['男', '女'])}
            {field('出生日期', 'birthDate', { required: true, type: 'date' })}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">年龄</label>
              <input
                type="number"
                value={formData.birthDate ? calculateAge(formData.birthDate) : ''}
                readOnly
                className={INPUT_CLS + ' bg-gray-50 text-gray-500'}
                placeholder="根据出生日期自动计算"
              />
            </div>
            {field('建档日期', 'archiveDate', { type: 'date' })}
            {field('康复机构', 'institution')}
            {sectionTitle('基本信息', '同时用于档案列表页展示')}
            {field('身份证号码', 'idNumber', { full: true, placeholder: '18位身份证号码' })}
            {area('临床诊断', 'diagnosis', { full: true, rows: 2, placeholder: '如：智力发育迟缓、唐氏综合征等' })}
            {select('残障等级', 'disabilityLevel', ['无', '一级', '二级', '三级', '四级'])}
            {field('智商评分', 'iqScore', { placeholder: '如：IQ 50-70' })}
            {field('监护人', 'guardian', { placeholder: '监护人姓名' })}
            {field('联系电话', 'phone', { placeholder: '联系电话' })}
            {field('入院日期', 'admissionDate', { type: 'date' })}
            {field('家庭地址', 'address', { full: true, placeholder: '家庭地址' })}
            {select('状态', 'status', ['在训', '结业', '转介'])}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">照片</label>
              <div className="flex items-center gap-3">
                {formData.photo ? (
                  <img
                    src={formData.photo}
                    alt="儿童照片"
                    className="w-16 h-20 object-cover rounded-lg border border-gray-200"
                  />
                ) : (
                  <div className="w-16 h-20 rounded-lg border border-dashed border-gray-300 flex items-center justify-center text-gray-300 text-xs">
                    预览
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <label className="px-3 py-1.5 text-sm cursor-pointer bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">
                    上传照片
                    <input type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
                  </label>
                  {formData.photo && (
                    <button
                      type="button"
                      onClick={() => setField('photo', '')}
                      className="px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      移除
                    </button>
                  )}
                </div>
                <span className="text-xs text-gray-400">将显示在入学登记表右上角</span>
              </div>
            </div>
          </div>
        );

      case 1:
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sectionTitle('入学登记表 · 儿童信息')}
            {field('入学时间', 'enrollTime', { type: 'date', required: true })}
            {field('民族', 'nation')}
            {field('诊断时间', 'diagnosisTime', { placeholder: '如 2024年3月' })}
            {field('诊断机构', 'diagnosisInstitution', { placeholder: '如 广州市儿童医院' })}
            {field('监护人', 'guardian', { placeholder: '监护人姓名' })}
            {field('与儿童关系', 'guardianRelation', { placeholder: '如 父亲' })}
            {field('户籍所在地', 'hukouLocation', { full: true })}
            {field('现居住地址', 'currentAddress', { full: true })}
            {field('家庭电话', 'familyPhone', { placeholder: '如 020-88888888' })}
            {sectionTitle('妊娠史')}
            {field('母妊娠年龄', 'pregnancyAge')}
            {field('胎教情况', 'prenatalEducation')}
            {field('先兆流产', 'threatenedAbortion')}
            {field('心理状态', 'pregnancyPsychology')}
            {field('生理状况', 'pregnancyPhysiology')}
            {field('环境状况', 'pregnancyEnvironment')}
            {sectionTitle('分娩史')}
            {field('足月', 'fullTerm')}
            {field('产程', 'laborProcess')}
            {field('分娩方式', 'deliveryMode')}
            {field('早产或过期', 'premature')}
            {field('窒息', 'asphyxia')}
            {field('出生体重', 'birthWeight')}
            {sectionTitle('生长发育史')}
            {field('母乳喂养', 'breastfeeding')}
            {field('人工喂养', 'formulaFeeding')}
            {field('高热抽搐', 'febrileConvulsion')}
            {field('会抬头时间', 'headTime')}
            {field('会翻身时间', 'turnTime')}
            {field('会爬行时间', 'crawlTime')}
            {field('会笑时间', 'smileTime')}
            {field('会坐时间', 'sitTime')}
            {field('会走时间', 'walkTime')}
            {field('会发音时间', 'vocalTime')}
            {field('说单词时间', 'wordTime')}
            {field('说词语时间', 'phraseTime')}
          </div>
        );

      case 2:
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sectionTitle('父母及主要成员')}
            {field('父亲姓名', 'fatherName')}
            {field('父亲年龄', 'fatherAge')}
            {field('父亲文化程度', 'fatherEducation')}
            {field('父亲工作单位及职务', 'fatherWork')}
            {field('母亲姓名', 'motherName')}
            {field('母亲年龄', 'motherAge')}
            {field('母亲文化程度', 'motherEducation')}
            {field('母亲工作单位及职务', 'motherWork')}
            {sectionTitle('家庭情况')}
            {select('家庭模式', 'familyMode', ['大家庭', '核心家庭', '单亲家庭', '寄养家庭'])}
            {select('居住社区', 'community', ['花园、小区', '独家居住', '租住房'])}
            {select('教养方式', 'parentingStyle', ['教育型', '娇宠型', '放任自流型'])}
            {select('语言环境', 'language', ['普通话', '广州话', '地方方言'])}
            {select('抚养/带养人', 'caregiver', ['父母', '爷爷奶奶', '外公外婆', '保姆'])}
            {field('其他成员', 'otherMembers', { full: true, placeholder: '如 其他共同居住成员及关系' })}
          </div>
        );

      case 3:
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sectionTitle('生活习惯', '既往病史、饮食、活动等')}
            {area('既往病史（心脏病、癫痫等）', 'medicalHistory', { full: true })}
            {field('特殊的饮食习惯', 'dietHabit', { full: true })}
            {field('最喜欢的活动 · 室内', 'indoorActivity')}
            {field('最喜欢的活动 · 室外', 'outdoorActivity')}
            {field('特殊的睡眠时间', 'sleepTime')}
            {field('最爱看的电视节目', 'tvProgram')}
            {field('独处时常做的事情', 'aloneActivity')}
            {field('最常玩的玩具', 'favoriteToy')}
            {field('语言表达能力', 'languageAbility')}
            {field('经常一起玩的玩伴', 'playmate')}
            {field('认知/认字能力', 'literacy')}
            {field('穿衣服', 'dressing')}
            {field('大小便', 'toilet')}
            {sectionTitle('特殊行为')}
            {field('伤害自己/他人', 'selfHarm')}
            {field('逃跑', 'runaway')}
            {field('其他', 'otherBehavior')}
            {sectionTitle('康复情况')}
            {area('智障成因', 'cause', { full: true })}
            {area('目前主要康复情况', 'currentRehab', { full: true })}
            {area('既往康复教育情况', 'rehabHistory', { full: true })}
            {sectionTitle('填表信息')}
            {field('监护人签名', 'parentSign', { placeholder: '监护人姓名' })}
            {field('注册日期', 'date', { type: 'date' })}
            {field('填表时间', 'fillTime', { placeholder: '如 2024年9月1日' })}
            {field('填表人', 'fillPerson')}
            {field('审核人', 'reviewer')}
          </div>
        );

      case 4:
        return (
          <div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              {field('评估日期', 'assessmentDate', { type: 'date' })}
              {field('评估老师', 'assessmentTeacher', { placeholder: '评估老师姓名' })}
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 mb-4 text-xs text-amber-700">
              评分标准：3 = 完全能做到，2 = 大部分能做到，1 = 偶尔能做到，0 = 不能做到。
              <span className="text-gray-400"> 未作答的项目在评估表中留空。</span>
            </div>
            {ASSESS_GROUPS.map((group) => (
              <div key={group.cat} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
                <h4 className="text-sm font-semibold text-gray-800 mb-3">{group.cat}</h4>
                <div className="space-y-0.5">
                  {group.items.map(([key, label]) => (
                    <div
                      key={key}
                      className="flex items-center justify-between gap-3 py-1.5 px-1 rounded hover:bg-gray-50"
                    >
                      <span className="text-sm text-gray-700 flex-1">{label}</span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {ASSESS_SCORES.map((score) => (
                          <label
                            key={score}
                            title={ASSESS_SCORE_HINT[score]}
                            className={[
                              'flex items-center gap-0.5 px-2 py-1 rounded cursor-pointer text-xs transition-colors',
                              formData[key] === score
                                ? 'bg-[#F08020] text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                            ].join(' ')}
                          >
                            <input
                              type="radio"
                              name={key}
                              value={score}
                              className="sr-only"
                              checked={formData[key] === score}
                              onChange={() => setField(key, score)}
                            />
                            {score}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-5xl mx-auto">
            {/* 页面标题 */}
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-800">新建康复档案</h2>
                <p className="text-gray-500 text-sm mt-1">
                  填写表单后将自动生成整册康复档案（封面 + 入学登记表 + 学习能力评估表 + 各类报告），支持预览与导出 PDF
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleExport(false)}
                  disabled={busy}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm disabled:opacity-50"
                >
                  👁 预览档案
                </button>
                <button
                  onClick={() => handleExport(true)}
                  disabled={busy}
                  className="px-4 py-2 bg-[#F08020] text-white rounded-lg hover:bg-[#D06010] transition-colors text-sm disabled:opacity-50"
                >
                  {busy ? '生成中…' : '⬇ 导出 PDF'}
                </button>
              </div>
            </div>

            {/* 步骤导航 */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-3 mb-4 overflow-x-auto">
              <div className="flex items-center gap-1 min-w-max">
                {STEPS.map((step, i) => (
                  <button
                    key={step.label}
                    onClick={() => setActiveStep(i)}
                    className={[
                      'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                      i === activeStep
                        ? 'bg-[#F08020] text-white'
                        : i < activeStep
                        ? 'text-[#F08020] hover:bg-orange-50'
                        : 'text-gray-400 hover:bg-gray-50',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'w-5 h-5 rounded-full flex items-center justify-center text-xs',
                        i === activeStep
                          ? 'bg-white/25'
                          : i < activeStep
                          ? 'bg-[#F08020]/10'
                          : 'bg-gray-100',
                      ].join(' ')}
                    >
                      {i < activeStep ? '✓' : i + 1}
                    </span>
                    {step.label}
                    <span className="hidden lg:inline text-xs opacity-70">{step.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 当前步骤表单 */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-4">
              {renderStep()}
            </div>

            {/* 底部操作栏 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveStep((s) => Math.max(0, s - 1))}
                  disabled={activeStep === 0}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm disabled:opacity-40"
                >
                  ← 上一步
                </button>
                <button
                  onClick={() => setActiveStep((s) => Math.min(STEPS.length - 1, s + 1))}
                  disabled={activeStep === STEPS.length - 1}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm disabled:opacity-40"
                >
                  下一步 →
                </button>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => router.back()}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm"
                >
                  取消
                </button>
                <button
                  onClick={handleSave}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                >
                  💾 保存档案
                </button>
              </div>
            </div>

            <p className="text-center text-xs text-gray-300 mt-6">
              说明：档案包含封面、目录、使用说明、入学登记表、学习能力评估表、评估结果综合分析报告、IEP、个别教学记录卡、学习进度报告表、后续教育跟踪表、附件共 11 部分；
              “导出 PDF”会在新窗口打开整册档案并唤起浏览器打印对话框，选择“另存为 PDF”即可生成 PDF 文件。
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
