import { getDb } from './db';

/**
 * 运行期幂等建表 / 补列。
 *
 * 背景：回归测试发现线上库缺少 `training_plans`、`lesson_plans` 两张表，
 * `class_records` 也停留在旧结构（只有 classHour，没有 startTime / endTime /
 * duration / studentId / studentName 等新列），导致：
 *   GET  /api/training-plans        → 500 relation "training_plans" does not exist
 *   GET  /api/lesson-plans          → 500 relation "lesson_plans" does not exist
 *   POST /api/class-records?batch=1 → 500 column "studentId" does not exist
 *
 * 这里只做「建表 / 加列」这类非破坏性 DDL（IF NOT EXISTS），不删数据、不改类型。
 * 结果挂在 globalThis 上，一个进程只跑一次；失败则清掉缓存，下一个请求会重试。
 */
const SCHEMA_KEY = '__wljSchemaReady_v3';

export function ensureSchema(): Promise<void> {
  const g = globalThis as unknown as Record<string, Promise<void> | undefined>;
  if (!g[SCHEMA_KEY]) {
    g[SCHEMA_KEY] = runMigrations().catch((err) => {
      g[SCHEMA_KEY] = undefined;
      throw err;
    });
  }
  return g[SCHEMA_KEY] as Promise<void>;
}

async function runMigrations(): Promise<void> {
  const db = await getDb();

  // 训练计划
  await db.query(`CREATE TABLE IF NOT EXISTS training_plans (
    id TEXT PRIMARY KEY,
    title TEXT DEFAULT '',
    "childName" TEXT DEFAULT '',
    "planData" TEXT DEFAULT '{}',
    "createdAt" TEXT DEFAULT '',
    "updatedAt" TEXT DEFAULT ''
  )`);

  // 教案
  await db.query(`CREATE TABLE IF NOT EXISTS lesson_plans (
    id TEXT PRIMARY KEY,
    title TEXT DEFAULT '',
    type TEXT DEFAULT 'personal',
    content TEXT DEFAULT '',
    "studentId" TEXT DEFAULT '',
    "studentName" TEXT DEFAULT '',
    "createdAt" TEXT DEFAULT '',
    "updatedAt" TEXT DEFAULT ''
  )`);

  // 上课记录：旧表只有 classHour，补齐页面与批量接口使用的新列
  const classRecordColumns = [    `ALTER TABLE class_records ADD COLUMN IF NOT EXISTS "studentId" TEXT DEFAULT ''`,
    `ALTER TABLE class_records ADD COLUMN IF NOT EXISTS "studentName" TEXT DEFAULT ''`,
    `ALTER TABLE class_records ADD COLUMN IF NOT EXISTS "startTime" TEXT DEFAULT ''`,
    `ALTER TABLE class_records ADD COLUMN IF NOT EXISTS "endTime" TEXT DEFAULT ''`,
    `ALTER TABLE class_records ADD COLUMN IF NOT EXISTS duration INTEGER DEFAULT 0`,
    `ALTER TABLE class_records ADD COLUMN IF NOT EXISTS homework TEXT DEFAULT ''`,
    `ALTER TABLE class_records ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'completed'`,
  ];

  for (const sql of classRecordColumns) {
    try {
      await db.query(sql);
    } catch (err: any) {
      // PostgreSQL 9.6 以下不支持 IF NOT EXISTS；其它错误（权限等）也不应阻断业务读取
      console.warn('[schema] 补列失败（忽略）:', err?.message);
    }
  }

  // 课程：页面/接口会写入 type、教案关联与阶段计划，旧表没有这些列
  const courseColumns = [
    `ALTER TABLE courses ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'personal'`,
    `ALTER TABLE courses ADD COLUMN IF NOT EXISTS "lessonPlanIds" TEXT DEFAULT '[]'`,
    `ALTER TABLE courses ADD COLUMN IF NOT EXISTS "lessonPlanTitles" TEXT DEFAULT '[]'`,
    `ALTER TABLE courses ADD COLUMN IF NOT EXISTS "stagePlanType" TEXT DEFAULT 'lesson'`,
    `ALTER TABLE courses ADD COLUMN IF NOT EXISTS stages TEXT DEFAULT '[]'`,
  ];

  for (const sql of courseColumns) {
    try {
      await db.query(sql);
    } catch (err: any) {
      console.warn('[schema] courses 补列失败（忽略）:', err?.message);
    }
  }

  console.log('[schema] training_plans / lesson_plans / class_records / courses 结构已就绪');
}
