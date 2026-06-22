'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { getCourse, getTeachers, getStudents, getLessonPlans, saveCourse } from '@/lib/api';

function EditForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const [teachers, setTeachers] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [form, setForm] = useState({
    name: '', type: 'personal', teacherId: '', studentIds: [] as string[],
    lessonPlanIds: [] as string[], lessonPlanTitles: [] as string[],
    price: '', classHour: '45', totalClasses: '10',
    stagePlanType: 'lesson',
    stages: [] as { id: string; label: string; start: number; end: number; content: string; lessonPlanIds: string[]; lessonPlanTitles: string[] }[],
  });

  // 教案搜索
  const [planKeyword, setPlanKeyword] = useState('');
  const [planResults, setPlanResults] = useState<any[]>([]);
  const [showPlanSearch, setShowPlanSearch] = useState(false);

  // 学生搜索
  const [studentKeyword, setStudentKeyword] = useState('');
  const [studentResults, setStudentResults] = useState<any[]>([]);
  const [showStudentSearch, setShowStudentSearch] = useState(false);

  useEffect(() => {
    getTeachers().then(data => setTeachers(data));
    getStudents().then(data => setStudents(data));
    if (id) {
      getCourse(id).then(course => {
        if (course) {
          setForm({
            name: course.name, type: course.type || 'personal', teacherId: course.teacherId,
            studentIds: course.studentIds || [],
            lessonPlanIds: course.lessonPlanIds || [],
            lessonPlanTitles: course.lessonPlanTitles || [],
            price: String(course.price || 0),
            classHour: String(course.classHour || 45),
            totalClasses: String(course.totalClasses || 10),
            stagePlanType: course.stagePlanType || 'lesson',
            stages: course.stages || [],
          });
        }
      });
    }
  }, [id]);

  // 阶段教案搜索
  const [stagePlanKeyword, setStagePlanKeyword] = useState('');
  const [stagePlanResults, setStagePlanResults] = useState<any[]>([]);
  const [editingStageIdx, setEditingStageIdx] = useState<number | null>(null);

  const searchStagePlans = useCallback(async (kw: string) => {
    if (!kw.trim()) { setStagePlanResults([]); return; }
    try {
      const res = await getLessonPlans(kw, form.type);
      setStagePlanResults(res || []);
    } catch (err) { setStagePlanResults([]); }
  }, [form.type]);

  useEffect(() => {
    if (stagePlanKeyword.trim() && editingStageIdx !== null) {
      const timer = setTimeout(() => searchStagePlans(stagePlanKeyword), 300);
      return () => clearTimeout(timer);
    } else {
      setStagePlanResults([]);
    }
  }, [stagePlanKeyword, editingStageIdx, searchStagePlans]);

  const addPlanToStage = (plan: any, stageIdx: number) => {
    setForm(prev => ({
      ...prev,
      stages: prev.stages.map((s, i) => i === stageIdx ? {
        ...s,
        lessonPlanIds: [...s.lessonPlanIds, plan._id],
        lessonPlanTitles: [...s.lessonPlanTitles, plan.title],
      } : s),
    }));
    setStagePlanKeyword('');
    setStagePlanResults([]);
  };

  const searchPlans = useCallback(async (kw: string) => {
    if (!kw.trim()) { setPlanResults([]); return; }
    try {
      const res = await getLessonPlans(kw, form.type);
      setPlanResults(res || []);
    } catch (err) { setPlanResults([]); }
  }, [form.type]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (planKeyword.trim()) searchPlans(planKeyword);
    }, 300);
    return () => clearTimeout(timer);
  }, [planKeyword, searchPlans]);

  // 搜索学生
  useEffect(() => {
    if (!studentKeyword.trim()) { setStudentResults([]); return; }
    const kw = studentKeyword.toLowerCase();
    const filtered = students.filter(s =>
      s.name.toLowerCase().includes(kw) ||
      (s.parentName && s.parentName.toLowerCase().includes(kw)) ||
      (s.phone && s.phone.includes(kw))
    );
    setStudentResults(filtered);
  }, [studentKeyword, students]);

  const addLessonPlan = (plan: any) => {
    if (form.lessonPlanIds.includes(plan._id)) return;
    setForm(prev => ({
      ...prev,
      lessonPlanIds: [...prev.lessonPlanIds, plan._id],
      lessonPlanTitles: [...prev.lessonPlanTitles, plan.title],
    }));
    setPlanKeyword('');
    setPlanResults([]);
    setShowPlanSearch(false);
  };

  const removeLessonPlan = (index: number) => {
    setForm(prev => ({
      ...prev,
      lessonPlanIds: prev.lessonPlanIds.filter((_, i) => i !== index),
      lessonPlanTitles: prev.lessonPlanTitles.filter((_, i) => i !== index),
    }));
  };

  const selectStudent = (student: any) => {
    if (form.type === 'personal') {
      setForm(prev => ({ ...prev, studentIds: [student._id] }));
    } else {
      if (form.studentIds.includes(student._id)) return;
      setForm(prev => ({
        ...prev,
        studentIds: [...prev.studentIds, student._id],
      }));
    }
    setStudentKeyword('');
    setStudentResults([]);
    setShowStudentSearch(false);
  };

  const removeStudent = (id: string) => {
    setForm(prev => ({
      ...prev,
      studentIds: prev.studentIds.filter(s => s !== id),
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !form.name.trim() || !form.teacherId || form.studentIds.length === 0) return;
    const teacher = teachers.find(t => t._id === form.teacherId)!;
    const selectedStudents = students.filter(s => form.studentIds.includes(s._id));
    saveCourse({
      _id: id, name: form.name.trim(), type: form.type,
      teacherId: form.teacherId, teacherName: teacher.name,
      lessonPlanIds: form.lessonPlanIds, lessonPlanTitles: form.lessonPlanTitles,
      stagePlanType: form.stagePlanType, stages: form.stages,
      studentIds: form.studentIds, studentNames: selectedStudents.map(s => s.name),
      price: Number(form.price) || 0, classHour: Number(form.classHour) || 1,
      totalClasses: Number(form.totalClasses) || 10,
    });
    router.push('/courses');
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
      <div className="grid grid-cols-2 gap-6">
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">课程名称 *</label>
          <input type="text" value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none" />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">课程类型 *</label>
          <div className="flex gap-4 pt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="type" value="personal"
                checked={form.type === 'personal'}
                onChange={e => setForm(prev => ({ ...prev, type: e.target.value }))}
                className="w-4 h-4 text-primary-600" />
              <span className="text-sm text-gray-700">个人课程</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="type" value="group"
                checked={form.type === 'group'}
                onChange={e => setForm(prev => ({ ...prev, type: e.target.value }))}
                className="w-4 h-4 text-primary-600" />
              <span className="text-sm text-gray-700">集体课程</span>
            </label>
          </div>
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">授课教师 *</label>
          <select value={form.teacherId} onChange={e => setForm(prev => ({ ...prev, teacherId: e.target.value }))}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none bg-white">
            <option value="">选择教师</option>
            {teachers.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
          </select>
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">每节课费用 (元)</label>
          <input type="number" value={form.price} onChange={e => setForm(prev => ({ ...prev, price: e.target.value }))}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none" min="0" />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">每节课时长 (分钟)</label>
          <input type="number" value={form.classHour} onChange={e => setForm(prev => ({ ...prev, classHour: e.target.value }))}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none" min="1" step="1" />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">总课次</label>
          <input type="number" value={form.totalClasses} onChange={e => setForm(prev => ({ ...prev, totalClasses: e.target.value }))}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none" min="1" />
        </div>
      </div>
      <div className="mb-6 p-4 bg-orange-50 rounded-lg border border-orange-200">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">课程总费用</span>
          <span className="text-xl font-bold text-primary-600">
            ¥{Number(form.price || 0) * Number(form.totalClasses || 0)}
          </span>
        </div>
      </div>

      {/* 关联教案 */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">关联教案</label>
        {Array.isArray(form.lessonPlanTitles) && form.lessonPlanTitles.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {form.lessonPlanTitles.map((title, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 text-sm rounded-lg border border-blue-200">
                {title}
                <button type="button" onClick={() => removeLessonPlan(i)} className="ml-1 text-blue-400 hover:text-red-500">&times;</button>
              </span>
            ))}
          </div>
        )}
        <div className="relative">
          <input type="text" value={planKeyword}
            onChange={e => { setPlanKeyword(e.target.value); setShowPlanSearch(true); }}
            onFocus={() => setShowPlanSearch(true)}
            placeholder="输入教案标题关键词搜索..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm" />
          {showPlanSearch && planKeyword.trim() && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {planResults.length === 0 ? (
                <p className="px-4 py-3 text-sm text-gray-400">未找到匹配的教案</p>
              ) : (
                planResults.map((plan: any) => {
                  const isSelected = form.lessonPlanIds.includes(plan._id);
                  return (
                    <button key={plan._id} type="button" disabled={isSelected}
                      onClick={() => addLessonPlan(plan)}
                      className={`w-full text-left px-4 py-2.5 text-sm border-b border-gray-50 last:border-0 transition-colors ${isSelected ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : 'hover:bg-blue-50 text-gray-700'
                        }`}>
                      <div className="flex items-center justify-between">
                        <span>{plan.title}</span>
                        <span className="text-xs text-gray-400">{isSelected ? '已添加' : '添加'}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* 阶段计划 */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <label className="block text-sm font-medium text-gray-700 mb-3">阶段计划</label>

        {/* 规划方式选择 */}
        <div className="flex gap-6 mb-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="stagePlanType" value="lesson"
              checked={form.stagePlanType === 'lesson'}
              onChange={e => {
                const tp = e.target.value;
                setForm(prev => ({ ...prev, stagePlanType: tp, stages: [] }));
              }}
              className="w-4 h-4 text-primary-600" />
            <span className="text-sm text-gray-700">按节数规划</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="stagePlanType" value="week"
              checked={form.stagePlanType === 'week'}
              onChange={e => {
                const tp = e.target.value;
                setForm(prev => ({ ...prev, stagePlanType: tp, stages: [] }));
              }}
              className="w-4 h-4 text-primary-600" />
            <span className="text-sm text-gray-700">按周规划</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="stagePlanType" value="month"
              checked={form.stagePlanType === 'month'}
              onChange={e => {
                const tp = e.target.value;
                setForm(prev => ({ ...prev, stagePlanType: tp, stages: [] }));
              }}
              className="w-4 h-4 text-primary-600" />
            <span className="text-sm text-gray-700">按月规划</span>
          </label>
        </div>

        {/* 已添加的阶段列表 */}
        {Array.isArray(form.stages) && form.stages.length > 0 && (
          <div className="space-y-2 mb-4">
            {form.stages.map((stage, idx) => (
              <div key={stage.id} className="bg-white p-3 rounded-lg border border-gray-200">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700">{stage.label}</span>
                    <span className="text-xs text-gray-400">
                      {form.stagePlanType === 'lesson' ? `第${stage.start}-${stage.end}节` :
                        form.stagePlanType === 'week' ? `第${stage.start}-${stage.end}周` :
                          `第${stage.start}-${stage.end}个月`}
                    </span>
                  </div>
                  <button type="button" onClick={() => {
                    setForm(prev => ({
                      ...prev,
                      stages: prev.stages.filter((_, i) => i !== idx),
                    }));
                  }} className="text-red-400 hover:text-red-600 text-sm px-2 shrink-0">删除</button>
                </div>
                <div className="space-y-2">
                  <div>
                    <label className="text-xs text-gray-500">阶段教学内容</label>
                    <textarea value={stage.content}
                      onChange={e => {
                        const val = e.target.value;
                        setForm(prev => ({
                          ...prev,
                          stages: prev.stages.map((s, i) => i === idx ? { ...s, content: val } : s),
                        }));
                      }}
                      className="w-full mt-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-1 focus:ring-primary-500 outline-none resize-y"
                      rows={2} placeholder="输入本阶段教学内容" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">关联教案</label>
                    <div className="flex gap-1 flex-wrap mt-1">
                      {stage.lessonPlanTitles.map((t, i) => (
                        <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full">
                          {t}
                          <button type="button" onClick={() => {
                            setForm(prev => ({
                              ...prev,
                              stages: prev.stages.map((s, si) => si === idx ? {
                                ...s,
                                lessonPlanIds: s.lessonPlanIds.filter((_, li) => li !== i),
                                lessonPlanTitles: s.lessonPlanTitles.filter((_, li) => li !== i),
                              } : s),
                            }));
                          }} className="text-blue-400 hover:text-red-500">&times;</button>
                        </span>
                      ))}
                      <button type="button" onClick={() => {
                        setEditingStageIdx(idx);
                        setStagePlanKeyword('');
                      }} className="text-xs text-primary-600 hover:text-primary-800">+ 添加教案</button>
                      {editingStageIdx === idx && (
                        <div className="relative inline-block">
                          <input type="text" value={stagePlanKeyword}
                            onChange={e => setStagePlanKeyword(e.target.value)}
                            placeholder="搜索教案..."
                            className="w-40 px-2 py-1 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-primary-500 outline-none"
                            autoFocus
                            onBlur={() => setTimeout(() => setEditingStageIdx(null), 200)} />
                          {stagePlanKeyword.trim() && (
                            <div className="absolute z-10 mt-1 left-0 w-48 bg-white border border-gray-200 rounded-lg shadow-lg max-h-32 overflow-y-auto">
                              {stagePlanResults.length === 0 ? (
                                <p className="px-3 py-2 text-xs text-gray-400">未找到</p>
                              ) : (
                                stagePlanResults.map((plan: any) => (
                                  <button key={plan._id} type="button"
                                    onMouseDown={() => addPlanToStage(plan, idx)}
                                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 text-gray-700 border-b border-gray-50 last:border-0">
                                    {plan.title}
                                  </button>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 添加阶段按钮 */}
        <button type="button" onClick={() => {
          const total = Number(form.totalClasses) || 10;
          const count = form.stages.length;
          const unitLabel = form.stagePlanType === 'lesson' ? '节' : form.stagePlanType === 'week' ? '周' : '个月';
          const max = form.stagePlanType === 'lesson' ? total : 52;

          if (count >= max) {
            alert(`已达到最大${unitLabel}数`);
            return;
          }

          const perStage = Math.ceil(max / 5);
          const start = count * perStage + 1;
          let end = Math.min(start + perStage - 1, max);
          if (end < start) end = start;

          const newStage = {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
            label: `阶段${count + 1}`,
            start,
            end,
            content: '',
            lessonPlanIds: [],
            lessonPlanTitles: [],
          };

          setForm(prev => ({
            ...prev,
            stages: [...prev.stages, newStage],
          }));
        }} className="px-4 py-2 bg-white border border-gray-300 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors">
          + 添加阶段
        </button>
      </div>

      {/* 选择学生 - 模糊搜索 */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          选择学生 * {form.type === 'personal'
            ? <span className="text-xs text-gray-400 font-normal">（个人课程，限选1人）</span>
            : <span className="text-xs text-gray-400 font-normal">（已选 {form.studentIds.length} 人）</span>
          }
        </label>

        {form.studentIds.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {students.filter(s => form.studentIds.includes(s._id)).map(s => (
              <span key={s._id} className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary-50 text-primary-700 text-sm rounded-lg border border-primary-200">
                {s.name}{s.age ? `（${s.age}岁）` : ''}
                <button type="button" onClick={() => removeStudent(s._id)} className="ml-1 text-primary-400 hover:text-red-500">&times;</button>
              </span>
            ))}
          </div>
        )}

        <div className="relative">
          <input type="text" value={studentKeyword}
            onChange={e => { setStudentKeyword(e.target.value); setShowStudentSearch(true); }}
            onFocus={() => setShowStudentSearch(true)}
            placeholder="输入学生姓名、家长姓名或电话搜索..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm" />
          {showStudentSearch && studentKeyword.trim() && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {studentResults.length === 0 ? (
                <p className="px-4 py-3 text-sm text-gray-400">未找到匹配的学生</p>
              ) : (
                studentResults.map((s: any) => {
                  const isSelected = form.studentIds.includes(s._id);
                  const isDisabled = form.type === 'personal' && form.studentIds.length > 0 && !isSelected;
                  return (
                    <button key={s._id} type="button" disabled={isSelected || isDisabled}
                      onClick={() => selectStudent(s)}
                      className={`w-full text-left px-4 py-2.5 text-sm border-b border-gray-50 last:border-0 transition-colors ${isSelected ? 'bg-gray-50 text-gray-400 cursor-not-allowed' :
                        isDisabled ? 'bg-gray-50 text-gray-300 cursor-not-allowed' :
                          'hover:bg-primary-50 text-gray-700'
                        }`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-medium">{s.name}</span>
                          {s.age ? <span className="text-gray-400 ml-1">（{s.age}岁）</span> : ''}
                          <span className="text-gray-400 ml-2 text-xs">{s.parentName || ''}</span>
                        </div>
                        <span className="text-xs text-gray-400">
                          {isSelected ? '已选择' : isDisabled ? '已达上限' : '选择'}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" className="px-6 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors">💾 保存修改</button>
        <button type="button" onClick={() => router.back()} className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">取消</button>
      </div>
    </form>
  );
}

export default function EditCoursePage() {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-3xl mx-auto">
            <Suspense fallback={<div className="text-center py-8">加载中...</div>}>
              <EditForm />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}
