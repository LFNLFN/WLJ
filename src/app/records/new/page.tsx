'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { getCourses, saveClassRecord, batchCreateClassRecords } from '@/lib/api';
import { getToday } from '@/lib/utils';
import type { ClassRecord } from '@/lib/types';

export default function NewRecordPage() {
  const router = useRouter();
  const [courses, setCourses] = useState<any[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<any | null>(null);
  const [form, setForm] = useState({
    courseId: '',
    date: getToday(),
    startTime: '09:00',
    endTime: '10:00',
    content: '',
    homework: '',
    status: 'completed' as ClassRecord['status'],
  });

  useEffect(() => {
    getCourses().then(data => setCourses(data));
  }, []);

  useEffect(() => {
    if (form.courseId) {
      const course = courses.find(c => c._id === form.courseId);
      setSelectedCourse(course || null);
      if (course) {
        const [sh, sm] = form.startTime.split(':').map(Number);
        const startMinutes = sh * 60 + sm;
        const endMinutes = startMinutes + (course.classHour * 60);
        const eh = Math.floor(endMinutes / 60);
        const em = endMinutes % 60;
        setForm(prev => ({
          ...prev,
          endTime: `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`
        }));
      }
    } else {
      setSelectedCourse(null);
    }
  }, [form.courseId, courses]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.courseId) {
      alert('请选择课程');
      return;
    }

    const course = courses.find(c => c._id === form.courseId)!;
    const [sh, sm] = form.startTime.split(':').map(Number);
    const [eh, em] = form.endTime.split(':').map(Number);
    const duration = ((eh * 60 + em) - (sh * 60 + sm)) / 60;

    batchCreateClassRecords({
      courseId: form.courseId,
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
      homework: form.homework.trim(),
      status: form.status,
    }).then(() => {
      router.push('/records');
    }).catch(err => {
      alert('保存失败: ' + err.message);
    });
  };

  const handleStartTimeChange = (val: string) => {
    setForm(prev => ({ ...prev, startTime: val }));
    if (selectedCourse) {
      const [sh, sm] = val.split(':').map(Number);
      const startMinutes = sh * 60 + sm;
      const endMinutes = startMinutes + (selectedCourse.classHour * 60);
      const eh = Math.floor(endMinutes / 60);
      const em = endMinutes % 60;
      setForm(prev => ({
        ...prev,
        endTime: `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`
      }));
    }
  };

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-2xl mx-auto">
            <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">选择课程 *</label>
                <select value={form.courseId} onChange={e => setForm(prev => ({ ...prev, courseId: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none bg-white">
                  <option value="">选择课程</option>
                  {courses.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} - {c.teacherName} ({c.studentNames.join('、')})
                    </option>
                  ))}
                </select>
                {courses.length === 0 && <p className="text-xs text-red-500 mt-1">请先在"课程管理"中添加课程</p>}
              </div>

              {selectedCourse && (
                <div className="bg-gray-50 rounded-lg p-4 mb-6">
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">学生：</span>{selectedCourse.studentNames.join('、')}
                  </p>
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">每节课时：</span>{selectedCourse.classHour}小时
                  </p>
                </div>
              )}

              <div className="grid grid-cols-3 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">日期</label>
                  <input type="date" value={form.date} onChange={e => setForm(prev => ({ ...prev, date: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">开始时间</label>
                  <input type="time" value={form.startTime} onChange={e => handleStartTimeChange(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">结束时间</label>
                  <input type="time" value={form.endTime} onChange={e => setForm(prev => ({ ...prev, endTime: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none" />
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">教学内容</label>
                <textarea value={form.content} onChange={e => setForm(prev => ({ ...prev, content: e.target.value }))}
                  rows={3} placeholder="记录本节课的教学内容..."
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none resize-none" />
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">课后作业</label>
                <textarea value={form.homework} onChange={e => setForm(prev => ({ ...prev, homework: e.target.value }))}
                  rows={2} placeholder="记录布置的作业..."
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none resize-none" />
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">状态</label>
                <div className="flex gap-3">
                  {(['completed', 'pending', 'cancelled'] as const).map(status => (
                    <button key={status} type="button" onClick={() => setForm(prev => ({ ...prev, status }))}
                      className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
                        form.status === status
                          ? 'bg-primary-600 text-white border-primary-600'
                          : 'bg-white text-gray-600 border-gray-300'
                      }`}>
                      {status === 'completed' ? '✅ 已完成' : status === 'pending' ? '⏳ 待确认' : '❌ 已取消'}
                    </button>
                  ))}
                </div>
              </div>

              {selectedCourse && (
                <div className="bg-blue-50 rounded-lg p-4 mb-6">
                  <p className="text-sm text-blue-800">
                    💡 将为 {selectedCourse.studentNames.length} 位学生一次性创建上课记录
                  </p>
                </div>
              )}

              <div className="flex items-center gap-3">
                <button type="submit" className="px-6 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors">
                  💾 保存记录
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
