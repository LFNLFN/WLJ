'use client';

import { Suspense } from 'react';
import LessonPlanForm from '@/components/lesson-plan/LessonPlanForm';

export default function EditLessonPlanPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center text-gray-400">加载中...</div>}>
      <LessonPlanForm />
    </Suspense>
  );
}
