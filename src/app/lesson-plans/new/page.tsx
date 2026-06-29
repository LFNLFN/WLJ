'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { getStudents, saveLessonPlan } from '@/lib/api';

function NewLessonPlanForm() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [students, setStudents] = useState<any[]>([]);
  const [studentKeyword, setStudentKeyword] = useState('');
  const [studentResults, setStudentResults] = useState<any[]>([]);
  const [showStudentSearch, setShowStudentSearch] = useState(false);

  // 从 localStorage 读取 AI 生成的内容
  const getInitialContent = () => {
    if (typeof window !== 'undefined') {
      const aiContent = localStorage.getItem('ai_generated_content');
      const aiTitle = localStorage.getItem('ai_generated_title');
      if (aiContent) {
        localStorage.removeItem('ai_generated_content');
        localStorage.removeItem('ai_generated_title');
        return { title: aiTitle || '', content: aiContent };
      }
    }
    const urlTitle = searchParams.get('title') || '';
    const urlContent = searchParams.get('content') || '';
    return {
      title: urlTitle,
      content: urlContent ? decodeURIComponent(urlContent) : '',
    };
  };

  const initial = getInitialContent();
  const [form, setForm] = useState({
    title: initial.title,
    type: 'personal',
    content: initial.content,
    studentId: '',
    studentName: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getStudents().then(setStudents).catch(() => {});
  }, []);

  // 搜索学生：无关键词时显示最近20个，有关键词时筛选
  useEffect(() => {
    if (!studentKeyword.trim()) {
      // 显示最近20个学生
      setStudentResults(students.slice(0, 20));
      return;
    }
    const kw = studentKeyword.toLowerCase();
    const filtered = students.filter(s =>
      s.name.toLowerCase().includes(kw) ||
      (s.parentName && s.parentName.toLowerCase().includes(kw))
    );
    setStudentResults(filtered);
  }, [studentKeyword, students]);

  const selectStudent = (student: any) => {
    setForm(prev => ({ ...prev, studentId: student._id, studentName: student.name }));
    setStudentKeyword('');
    setStudentResults([]);
    setShowStudentSearch(false);
  };

  const removeStudent = () => {
    setForm(prev => ({ ...prev, studentId: '', studentName: '' }));
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
    if (form.type === 'personal' && !form.studentId) {
      alert('个人教案请关联一位学生');
      return;
    }
    setSaving(true);
    try {
      await saveLessonPlan({
        title: form.title.trim(),
        type: form.type,
        content: form.content.trim(),
        studentId: form.studentId,
        studentName: form.studentName,
      });
      router.push('/lesson-plans');
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
          <div className="max-w-3xl mx-auto">
            <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">标题 *</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors"
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
                        onChange={e => setForm(prev => ({ ...prev, type: e.target.value, studentId: '', studentName: '' }))}
                        className="w-4 h-4 text-primary-600"
                      />
                      <span className="text-sm text-gray-700">个人教案</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="type"
                        value="group"
                        checked={form.type === 'group'}
                        onChange={e => setForm(prev => ({ ...prev, type: e.target.value }))}
                        className="w-4 h-4 text-primary-600"
                      />
                      <span className="text-sm text-gray-700">集体教案</span>
                    </label>
                  </div>
                </div>

                {/* 关联学生 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    关联学生
                    {form.type === 'personal'
                      ? <span className="text-xs text-gray-400 font-normal ml-1">（个人教案必选）</span>
                      : <span className="text-xs text-gray-400 font-normal ml-1">（选填）</span>
                    }
                  </label>
                  {form.studentName ? (
                    <div className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary-50 text-primary-700 text-sm rounded-lg border border-primary-200">
                      {form.studentName}
                      <button type="button" onClick={removeStudent} className="ml-1 text-primary-400 hover:text-red-500">&times;</button>
                    </div>
                  ) : (
                    <div className="relative">
                      <input
                        type="text"
                        value={studentKeyword}
                        onChange={e => { setStudentKeyword(e.target.value); setShowStudentSearch(true); }}
                        onFocus={() => setShowStudentSearch(true)}
                        placeholder="搜索学生姓名..."
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors text-sm"
                      />
                      {showStudentSearch && (
                        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                          {studentResults.length === 0 ? (
                            <p className="px-4 py-3 text-sm text-gray-400">未找到匹配的学生</p>
                          ) : (
                            studentResults.map((s: any) => (
                              <button key={s._id} type="button"
                                onClick={() => selectStudent(s)}
                                className="w-full text-left px-4 py-2.5 text-sm hover:bg-primary-50 text-gray-700 border-b border-gray-50 last:border-0"
                              >
                                {s.name}{s.age ? `（${s.age}岁）` : ''}
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">教学内容 *</label>
                  <textarea
                    value={form.content}
                    onChange={e => setForm(prev => ({ ...prev, content: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors resize-y"
                    placeholder="请输入教学内容"
                    rows={12}
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 mt-8">
                <button type="submit" disabled={saving}
                  className="px-6 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
                >
                  {saving ? '保存中...' : '💾 保存'}
                </button>
                <button type="button" onClick={() => router.back()}
                  className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
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

export default function NewLessonPlanPage() {
  return (
    <Suspense fallback={<div className="text-center py-8">加载中...</div>}>
      <NewLessonPlanForm />
    </Suspense>
  );
}
