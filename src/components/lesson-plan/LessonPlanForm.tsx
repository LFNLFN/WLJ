'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import AIGenerateLessonDialog from '@/components/lesson-plan/AIGenerateLessonDialog';
import { getLessonPlan, getStudents, saveLessonPlan } from '@/lib/api';

export default function LessonPlanForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get('id') || '';
  const studentIdParam = searchParams.get('studentId') || '';
  const studentNameParam = searchParams.get('studentName') || '';
  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [form, setForm] = useState({
    title: '',
    type: 'personal' as 'personal' | 'group',
    content: '',
  });
  const [allStudents, setAllStudents] = useState<any[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<{ id: string; name: string }[]>(
    studentIdParam ? [{ id: studentIdParam, name: studentNameParam }] : []
  );
  const [studentKeyword, setStudentKeyword] = useState('');
  const [showStudentSearch, setShowStudentSearch] = useState(false);

  useEffect(() => {
    getStudents()
      .then((data: any[]) => setAllStudents(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!id) return;
    getLessonPlan(id)
      .then((plan: any) => {
        if (plan) {
          setForm({
            title: plan.title || '',
            type: plan.type === 'group' ? 'group' : 'personal',
            content: plan.content || '',
          });
          const ids: string[] = Array.isArray(plan.studentIds) && plan.studentIds.length > 0
            ? plan.studentIds
            : (plan.studentId ? [plan.studentId] : []);
          const names: string[] = Array.isArray(plan.studentNames) && plan.studentNames.length > 0
            ? plan.studentNames
            : (plan.studentName ? [plan.studentName] : []);
          setSelectedStudents(ids.map((sid, idx) => ({ id: sid, name: names[idx] || '' })));
        }
      })
      .catch(() => alert('加载教案失败'))
      .finally(() => setLoading(false));
  }, [id]);

  const studentResults = (() => {
    const kw = studentKeyword.trim().toLowerCase();
    if (!kw) return allStudents.slice(0, 20);
    return allStudents.filter((s: any) =>
      (s.name || '').toLowerCase().includes(kw) ||
      (s.parentName || '').toLowerCase().includes(kw) ||
      (s.parentPhone || '').includes(kw)
    );
  })();

  const selectStudent = (student: any) => {
    const item = { id: student._id || student.id, name: student.name || '' };
    if (form.type === 'personal') {
      setSelectedStudents([item]);
    } else if (!selectedStudents.some((s) => s.id === item.id)) {
      setSelectedStudents((prev) => [...prev, item]);
    }
    setStudentKeyword('');
    setShowStudentSearch(false);
  };

  const removeStudent = (studentId: string) => {
    setSelectedStudents((prev) => prev.filter((s) => s.id !== studentId));
  };

  const changeType = (type: 'personal' | 'group') => {
    setForm((prev) => ({ ...prev, type }));
    if (type === 'personal') {
      setSelectedStudents((prev) => prev.slice(0, 1));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      alert('请输入教案标题');
      return;
    }
    if (!form.content.trim()) {
      alert('请输入教学内容');
      return;
    }
    if (form.type === 'personal' && selectedStudents.length !== 1) {
      alert('个人教案必须关联 1 名学生');
      return;
    }
    if (form.type === 'group' && selectedStudents.length < 2) {
      alert('集体教案必须关联至少 2 名学生');
      return;
    }
    setSaving(true);
    try {
      await saveLessonPlan({
        _id: id || undefined,
        title: form.title.trim(),
        type: form.type,
        content: form.content.trim(),
        studentIds: selectedStudents.map((s) => s.id),
      });
      if (studentIdParam) {
        router.push(`/lesson-plans?studentId=${encodeURIComponent(studentIdParam)}&studentName=${encodeURIComponent(studentNameParam)}`);
      } else {
        router.push('/lesson-plans');
      }
    } catch (err) {
      alert('保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-4xl mx-auto">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
              <div className="flex items-center gap-3">
                <button onClick={() => router.push('/lesson-plans')} className="text-gray-400 hover:text-gray-600">
                  ← 返回教案中心
                </button>
                <h2 className="text-xl font-bold text-gray-800">{id ? '编辑教案' : '新建教案'}</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAI(true)}
                  className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition-colors"
                >
                  🤖 AI 生成
                </button>
              </div>
            </div>

            {loading ? (
              <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-gray-400">
                加载中...
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">标题 *</label>
                    <input
                      type="text"
                      value={form.title}
                      onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                      placeholder="请输入教案标题"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">类型 *</label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="type"
                          value="personal"
                          checked={form.type === 'personal'}
                          onChange={() => changeType('personal')}
                          className="w-4 h-4 text-primary-600"
                        />
                        <span className="text-sm text-gray-700">个人教案（1 对 1 / 个别化）</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="type"
                          value="group"
                          checked={form.type === 'group'}
                          onChange={() => changeType('group')}
                          className="w-4 h-4 text-primary-600"
                        />
                        <span className="text-sm text-gray-700">集体教案（小组 / 班级）</span>
                      </label>
                    </div>
                    <p className="text-xs text-gray-400 mt-2">
                      个人教案关联 1 名学生；集体教案至少关联 2 名学生。一个学生可以关联多份教案。
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      关联学生 *
                      <span className="text-xs text-gray-400 font-normal ml-1">
                        （个人 1 名 / 集体至少 2 名）
                      </span>
                    </label>

                    {selectedStudents.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {selectedStudents.map((s) => {
                          const displayName = s.name || allStudents.find((x) => (x._id || x.id) === s.id)?.name || s.id;
                          return (
                            <span key={s.id} className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary-50 text-primary-700 text-sm rounded-lg border border-primary-200">
                              {displayName}
                              <button type="button" onClick={() => removeStudent(s.id)} className="ml-1 text-primary-400 hover:text-red-500">×</button>
                            </span>
                          );
                        })}
                      </div>
                    )}

                    <div className="relative">
                      <input
                        type="text"
                        value={studentKeyword}
                        onChange={(e) => { setStudentKeyword(e.target.value); setShowStudentSearch(true); }}
                        onFocus={() => setShowStudentSearch(true)}
                        placeholder="搜索学生姓名 / 家长姓名 / 电话..."
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                      />
                      {showStudentSearch && (
                        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                          {studentResults.length === 0 ? (
                            <p className="px-4 py-3 text-sm text-gray-400">未找到匹配的学生</p>
                          ) : (
                            studentResults.map((s: any) => {
                              const sid = s._id || s.id;
                              const selected = selectedStudents.some((x) => x.id === sid);
                              const disabled = selected || (form.type === 'personal' && selectedStudents.length > 0 && !selected);
                              return (
                                <button
                                  key={sid}
                                  type="button"
                                  disabled={disabled}
                                  onClick={() => selectStudent(s)}
                                  className={`w-full text-left px-4 py-2.5 text-sm border-b border-gray-50 last:border-0 transition-colors ${
                                    disabled ? 'bg-gray-50 text-gray-300 cursor-not-allowed' : 'hover:bg-primary-50 text-gray-700'
                                  }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <span className="font-medium">{s.name}</span>
                                      {s.age ? <span className="text-gray-400 ml-1">（{s.age}岁）</span> : null}
                                      <span className="text-gray-400 ml-2 text-xs">{s.parentName || ''}</span>
                                    </div>
                                    <span className="text-xs text-gray-400">
                                      {selected ? '已选择' : form.type === 'personal' && selectedStudents.length > 0 ? '个人教案限 1 人' : '选择'}
                                    </span>
                                  </div>
                                </button>
                              );
                            })
                          )}
                        </div>
                      )}
                      {allStudents.length === 0 && <p className="text-xs text-red-500 mt-1">请先在“学生管理”中添加学生</p>}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">教学内容 *</label>
                    <textarea
                      value={form.content}
                      onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none resize-y text-sm leading-6"
                      placeholder="请输入教学内容：活动目标、适用对象、时长、准备材料、活动流程、家庭延伸等"
                      rows={16}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 mt-8">
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-6 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
                  >
                    {saving ? '保存中...' : id ? '💾 保存修改' : '💾 保存'}
                  </button>
                  <button
                    type="button"
                    onClick={() => router.back()}
                    className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    取消
                  </button>
                </div>
              </form>
            )}
          </div>
        </main>
      </div>

      <AIGenerateLessonDialog
        open={showAI}
        onClose={() => setShowAI(false)}
        type={form.type}
        onApply={({ title, content, type }) => {
          setForm((prev) => ({
            ...prev,
            title: title || prev.title,
            content: content || prev.content,
            type: type || prev.type,
          }));
        }}
      />
    </div>
  );
}
