'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  getCourseLessons,
  getCourseWeekSummaries,
  saveCourseWeekSummary,
} from '@/lib/api';
import { runAiJob } from '@/lib/ai/job-client';

interface CourseStudent {
  id: string;
  name: string;
}

interface CourseWeekSummariesProps {
  courseId?: string;
  courseName?: string;
  teacherName?: string;
  students?: CourseStudent[];
  refreshToken?: number;
}

interface StudentWeekState {
  studentId: string;
  studentName: string;
  id: string;
  summary: string;
  homework: string;
  status: 'draft' | 'submitted';
  submittedAt: string;
  submittedByName: string;
  expanded: boolean;
  saving: boolean;
  generating: boolean;
  error: string;
}

interface WeekState {
  weekStart: string;
  weekEnd: string;
  lessons: any[];
  students: StudentWeekState[];
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function parseDate(value: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function formatDate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 周一作为一周开始 */
function mondayOf(value: string) {
  const d = parseDate(value);
  if (!d) return '';
  const day = d.getDay(); // 0=周日
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return formatDate(d);
}

function addDays(value: string, days: number) {
  const d = parseDate(value);
  if (!d) return '';
  d.setDate(d.getDate() + days);
  return formatDate(d);
}

function weekLabel(start: string, end: string) {
  const a = parseDate(start);
  const b = parseDate(end);
  if (!a || !b) return `${start} - ${end}`;
  return `${a.getMonth() + 1}月${a.getDate()}日 - ${b.getMonth() + 1}月${b.getDate()}日`;
}

function emptyStudent(student: CourseStudent, expanded: boolean): StudentWeekState {
  return {
    studentId: student.id,
    studentName: student.name,
    id: '',
    summary: '',
    homework: '',
    status: 'draft',
    submittedAt: '',
    submittedByName: '',
    expanded,
    saving: false,
    generating: false,
    error: '',
  };
}

export default function CourseWeekSummaries({
  courseId,
  courseName,
  teacherName,
  students = [],
  refreshToken = 0,
}: CourseWeekSummariesProps) {
  const [weeks, setWeeks] = useState<WeekState[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const courseStudents = useMemo(
    () => (Array.isArray(students) ? students : []).map((s) => ({
      id: String((s as any).id || (s as any)._id || ''),
      name: (s as any).name || '未命名',
    })).filter((s) => s.id),
    [students]
  );
  const studentKey = courseStudents.map((s) => s.id).join('|');

  useEffect(() => {
    if (!courseId) {
      setWeeks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    Promise.all([getCourseLessons(courseId), getCourseWeekSummaries(courseId)])
      .then(([lessonList, summaryList]) => {
        const lessons = Array.isArray(lessonList) ? lessonList : [];
        const summaries = Array.isArray(summaryList) ? summaryList : [];

        const groups: Record<string, any[]> = {};
        for (const lesson of lessons) {
          const start = mondayOf(lesson.date);
          if (!start) continue;
          if (!groups[start]) groups[start] = [];
          groups[start].push(lesson);
        }
        for (const key of Object.keys(groups)) {
          groups[key].sort((a, b) => String(a.date).localeCompare(String(b.date)));
        }

        const summaryByKey = new Map<string, any>();
        for (const item of summaries) {
          summaryByKey.set(`${item.weekStart || ''}|${item.studentId || ''}`, item);
        }

        const singleStudent = courseStudents.length === 1;
        const next = Object.keys(groups)
          .sort((a, b) => b.localeCompare(a))
          .map((start) => {
            const weekEnd = addDays(start, 6);
            const studentStates = courseStudents.map((student) => {
              const state = emptyStudent(student, singleStudent);
              const existing = summaryByKey.get(`${start}|${student.id}`);
              if (existing) {
                state.id = existing.id || '';
                state.summary = existing.summary || '';
                state.homework = existing.homework || '';
                state.status = existing.status === 'submitted' ? 'submitted' : 'draft';
                state.submittedAt = existing.submittedAt || '';
                state.submittedByName = existing.submittedByName || '';
              }
              return state;
            });
            return { weekStart: start, weekEnd, lessons: groups[start], students: studentStates };
          });

        setWeeks(next);
      })
      .catch((err: any) => setError(err?.message || '加载周总结失败'))
      .finally(() => setLoading(false));
  }, [courseId, refreshToken, studentKey]);

  const updateStudent = (weekIndex: number, studentIndex: number, patch: Partial<StudentWeekState>) => {
    setWeeks((prev) => prev.map((week, wi) => {
      if (wi !== weekIndex) return week;
      return {
        ...week,
        students: week.students.map((student, si) => (si === studentIndex ? { ...student, ...patch } : student)),
      };
    }));
  };

  const handleGenerate = async (weekIndex: number, studentIndex: number) => {
    const week = weeks[weekIndex];
    const student = week?.students[studentIndex];
    if (!week || !student || !courseId || student.generating) return;

    updateStudent(weekIndex, studentIndex, { generating: true, error: '' });
    try {
      const result = await runAiJob('course-week-summary', {
        courseId,
        courseName: courseName || '课程',
        teacherName: teacherName || '',
        studentId: student.studentId,
        studentName: student.studentName,
        weekStart: week.weekStart,
        weekEnd: week.weekEnd,
        lessons: week.lessons.map((lesson) => ({
          lessonNo: lesson.lessonNo,
          date: lesson.date,
          content: lesson.content,
          performance: lesson.performance,
          summary: lesson.summary,
          homework: lesson.homework,
        })),
      });
      updateStudent(weekIndex, studentIndex, {
        summary: result?.summary || student.summary,
        homework: result?.homework || student.homework,
        generating: false,
        expanded: true,
      });
    } catch (err: any) {
      updateStudent(weekIndex, studentIndex, {
        generating: false,
        error: err?.message || 'AI 生成失败，请稍后重试',
      });
    }
  };

  const handleSave = async (weekIndex: number, studentIndex: number, status: 'draft' | 'submitted') => {
    const week = weeks[weekIndex];
    const student = week?.students[studentIndex];
    if (!week || !student || !courseId || student.saving) return;
    if (status === 'submitted' && !student.summary.trim()) {
      updateStudent(weekIndex, studentIndex, { error: '提交前请先填写周总结内容' });
      return;
    }

    updateStudent(weekIndex, studentIndex, { saving: true, error: '' });
    try {
      const saved = await saveCourseWeekSummary({
        courseId,
        studentId: student.studentId,
        weekStart: week.weekStart,
        weekEnd: week.weekEnd,
        summary: student.summary.trim(),
        homework: student.homework.trim(),
        status,
        lessonIds: week.lessons.map((lesson) => lesson.id || lesson._id).filter(Boolean),
      });
      updateStudent(weekIndex, studentIndex, {
        saving: false,
        id: saved?.id || student.id,
        status: saved?.status === 'submitted' ? 'submitted' : 'draft',
        submittedAt: saved?.submittedAt || '',
        submittedByName: saved?.submittedByName || '',
      });
      alert(`${student.studentName}：${status === 'submitted' ? '周总结已提交，家长端可见' : '周总结草稿已保存'}`);
    } catch (err: any) {
      updateStudent(weekIndex, studentIndex, {
        saving: false,
        error: err?.message || '保存失败，请稍后重试',
      });
    }
  };

  const totalWeeks = useMemo(() => weeks.length, [weeks]);

  return (
    <div className="mb-6 bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-700">📅 每周课堂总结</h3>
        <p className="text-xs text-gray-400 mt-0.5">
          按孩子分别生成/编辑。保存草稿仅教师可见；确认提交后，家长端才能看到该孩子的周总结。
        </p>
      </div>

      <div className="p-4">
        {!courseId ? (
          <div className="text-sm text-gray-500 bg-gray-50 border border-dashed border-gray-200 rounded-lg p-4">
            课程保存后即可按周整理课堂总结。
          </div>
        ) : courseStudents.length === 0 ? (
          <div className="text-sm text-gray-500 bg-gray-50 border border-dashed border-gray-200 rounded-lg p-4">
            请先在课程中关联学生，再生成周总结。
          </div>
        ) : loading ? (
          <p className="text-sm text-gray-400">加载中...</p>
        ) : error ? (
          <div className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</div>
        ) : totalWeeks === 0 ? (
          <p className="text-sm text-gray-400">本周还没有课后记录，先添加本节课记录后再来生成周总结。</p>
        ) : (
          <div className="space-y-4">
            {weeks.map((week, weekIndex) => (
              <div key={week.weekStart} className="border border-gray-200 rounded-lg p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-primary-50 text-primary-700 text-xs font-medium">
                      {weekLabel(week.weekStart, week.weekEnd)}
                    </span>
                    <span className="text-xs text-gray-400">{week.lessons.length} 节课</span>
                  </div>
                  <span className="text-xs text-gray-400">{week.students.length} 名学生</span>
                </div>

                <details className="mt-2">
                  <summary className="text-xs text-primary-600 cursor-pointer select-none">
                    查看本周 {week.lessons.length} 节课的课后记录
                  </summary>
                  <div className="mt-2 space-y-2">
                    {week.lessons.map((lesson) => (
                      <div key={lesson.id || lesson._id} className="p-2 bg-gray-50 rounded-lg text-xs text-gray-600">
                        <div className="font-medium text-gray-700">
                          第 {lesson.lessonNo} 节 · {lesson.date || ''} {lesson.startTime || ''}
                        </div>
                        {lesson.summary && <div className="mt-1">课堂总结：{lesson.summary}</div>}
                        {lesson.homework && <div className="mt-1">课后练习：{lesson.homework}</div>}
                      </div>
                    ))}
                  </div>
                </details>

                <div className="mt-3 space-y-3">
                  {week.students.map((student, studentIndex) => (
                    <div key={student.studentId} className="border border-gray-100 rounded-lg p-3 bg-gray-50/40">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-800">{student.studentName}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-medium ${
                              student.status === 'submitted'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-orange-100 text-orange-700'
                            }`}
                          >
                            {student.status === 'submitted' ? '✅ 已提交' : '📝 草稿'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => updateStudent(weekIndex, studentIndex, { expanded: !student.expanded })}
                          className="text-xs text-primary-600 hover:text-primary-800"
                        >
                          {student.expanded ? '收起' : '展开编辑'}
                        </button>
                      </div>

                      {student.status === 'submitted' && (
                        <p className="text-xs text-gray-400 mt-1">
                          提交人：{student.submittedByName || '—'} · {student.submittedAt || '—'}
                        </p>
                      )}

                      {!student.expanded ? (
                        <p className="mt-2 text-xs text-gray-500 line-clamp-2">
                          {student.summary || '尚未填写周总结'}
                        </p>
                      ) : (
                        <>
                          <div className="mt-2">
                            <label className="block text-xs text-gray-500 mb-1">本周周总结</label>
                            <textarea
                              value={student.summary}
                              onChange={(e) => updateStudent(weekIndex, studentIndex, { summary: e.target.value, error: '' })}
                              rows={4}
                              placeholder="本周训练重点、孩子表现、进步与需要关注的点、下一步安排"
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none resize-y"
                            />
                          </div>
                          <div className="mt-2">
                            <label className="block text-xs text-gray-500 mb-1">家庭练习建议（可选）</label>
                            <textarea
                              value={student.homework}
                              onChange={(e) => updateStudent(weekIndex, studentIndex, { homework: e.target.value, error: '' })}
                              rows={2}
                              placeholder="本周建议家长在家的练习或注意事项"
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none resize-y"
                            />
                          </div>

                          {student.error && (
                            <div className="mt-2 text-sm text-red-600 bg-red-50 rounded-lg p-2">{student.error}</div>
                          )}

                          <div className="flex flex-wrap items-center gap-2 mt-3">
                            <button
                              type="button"
                              onClick={() => handleGenerate(weekIndex, studentIndex)}
                              disabled={student.generating || student.saving}
                              className="px-3 py-1.5 text-sm rounded-lg bg-primary-50 text-primary-700 hover:bg-primary-100 disabled:opacity-50"
                            >
                              {student.generating ? 'AI 生成中…' : student.summary ? '🔄 AI 重新生成' : '✨ AI 生成周总结'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSave(weekIndex, studentIndex, 'draft')}
                              disabled={student.saving || student.generating}
                              className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                            >
                              {student.saving ? '保存中…' : student.status === 'submitted' ? '撤回为草稿' : '保存草稿'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSave(weekIndex, studentIndex, 'submitted')}
                              disabled={student.saving || student.generating}
                              className="px-3 py-1.5 text-sm rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
                            >
                              确认并提交给家长
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
