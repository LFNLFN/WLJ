'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { getTeachers, getStudents, getLessonPlans, saveCourse } from '@/lib/api';

export default function NewCoursePage() {
  const router = useRouter();
  const [teachers, setTeachers] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [form, setForm] = useState({
    name: '',
    type: 'personal',
    teacherId: '',
    studentIds: [] as string[],
    lessonPlanIds: [] as string[],
    lessonPlanTitles: [] as string[],
    price: '',
    classHour: '45',
    totalClasses: '10',
  });

  // 教案搜索
  const [planKeyword, setPlanKeyword] = useState('');
  const [planResults, setPlanResults] = useState<any[]>([]);
  const [showPlanSearch, setShowPlanSearch] = useState(false);

  useEffect(() => {
    getTeachers().then(data => setTeachers(data));
    getStudents().then(data => setStudents(data));
  }, []);

  // 搜索教案
  const searchPlans = useCallback(async (kw: string) => {
    if (!kw.trim()) {
      setPlanResults([]);
      return;
    }
    try {
      const res = await getLessonPlans(kw, form.type);
      setPlanResults(res || []);
    } catch (err) {
      setPlanResults([]);
    }
  }, [form.type]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (planKeyword.trim()) searchPlans(planKeyword);
    }, 300);
    return () => clearTimeout(timer);
  }, [planKeyword, searchPlans]);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.teacherId || form.studentIds.length === 0) {
      alert('请填写课程名称、选择教师和学生');
      return;
    }
    const teacher = teachers.find(t => t._id === form.teacherId)!;
    const selectedStudents = students.filter(s => form.studentIds.includes(s._id));

    saveCourse({
      name: form.name.trim(),
      type: form.type,
      teacherId: form.teacherId,
      teacherName: teacher.name,
      lessonPlanIds: form.lessonPlanIds,
      lessonPlanTitles: form.lessonPlanTitles,
      studentIds: form.studentIds,
      studentNames: selectedStudents.map(s => s.name),
      price: Number(form.price) || 0,
      classHour: Number(form.classHour) || 1,
      totalClasses: Number(form.totalClasses) || 10,
    });
    router.push('/courses');
  };

  const toggleStudent = (id: string) => {
    setForm(prev => ({
      ...prev,
      studentIds: prev.studentIds.includes(id)
        ? prev.studentIds.filter(s => s !== id)
        : [...prev.studentIds, id]
    }));
  };

  const TYPE_LABELS: Record<string, string> = {
    personal: '个人课程',
    group: '集体课程',
  };

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-3xl mx-auto">
            <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
              <div className="grid grid-cols-2 gap-6">
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">课程名称 *</label>
                  <input type="text" value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                    placeholder="如：初三数学冲刺班" />
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">课程类型 *</label>
                  <div className="flex gap-4 pt-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="type" value="personal"
                        checked={form.type === 'personal'}
                        onChange={e => setForm(prev => ({ ...prev, type: e.target.value, lessonPlanIds: [], lessonPlanTitles: [] }))}
                        className="w-4 h-4 text-primary-600" />
                      <span className="text-sm text-gray-700">个人课程</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="type" value="group"
                        checked={form.type === 'group'}
                        onChange={e => setForm(prev => ({ ...prev, type: e.target.value, lessonPlanIds: [], lessonPlanTitles: [] }))}
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
                  {teachers.length === 0 && <p className="text-xs text-red-500 mt-1">请先在"教师管理"中添加教师</p>}
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">每节课费用 (元)</label>
                  <input type="number" value={form.price} onChange={e => setForm(prev => ({ ...prev, price: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                    placeholder="如：200" min="0" />
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
                <p className="text-xs text-gray-400 mt-1">每节课费用 ¥{form.price || 0} × 总课次 {form.totalClasses || 0}</p>
              </div>

              {/* 关联教案 */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  关联教案（{form.type === 'personal' ? '个人' : '集体'}教案）
                </label>

                {/* 已选教案列表 */}
                {form.lessonPlanTitles.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {form.lessonPlanTitles.map((title, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 text-sm rounded-lg border border-blue-200">
                        {title}
                        <button type="button" onClick={() => removeLessonPlan(i)} className="ml-1 text-blue-400 hover:text-red-500">&times;</button>
                      </span>
                    ))}
                  </div>
                )}

                {/* 搜索教案 */}
                <div className="relative">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={planKeyword}
                      onChange={e => { setPlanKeyword(e.target.value); setShowPlanSearch(true); }}
                      onFocus={() => setShowPlanSearch(true)}
                      placeholder="输入教案标题关键词搜索..."
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                    />
                  </div>

                  {/* 搜索结果下拉 */}
                  {showPlanSearch && planKeyword.trim() && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {planResults.length === 0 ? (
                        <p className="px-4 py-3 text-sm text-gray-400">未找到匹配的教案</p>
                      ) : (
                        planResults.map((plan: any) => {
                          const isSelected = form.lessonPlanIds.includes(plan._id);
                          return (
                            <button
                              key={plan._id}
                              type="button"
                              disabled={isSelected}
                              onClick={() => addLessonPlan(plan)}
                              className={`w-full text-left px-4 py-2.5 text-sm border-b border-gray-50 last:border-0 transition-colors ${
                                isSelected ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : 'hover:bg-blue-50 text-gray-700'
                              }`}
                            >
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
                <p className="text-xs text-gray-400 mt-1">搜索并选择与本课程关联的教案，支持添加多个</p>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">选择学生 * ({form.studentIds.length} 人)</label>
                {students.length === 0 ? (
                  <p className="text-gray-400 text-sm">请先在"学生管理"中添加学生</p>
                ) : (
                  <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-3 border border-gray-200 rounded-lg">
                    {students.map(s => (
                      <button key={s.id} type="button" onClick={() => toggleStudent(s._id)}
                        className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                          form.studentIds.includes(s._id)
                            ? 'bg-primary-600 text-white border-primary-600'
                            : 'bg-white text-gray-600 border-gray-300 hover:border-primary-300'
                        }`}>
                        {s.name}{s.age ? `（${s.age}岁）` : ''}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button type="submit" className="px-6 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors">
                  💾 保存
                </button>
                <button type="button" onClick={() => router.back()} className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
                  取消
                </button>
              </div>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}
