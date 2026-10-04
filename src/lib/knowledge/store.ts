/**
 * 平台知识库存储层。
 *
 * 「知识库」= 业务库里的 knowledge_documents 表，页面（AI 智能助理 → 📚 知识库）
 * 上传的资料落到这里，并被 search_knowledge_base 工具检索到。
 *
 * 设计取舍：
 * - 建表是**幂等**的（CREATE TABLE IF NOT EXISTS），首次使用时自动创建，
 *   不影响其它表，也不依赖额外迁移工具；同时提供 scripts/init-knowledge-table.js 供运维手动执行。
 * - 内容以纯文本存储（上传文件先经过 knowledge/extract.ts 抽取），不存二进制，
 *   避免把大文件塞进线上库。
 */

import { getDb } from '../api/db';

export const KNOWLEDGE_CATEGORIES = [
  '机构制度',
  '课程体系',
  '评估量表',
  '教案',
  '训练计划',
  '康复档案',
  '其它',
] as const;

export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];

export interface KnowledgeDocument {
  id: string;
  title: string;
  category: string;
  content: string;
  filename: string | null;
  mimetype: string | null;
  size: number;
  source: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 列表接口里每条正文最多回传多少字符（列表只做预览，避免响应过大） */
export const LIST_CONTENT_PREVIEW = 300;

/** 单个上传文件大小上限 */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

let tableEnsured = false;

export async function ensureKnowledgeTable(): Promise<void> {
  if (tableEnsured) return;
  const db = await getDb();
  await db.query(`
    CREATE TABLE IF NOT EXISTS knowledge_documents (
      id text PRIMARY KEY,
      title text NOT NULL DEFAULT '',
      category text NOT NULL DEFAULT '其它',
      content text NOT NULL DEFAULT '',
      filename text,
      mimetype text,
      size integer NOT NULL DEFAULT 0,
      source text NOT NULL DEFAULT 'upload',
      "createdBy" text,
      "createdAt" text,
      "updatedAt" text
    )
  `);
  // 检索用：标题 + 正文的模糊匹配
  await db.query(`CREATE INDEX IF NOT EXISTS knowledge_documents_created_at_idx ON knowledge_documents ("createdAt" DESC)`);
  tableEnsured = true;
}

function generateId(): string {
  return 'kb_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function normalizeTitle(title: string): string {
  return String(title || '').replace(/\s+/g, ' ').trim().slice(0, 200);
}

function normalizeCategory(category: string): string {
  const value = String(category || '').trim();
  return (KNOWLEDGE_CATEGORIES as readonly string[]).includes(value) ? value : '其它';
}

export interface CreateKnowledgeInput {
  title: string;
  category?: string;
  content: string;
  filename?: string | null;
  mimetype?: string | null;
  size?: number;
  source?: string;
  createdBy?: string | null;
}

export async function createKnowledgeDocument(input: CreateKnowledgeInput): Promise<KnowledgeDocument> {
  await ensureKnowledgeTable();
  const db = await getDb();
  const now = new Date().toISOString();
  const id = generateId();
  const row = {
    id,
    title: normalizeTitle(input.title),
    category: normalizeCategory(input.category || ''),
    content: String(input.content || ''),
    filename: input.filename ?? null,
    mimetype: input.mimetype ?? null,
    size: Number.isFinite(input.size) ? Number(input.size) : 0,
    source: input.source || 'upload',
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
  const result = await db.query(
    `INSERT INTO knowledge_documents (id, title, category, content, filename, mimetype, size, source, "createdBy", "createdAt", "updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [
      row.id,
      row.title,
      row.category,
      row.content,
      row.filename,
      row.mimetype,
      row.size,
      row.source,
      row.createdBy,
      row.createdAt,
      row.updatedAt,
    ]
  );
  return result.rows[0] as KnowledgeDocument;
}

export interface ListKnowledgeOptions {
  q?: string;
  category?: string;
  limit?: number;
  offset?: number;
  /** 是否返回完整正文（详情用），默认只回传预览 */
  fullContent?: boolean;
}

export async function listKnowledgeDocuments(options: ListKnowledgeOptions = {}) {
  await ensureKnowledgeTable();
  const db = await getDb();
  const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 200);
  const offset = Math.max(Number(options.offset) || 0, 0);
  const conditions: string[] = [];
  const params: unknown[] = [];

  const q = String(options.q || '').trim();
  if (q) {
    params.push(`%${q}%`);
    conditions.push(`(title ILIKE $${params.length} OR content ILIKE $${params.length} OR category ILIKE $${params.length})`);
  }
  const category = String(options.category || '').trim();
  if (category) {
    params.push(category);
    conditions.push(`category = $${params.length}`);
  }

  const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
  const countResult = await db.query(`SELECT count(*)::int AS total FROM knowledge_documents${where}`, params);
  const listResult = await db.query(
    `SELECT id, title, category, filename, mimetype, size, source, "createdBy", "createdAt", "updatedAt",
            length(content) AS "contentLength",
            ${options.fullContent ? 'content' : `left(content, ${LIST_CONTENT_PREVIEW}) AS content`}
     FROM knowledge_documents${where}
     ORDER BY "createdAt" DESC
     LIMIT ${limit} OFFSET ${offset}`,
    params
  );

  return {
    total: countResult.rows[0]?.total ?? 0,
    limit,
    offset,
    items: listResult.rows,
  };
}

export async function getKnowledgeDocument(id: string): Promise<KnowledgeDocument | null> {
  await ensureKnowledgeTable();
  const db = await getDb();
  const result = await db.query(`SELECT * FROM knowledge_documents WHERE id = $1`, [String(id)]);
  return (result.rows[0] as KnowledgeDocument) ?? null;
}

export async function deleteKnowledgeDocument(id: string): Promise<boolean> {
  await ensureKnowledgeTable();
  const db = await getDb();
  const result = await db.query(`DELETE FROM knowledge_documents WHERE id = $1`, [String(id)]);
  return (result.rowCount ?? 0) > 0;
}
