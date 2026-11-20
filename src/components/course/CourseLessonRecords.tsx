'use client';

import { useEffect, useState } from 'react';
import { getCourseLessons, saveCourseLesson, deleteCourseLesson } from '@/lib/api';

interface CourseLessonRecordsProps {
  courseId?: string;
  defaultDuration?: number;
  autoOpen?: boolean;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function calcEndTime(start: string, minutes: number) {
  const [sh, sm] = start.split(':').map(Number);
  if (Number.isNaN(sh) || Number.isNaN(sm)) return '';
  const total = sh * 60 + sm + (Number(minutes) || 45);
  const eh = Math.floor(total / 60) % 24;
  const em = total % 60;
  return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
}

function calcDuration(start: string, end: string) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const minutes = (eh * 60 + em) - (sh * 60 + sm);
  return minutes > 0 ? Math.round((minutes / 60) * 10) / 10 : 0;
}

const emptyForm = (durationMinutes: number) => ({
  date: today(),
  startTime: '09:00',
  endTime: calcEndTime('09:00', durationMinutes),
  content: '',
  performance: '',
  homework: '',
  summary: '',
});

export default function CourseLessonRecords({
  courseId,
  defaultDuration = 45,
  autoOpen = false,
}: CourseLessonRecordsProps) {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(emptyForm(defaultDuration));

  const load = () => {
    if (!courseId) {
      setRecords([]);
      return;
    }
    setLoading(true);
    getCourseLessons(courseId)
      .then((data: any[]) => setRecords(Array.isArray(data) ? data : []))
      .catch((err: any) => setError(err?.message || '加载课后记录失败'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  useEffect(() => {
    if (autoOpen && courseId) {
      setEditingId('');
      setForm(emptyForm(defaultDuration));
      setShowForm(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen, courseId]);

  const startAdd = () => {
    setEditingId('');
    setForm(emptyForm(defaultDuration));
    setError('');
    setShowForm(true);
  };

  const startEdit = (record: any) => {
    setEditingId(record.id || record._id);
    setForm({
      date: record.date || today(),
      startTime: record.startTime || '09:00',
      endTime: record.endTime || '',
      content: record.content || '',
      performance: record.performance || '',
      homework: record.homework || '',
      summary: record.summary || '',
    });
    setError('');
    setShowForm(true);
  };

  const handleStartTime = (value: string) => {
    setForm((prev) => ({
      ...prev,
      startTime: value,
      endTime: calcEndTime(value, defaultDuration),
    }));
  };

  const handleSave = async () => {
    if (!courseId) return;
    if (!form.date) {
      setError('请选择上课日期');
      return;
    }
    if (!form.content.trim()) {
      setError('请填写本节课的教学内容/课后记录');
      return;
    }
    const duration = calcDuration(form.startTime, form.endTime);
    if (duration <= 0) {
      setError('结束时间必须晚于开始时间');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload: any = {
        courseId,
        date: form.date,
        startTime: form.startTime,
        endTime: form.endTime,
        duration,
        content: form.content.trim(),
        performance: form.performance.trim(),
        homework: form.homework.trim(),
        summary: form.summary.trim(),
      };
      if (editingId) payload.id = editingId;
      await saveCourseLesson(payload);
      setShowForm(false);
      setEditingId('');
      load();
    } catch (err: any) {
      setError(err?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (record: any) => {
    if (!confirm(`确定删除第 ${record.lessonNo} 节的课后记录吗？`)) return;
    try {
      await deleteCourseLesson(record.id || record._id);
      load();
    } catch (err: any) {
      alert('删除失败: ' + (err?.message || ''));
    }
  };

  return (
    <div id="course-lesson-records" className="mb-6 bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">📝 课后记录（逐节课）</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            记录每节课的教学内容、课堂表现与课后作业；一个课程可以有多节记录。
            <span className="text-primary-600">「课堂总结」与「课后作业」会同步展示在家长端小程序。</span>
          </p>
        </div>
        {courseId && (
          <button
            type="button"
            onClick={startAdd}
            className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            ➕ 添加本节课记录
          </button>
        )}
      </div>

      <div className="p-4">
        {!courseId ? (
          <div className="text-sm text-gray-500 bg-gray-50 border border-dashed border-gray-200 rounded-lg p-4">
            课程保存后回到编辑页，即可在这里逐节课添加课后记录。
          </div>
        ) : (
          <>
            {error && !showForm && (
              <div className="mb-3 text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</div>
            )}

            {showForm && (
              <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium text-gray-700">
                    {editingId ? '编辑课后记录' : '添加本节课记录'}
                  </h4>
                  <button
                    type="button"
                    onClick={() => { setShowForm(false); setEditingId(''); setError(''); }}
                    className="text-gray-400 hover:text-gray-600 text-sm"
                  >
                    取消
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">上课日期</label>
                    <input
                      type="date"
                      value={form.date}
                      onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">开始时间</label>
                    <input
                      type="time"
                      value={form.startTime}
                      onChange={(e) => handleStartTime(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">结束时间</label>
                    <input
                      type="time"
                      value={form.endTime}
                      onChange={(e) => setForm((prev) => ({ ...prev, endTime: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">教学内容 / 本节课记录 *</label>
                    <textarea
                      value={form.content}
                      onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
                      rows={3}
                      placeholder="本节课练习了什么、完成情况、需要继续关注的点"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none resize-y"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">课堂表现（可选）</label>
                    <textarea
                      value={form.performance}
                      onChange={(e) => setForm((prev) => ({ ...prev, performance: e.target.value }))}
                      rows={2}
                      placeholder="配合程度、情绪、注意力、完成度等"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none resize-y"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">课堂总结（可选）</label>
                    <textarea
                      value={form.summary}
                      onChange={(e) => setForm((prev) => ({ ...prev, summary: e.target.value }))}
                      rows={2}
                      placeholder="本节课的整体总结：目标完成情况、下一步重点、需要家长配合的事项等"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none resize-y"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">课后作业 / 家庭练习（可选）</label>
                    <textarea
                      value={form.homework}
                      onChange={(e) => setForm((prev) => ({ ...prev, homework: e.target.value }))}
                      rows={2}
                      placeholder="给家长的家庭练习或注意事项"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none resize-y"
                    />
                  </div>
                </div>

                {error && <div className="mt-3 text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</div>}

                <div className="flex items-center gap-2 mt-3">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 disabled:opacity-50"
                  >
                    {saving ? '保存中...' : editingId ? '保存修改' : '保存本节课记录'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowForm(false); setEditingId(''); setError(''); }}
                    className="px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}

            {loading ? (
              <p className="text-sm text-gray-400">加载中...</p>
            ) : records.length === 0 ? (
              <p className="text-sm text-gray-400">还没有课后记录，点击右上角「添加本节课记录」开始。</p>
            ) : (
              <div className="space-y-3">
                {records.map((record: any) => (
                  <div key={record.id || record._id} className="border border-gray-100 rounded-lg p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
                        <span className="px-2 py-0.5 rounded bg-primary-50 text-primary-700 text-xs font-medium">
                          第 {record.lessonNo} 节
                        </span>
                        <span className="text-gray-500">
                          {record.date} {record.startTime}-{record.endTime}
                          {record.duration ? ` · ${record.duration}小时` : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <button type="button" onClick={() => startEdit(record)} className="text-primary-600 hover:text-primary-800">
                          编辑
                        </button>
                        <button type="button" onClick={() => handleDelete(record)} className="text-red-500 hover:text-red-700">
                          删除
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 space-y-1 text-sm text-gray-600">
                      <p><span className="text-gray-400">教学内容：</span>{record.content || '—'}</p>
                      {record.performance && <p><span className="text-gray-400">课堂表现：</span>{record.performance}</p>}
                      {record.homework && <p><span className="text-gray-400">课后作业：</span>{record.homework}</p>}
                      {record.summary && <p><span className="text-gray-400">课堂总结：</span>{record.summary}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
