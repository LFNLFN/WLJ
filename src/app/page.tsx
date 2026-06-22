'use client';

import { useEffect, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import Card from '@/components/Card';
import { getStats } from '@/lib/api';
import type { ClassRecord } from '@/lib/types';
import { formatDate } from '@/lib/utils';

export default function Dashboard() {
  const [stats, setStats] = useState({
    teachers: 0,
    students: 0,
    courses: 0,
    records: 0,
  });
  const [recentRecords, setRecentRecords] = useState<ClassRecord[]>([]);

  useEffect(() => {
    getStats().then(data => {
      setStats({
        teachers: data.teachers,
        students: data.students,
        courses: data.courses,
        records: data.records,
      });
      setRecentRecords(data.recentRecords || []);
    }).catch(err => {
      console.error('加载数据失败:', err);
    });
  }, []);

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card title="教师总数" value={stats.teachers} icon="👨‍🏫" color="bg-[#FFF0E0]" />
            <Card title="学生总数" value={stats.students} icon="👦" color="bg-[#E8F5E9]" />
            <Card title="课程总数" value={stats.courses} icon="📚" color="bg-[#E3F2FD]" />
            <Card title="上课记录" value={stats.records} icon="📝" color="bg-[#FCE4EC]" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <a href="/teachers/new" className="flex items-center gap-3 bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md hover:border-[#F08020] transition-all">
              <span className="text-2xl">➕</span>
              <div>
                <p className="font-medium text-gray-800">添加教师</p>
                <p className="text-sm text-gray-500">登记新的教师信息</p>
              </div>
            </a>
            <a href="/students/new" className="flex items-center gap-3 bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md hover:border-[#F08020] transition-all">
              <span className="text-2xl">➕</span>
              <div>
                <p className="font-medium text-gray-800">添加学生</p>
                <p className="text-sm text-gray-500">登记新的学生信息</p>
              </div>
            </a>
            <a href="/courses/new" className="flex items-center gap-3 bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md hover:border-[#F08020] transition-all">
              <span className="text-2xl">➕</span>
              <div>
                <p className="font-medium text-gray-800">添加课程</p>
                <p className="text-sm text-gray-500">创建新的课程计划</p>
              </div>
            </a>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">最近上课记录</h3>
              <a href="/records" className="text-sm text-[#F08020] hover:text-[#D06010]">查看全部 →</a>
            </div>
            {recentRecords.length === 0 ? (
              <p className="text-gray-400 text-center py-8">还没有上课记录</p>
            ) : (
              <div className="space-y-3">
                {recentRecords.map((record) => (
                  <div key={record.id} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
                    <div className="flex items-center gap-3">

                      <div>
                        <p className="text-sm font-medium text-gray-800">{record.courseName}</p>
                        <p className="text-xs text-gray-500">
                          {record.studentName} · {record.teacherName}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm text-gray-500">{formatDate(record.date)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
