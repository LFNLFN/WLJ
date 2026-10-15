'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import Table from '@/components/Table';
import { getStudents, getCourses, getTrainingPlans, getLessonPlans, deleteStudent } from '@/lib/api';
import type { Student } from '@/lib/types';

/**
 * 把「可能失败的接口」变成「永不 reject」：失败时退化为 fallback 值。
 *
 * 这样 Promise.all 里任何一个模块（课程 / 训练计划 / 教案）挂掉，
 * 都不会让 .then 不执行 —— 学生列表照常渲染。
 */
const safe = <T,>(p: Promise<T>, label: string, fallback: T): Promise<T> =>
  p.catch((err) => {
    console.warn(`${label}加载失败，已降级处理：`, err?.message || err);
    return fallback;
  });

export default function StudentsPage() {
  const router = useRouter();
  const [students, setStudents] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [trainingPlans, setTrainingPlans] = useState<any[]>([]);
  const [lessonPlans, setLessonPlans] = useState<any[]>([]);

  const loadData = () => {
    // ⚠️ 每个请求都用 safe() 包一层：任何接口 500（例如 training_plans /
    // lesson_plans 表不存在）都只让该项降级成空数组，不能让 Promise.all reject。
    // 原先裸用 Promise.all：一个 reject → .then 永不执行 → 学生列表恒为空。
    Promise.all([
      safe(getStudents(), '学生列表', []),
      safe(getCourses(), '课程', []),
      safe(getTrainingPlans(), '训练计划', []),
      safe(getLessonPlans(), '教案', []),
    ]).then(([studentsData, coursesData, plansData, lessonData]) => {
      setStudents(studentsData || []);
      setCourses(coursesData || []);
      setTrainingPlans(plansData || []);
      setLessonPlans(lessonData || []);
    });
  };

  useEffect(() => { loadData(); }, []);

  const handleDelete = (student: any) => {
    if (confirm(`确定要删除学生 "${student.name}" 吗？`)) {
      deleteStudent(student._id).then(loadData).catch(err => alert('删除失败'));
    }
  };

  // 查找学生关联的课程
  const getStudentCourses = (studentId: string) => {
    return courses.filter((c: any) =>
      c.studentIds && c.studentIds.includes(studentId)
    );
  };

  // 查找学生关联的训练计划
  const getStudentTrainingPlans = (studentName: string) => {
    if (!studentName) return [];
    return trainingPlans.filter((p: any) =>
      p.childName && p.childName.includes(studentName)
    );
  };

  // 查找学生关联的教案
  const getStudentLessonPlans = (studentName: string) => {
    if (!studentName) return [];
    return lessonPlans.filter((p: any) =>
      p.studentName && p.studentName.includes(studentName)
    );
  };

  const columns = [
    { key: 'name', label: '姓名' },
    { key: 'birthDate', label: '出生日期',
      render: (val: string) => val ? new Date(val).toLocaleDateString('zh-CN') : '-',
    },
    { key: 'age', label: '年龄',
      render: (val: number) => val ? `${val} 岁` : '-',
    },
    { key: 'parentName', label: '家长姓名' },
    { key: 'parentPhone', label: '家长电话' },
    {
      key: 'courses', label: '关联课程',
      render: (_: any, row: any) => {
        const studentCourses = getStudentCourses(row._id);
        if (studentCourses.length === 0) return <span className="text-gray-400">-</span>;
        return (
          <div className="flex gap-1 flex-wrap max-w-xs">
            {studentCourses.map((c: any) => (
              <button
                key={c._id}
                onClick={() => router.push(`/courses/edit?id=${c._id}`)}
                className="px-2 py-0.5 bg-primary-50 text-primary-700 text-xs rounded-full whitespace-nowrap hover:bg-primary-100 hover:text-primary-800 transition-colors cursor-pointer"
                title="点击查看课程详情"
              >
                {c.name}
              </button>
            ))}
          </div>
        );
      }
    },
    { key: 'createdAt', label: '添加时间',
      render: (val: string) => new Date(val).toLocaleDateString('zh-CN')
    },
  ];

  const goToAssessments = (student: any) => {
    router.push(`/students/assessments?studentId=${student._id || student.id}`);
  };

  const goToNewAssessment = (student: any) => {
    router.push(`/scales/records/new?studentId=${student._id || student.id}`);
  };

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-800">学生管理</h2>
              <p className="text-gray-500 text-sm mt-1">管理学生信息，查看和录入量表评估</p>
            </div>
            <button
              onClick={() => router.push('/students/new')}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              ➕ 添加学生
            </button>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6 flex items-center gap-4">
            <span className="text-sm text-gray-500">共 {students.length} 位学生</span>
            <span className="text-gray-300">|</span>
            <span className="text-sm text-gray-500">
              点击"查看评估"查看学生所有量表结果，点击"新建评估"快速录入
            </span>
          </div>

          <Table
            columns={columns}
            data={students}
            onEdit={(row) => router.push(`/students/edit?id=${row._id}`)}
            onDelete={handleDelete}
            actions={[
              {
                label: '📊 查看评估',
                onClick: goToAssessments,
                color: 'text-blue-600',
                hoverColor: 'hover:bg-blue-50',
              },
              {
                label: '➕ 新建评估',
                onClick: goToNewAssessment,
                color: 'text-green-600',
                hoverColor: 'hover:bg-green-50',
              },
              {
                label: '📋 训练计划',
                onClick: (row: any) => {
                  const studentPlans = getStudentTrainingPlans(row.name);
                  const planIds = studentPlans.map((p: any) => p._id).join(',');
                  if (planIds) {
                    router.push(`/training-plans?ids=${planIds}`);
                  } else {
                    router.push(`/training-plan`);
                  }
                },
                color: 'text-purple-600',
                hoverColor: 'hover:bg-purple-50',
              },
              {
                label: '📄 教案',
                onClick: (row: any) => {
                  const studentLP = getStudentLessonPlans(row.name);
                  const lpIds = studentLP.map((p: any) => p._id).join(',');
                  if (lpIds) {
                    router.push(`/lesson-plans?ids=${lpIds}`);
                  } else {
                    router.push(`/lesson-plans`);
                  }
                },
                color: 'text-orange-600',
                hoverColor: 'hover:bg-orange-50',
              },
            ]}
          />
        </main>
      </div>
    </div>
  );
}
