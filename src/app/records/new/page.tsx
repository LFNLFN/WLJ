'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { getCourse, saveClassRecord, batchCreateClassRecords } from '@/lib/api';

function NewRecordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const courseId = searchParams.get('courseId');

  const [course, setCourse] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    startTime: '09:00',
    endTime: '10:00',
    content: '',
  });

  useEffect(() => {
    if (courseId) {
      getCourse(courseId).then(c => {
        if (c) {
          setCourse(c);
          // 根据课程时长计算默认结束时间
          const classHour = c.classHour || 45;
          setForm(prev => ({
            ...prev,
            endTime: calcEndTime(prev.startTime, classHour),
          }));
        }
        setLoading(false);
      }).catch(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [courseId]);

  const calcEndTime = (start: string, minutes: number) => {
    const [sh, sm] = start.split(':').map(Number);
    const total = sh * 60 + sm + minutes;
    const eh = Math.floor(total / 60);
    const em = total % 60;
    return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
  };

  const handleStartTimeChange = (val: string) => {
    setForm(prev => ({ ...prev, startTime: val }));
    if (course) {
      setForm(prev => ({
        ...prev,
        startTime: val,
        endTime: calcEndTime(val, course.classHour || 45),
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseId || !course) {
      alert('课程信息加载中，请稍后');
      return;
    }

    const [sh, sm] = form.startTime.split(':').map(Number);
    const [eh, em] = form.endTime.split(':').map(Number);
    const duration = ((eh * 60 + em) - (sh * 60 + sm)) / 60;

    if (duration <= 0) {
      alert('结束时间必须晚于开始时间');
      return;
    }

    try {
      await batchCreateClassRecords({
        courseId: courseId,
        courseName: course.name,
        teacherId: course.teacherId,
        teacherName: course.teacherName,
        studentIds: course.studentIds,
        studentNames: course.studentNames,
        date: form.date,
        startTime: form.startTime,
        endTime: form.endTime,
        duration: Math.max(0.5, duration),
        content: form.content.trim(),
        homework: '',
      });
      router.push(`/records?courseId=${courseId}`);
    } catch (err: any) {
      alert('保存失败: ' + err.message);
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-400">加载课程信息...</div>;
  }

  if (!course) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400 mb-4">未找到课程信息</p>
        <button onClick={() => router.push('/courses')} className="text-primary-600 hover:underline">返回课程列表</button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
      <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <h3 className="font-medium text-gray-800 mb-2">{course.name}</h3>
        <div className="text-sm text-gray-500 space-y-1">
          <p>👨‍🏫 上课老师：{course.teacherName}</p>
          <p>👦 上课学生：{course.studentNames?.join('、') || '无'}</p>
          <p>📖 课程类型：{course.type === 'group' ? '集体课程' : '个人课程'}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">上课日期 *</label>
          <input type="date" value={form.date}
            onChange={e => setForm(prev => ({ ...prev, date: e.target.value }))}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none" />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">开始时间 *</label>
          <input type="time" value={form.startTime}
            onChange={e => handleStartTimeChange(e.target.value)}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none" />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">结束时间 *</label>
          <input type="time" value={form.endTime}
            onChange={e => setForm(prev => ({ ...prev, endTime: e.target.value }))}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none" />
          {course.classHour && (
            <p className="text-xs text-gray-400 mt-1">课程时长 {course.classHour} 分钟，自动计算结束时间</p>
          )}
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">教学内容</label>
          <textarea value={form.content}
            onChange={e => setForm(prev => ({ ...prev, content: e.target.value }))}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none resize-y"
            rows={4} placeholder="可选，记录本次上课内容" />
        </div>
      </div>

      <div className="flex items-center gap-3 mt-4">
        <button type="submit"
          className="px-6 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors">
          💾 保存上课记录
        </button>
        <button type="button" onClick={() => router.back()}
          className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
          取消
        </button>
      </div>
    </form>
  );
}

function NewRecordPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const courseId = searchParams.get('courseId');

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push(`/records?courseId=${courseId}`)}
          className="text-gray-400 hover:text-gray-600">
          ← 返回
        </button>
        <h2 className="text-lg font-semibold text-gray-800">添加上课记录</h2>
      </div>
      <Suspense fallback={<div className="text-center py-12 text-gray-400">加载中...</div>}>
        <NewRecordForm />
      </Suspense>
    </div>
  );
}

export default function NewRecordPage() {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-8">
          <Suspense fallback={<div className="text-center py-12 text-gray-400">加载中...</div>}>
            <NewRecordPageContent />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
