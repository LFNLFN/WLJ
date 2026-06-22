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
    stages: [] as { id: string; label: string; start: number; end: number; content: string; objectives: string; completed: boolean; lessonPlanIds: string[]; lessonPlanTitles: string[] }[],
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
      <div className="mb-6 bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700">📋 阶段性计划</h3>
        </div>
        <div className="p-4">
          {/* 规划方式选择 */}
          <div className="mb-4">
            <label className="block text-xs text-gray-500 mb-2">规划方式</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="stagePlanType" value="lesson"
                  checked={form.stagePlanType === 'lesson'}
                  onChange={e => { setForm(prev => ({ ...prev, stagePlanType: e.target.value, stages: [] })); }}
                  className="w-4 h-4 text-primary-600" />
                <span className="text-sm text-gray-700">按课节</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="stagePlanType" value="week"
                  checked={form.stagePlanType === 'week'}
                  onChange={e => { setForm(prev => ({ ...prev, stagePlanType: e.target.value, stages: [] })); }}
                  className="w-4 h-4 text-primary-600" />
                <span className="text-sm text-gray-700">按周</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="stagePlanType" value="month"
                  checked={form.stagePlanType === 'month'}
                  onChange={e => { setForm(prev => ({ ...prev, stagePlanType: e.target.value, stages: [] })); }}
                  className="w-4 h-4 text-primary-600" />
                <span className="text-sm text-gray-700">按月</span>
              </label>
            </div>
          </div>

          {/* 阶段列表 */}
          {Array.isArray(form.stages) && form.stages.length > 0 ? (
            <div className="space-y-3 mb-4">
              {form.stages.map((stage, idx) => {
                const unitLabel = form.stagePlanType === 'lesson' ? '节' : form.stagePlanType === 'week' ? '周' : '个月';
                const rangeLabel = form.stagePlanType === 'lesson'
                  ? `第${stage.start}-${stage.end}节`
                  : form.stagePlanType === 'week'
                    ? `第${stage.start}-${stage.end}周`
                    : `第${stage.start}-${stage.end}个月`;
                return (
                  <div key={stage.id} className="border border-gray-200 rounded-lg overflow-hidden">
                    {/* 阶段头部 */}
                    <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
                      <div className="flex items-center gap-3">
                        <span className={"inline-flex items-center justify-center w-6 h-6 rounded-full " + (stage.completed ? 'bg-green-100 text-green-700' : 'bg-primary-100 text-primary-700') + " text-xs font-bold"}>
                          {stage.completed ? '✓' : (idx + 1)}
                        </span>
                        <div>
                          <span className={"text-sm font-medium " + (stage.completed ? 'text-green-700' : 'text-gray-700')}>{stage.label || `阶段${idx + 1}`}</span>
                          <span className="text-xs text-gray-400 ml-2">{rangeLabel}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer">
                          <input type="checkbox" checked={stage.completed || false}
                            onChange={e => {
                              const checked = e.target.checked;
                              setForm(prev => ({
                                ...prev,
                                stages: prev.stages.map((s, i) => i === idx ? { ...s, completed: checked } : s),
                              }));
                            }}
                            className="w-3.5 h-3.5 text-green-600" />
                          已完成
                        </label>
                        <button type="button" onClick={() => {
                          setForm(prev => ({
                            ...prev,
                            stages: prev.stages.filter((_, i) => i !== idx),
                          }));
                        }} className="text-red-400 hover:text-red-600 text-xs px-1">删除</button>
                      </div>
                    </div>
                    {/* 阶段内容编辑 */}
                    <div className="p-3 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">阶段名称</label>
                          <input type="text" value={stage.label}
                            onChange={e => {
                              const val = e.target.value;
                              setForm(prev => ({
                                ...prev,
                                stages: prev.stages.map((s, i) => i === idx ? { ...s, label: val } : s),
                              }));
                            }}
                            className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-1 focus:ring-primary-500 outline-none"
                            placeholder={rangeLabel} />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">起始{unitLabel}</label>
                            <input type="number" value={stage.start ?? ''}
                              onChange={e => {
                                const raw = e.target.value;
                                if (raw === '') {
                                  setForm(prev => ({
                                    ...prev,
                                    stages: prev.stages.map((s, i) => i === idx ? { ...s, start: 1 } : s),
                                  }));
                                } else {
                                  const val = Number(raw);
                                  if (!isNaN(val)) {
                                    setForm(prev => ({
                                      ...prev,
                                      stages: prev.stages.map((s, i) => i === idx ? { ...s, start: val } : s),
                                    }));
                                  }
                                }
                              }}
                              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-1 focus:ring-primary-500 outline-none" min="1" />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">结束{unitLabel}</label>
                            <input type="number" value={stage.end ?? ''}
                              onChange={e => {
                                const raw = e.target.value;
                                if (raw === '') {
                                  setForm(prev => ({
                                    ...prev,
                                    stages: prev.stages.map((s, i) => i === idx ? { ...s, end: 1 } : s),
                                  }));
                                } else {
                                  const val = Number(raw);
                                  if (!isNaN(val)) {
                                    setForm(prev => ({
                                      ...prev,
                                      stages: prev.stages.map((s, i) => i === idx ? { ...s, end: val } : s),
                                    }));
                                  }
                                }
                              }}
                              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-1 focus:ring-primary-500 outline-none" min="1" />
                          </div>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">教学内容</label>
                        <textarea value={stage.content}
                          onChange={e => {
                            const val = e.target.value;
                            setForm(prev => ({
                              ...prev,
                              stages: prev.stages.map((s, i) => i === idx ? { ...s, content: val } : s),
                            }));
                          }}
                          className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-1 focus:ring-primary-500 outline-none resize-y"
                          rows={2} placeholder="本阶段的教学内容" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">教学目标 / 预期效果</label>
                        <textarea value={stage.objectives || ''}
                          onChange={e => {
                            const val = e.target.value;
                            setForm(prev => ({
                              ...prev,
                              stages: prev.stages.map((s, i) => i === idx ? { ...s, objectives: val } : s),
                            }));
                          }}
                          className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-1 focus:ring-primary-500 outline-none resize-y"
                          rows={2} placeholder="本阶段希望达到的教学效果" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-6 bg-gray-50 rounded-lg mb-4">
              <p className="text-gray-400 text-sm mb-2">暂无阶段计划</p>
              <p className="text-gray-300 text-xs">点击下方按钮添加教学阶段</p>
            </div>
          )}

          {/* 添加阶段 */}
          <button type="button" onClick={() => {
            const total = Number(form.totalClasses) || 10;
            const count = form.stages.length;
            const unitLabel = form.stagePlanType === 'lesson' ? '节' : form.stagePlanType === 'week' ? '周' : '个月';
            const max = form.stagePlanType === 'lesson' ? total : 52;

            if (count >= max) {
              alert(`已达到最大${unitLabel}数`);
              return;
            }

            const perStage = Math.max(1, Math.ceil(max / 5));
            const start = count * perStage + 1;
            let end = Math.min(start + perStage - 1, max);
            if (end < start) end = start;

            const newStage = {
              id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
              label: `阶段${count + 1}`,
              start,
              end,
              content: '',
              objectives: '',
              completed: false,
              lessonPlanIds: [],
              lessonPlanTitles: [],
            };

            setForm(prev => ({
              ...prev,
              stages: [...prev.stages, newStage],
            }));
          }} className="w-full px-4 py-2.5 border-2 border-dashed border-gray-300 text-gray-500 text-sm rounded-lg hover:border-primary-300 hover:text-primary-600 transition-colors">
            + 添加阶段
          </button>
        </div>
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
