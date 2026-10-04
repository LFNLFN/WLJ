/**
 * 火山知识库（Viking KnowledgeBase）服务客户端。
 *
 * ## 关于「官方 Node SDK」的实测结论（2026-10-04）
 *
 * - npm 上火山引擎的官方包是：`@volcengine/openapi`（通用 OpenAPI 客户端 + AK/SK V4 签名）、
 *   `@volcengine/sdk-core`，以及按产品生成的 swagger 客户端（`@volcengine/ark`、`@volcengine/kms`、
 *   `@volcengine/billing` …）。
 * - 实测 `@volcengine/openapi@1.36.2` 包内**没有**知识库（Viking KnowledgeBase）的服务定义，
 *   npm 搜索也没有对应的知识库客户端；知识库只有**官方 Python SDK**
 *   （`volcengine/viking_knowledgebase/VikingKnowledgeBaseService.py`）。
 * - 所以本文件直接调用知识库服务的 HTTP 接口（与 Python SDK 封装的是同一批 `/api/knowledge/*` 接口），
 *   鉴权用控制台「知识库 → API Key」生成的 Key（`Authorization: Bearer …`，已实测可用）。
 *   官方 Python SDK 走的是 AK/SK V4 签名（service = `air`，region = `cn-beijing`）；
 *   以后若要改成 AK/SK，签名可直接复用 `@volcengine/openapi` 的 SignerV4。
 *
 * ## 接口清单（实测）
 *
 * | 用途 | 接口 |
 * |---|---|
 * | 文档列表 | `POST /api/knowledge/doc/list` → `data.doc_list[]`（doc_name / doc_id / doc_type / add_type / create_time …） |
 * | 按 URL 入库 | `POST /api/knowledge/doc/add`，`add_type="url"` 时必填 `doc_id`+`doc_name`+`doc_type`+`url`（服务端自己去抓取解析） |
 * | 删除文档 | `POST /api/knowledge/doc/delete`（异步，列表会滞后几秒） |
 * | 切片列表 | `POST /api/knowledge/point/list`（`md_content` 是切片正文） |
 * | 检索 | `POST /api/knowledge/collection/search_knowledge`（见 agent-tools.ts） |
 *
 * ⚠️ `add_type="tos_fe"`（控制台拖文件上传用的那种）在 API Key 身份下会返回
 * `not support tos_fe for user:xxxx`，即**没有权限**；能用的是 `url`（服务端按 URL 抓取）。
 */

import { MAX_UPLOAD_BYTES } from './store';

const DEFAULT_HOST = 'https://api-knowledgebase.mlp.cn-beijing.volces.com';

export interface VikingDoc {
  collectionName: string;
  docId: string;
  docName: string;
  docType: string;
  addType: string;
  createTime: number;
  updateTime: number;
  addedBy: string;
  /** 该文档切了多少片（列表接口不返回，按需单独查） */
  pointCount?: number;
}

export function isVikingConfigured(): boolean {
  return Boolean(getApiKey());
}

function getApiKey(): string {
  return (process.env.KB_API_KEY || process.env.VIKING_KB_API_KEY || '').trim();
}

function getHost(): string {
  return (process.env.KB_API_HOST || DEFAULT_HOST).replace(/\/+$/, '');
}

function getCollection(): { name: string; resourceId: string } {
  return {
    name: (process.env.KB_COLLECTION_NAME || process.env.ARK_KNOWLEDGE_BASE_ID || '').trim(),
    resourceId: (process.env.KB_RESOURCE_ID || process.env.ARK_KNOWLEDGE_BASE_ID || '').trim(),
  };
}

function fail(message: string): never {
  throw new Error(message);
}

/**
 * 调知识库服务（统一鉴权 / 超时 / 429·5xx 退避重试 / 错误信息中文化）。
 */
async function vikingCall<T = any>(path: string, body: Record<string, unknown>): Promise<T> {
  const apiKey = getApiKey();
  if (!apiKey) {
    fail('未配置 KB_API_KEY（火山知识库 API Key），无法访问知识库');
  }

  const collection = getCollection();
  if (!collection.name) {
    fail('未配置 KB_COLLECTION_NAME（知识库名称，例如 WLJ）');
  }

  const url = `${getHost()}${path}`;
  const timeoutMs = Number(process.env.KB_API_TIMEOUT_MS || 15_000);
  const attempts = Math.max(1, Math.min(3, Number(process.env.KB_API_RETRY || 2)));
  const payload = { name: collection.name, project: process.env.KB_PROJECT || 'default',
    ...(collection.resourceId ? { resource_id: collection.resourceId } : {}), ...body };

  let lastText = '';
  let lastStatus = 0;

  for (let i = 0; i < attempts; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      lastStatus = res.status;
      lastText = await res.text();

      if (res.ok) {
        const json = JSON.parse(lastText) as any;
        if (json?.code && json.code !== 0) fail(`知识库返回错误(${json.code})：${json.message || lastText.slice(0, 200)}`);
        return (json?.data ?? json) as T;
      }

      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || i === attempts - 1) break;
      await new Promise((r) => setTimeout(r, 1200 * (i + 1)));
    } catch (err: any) {
      if (err?.message?.startsWith('知识库')) throw err;
      if (i === attempts - 1) fail(`知识库请求失败：${err?.message || err}`);
      await new Promise((r) => setTimeout(r, 1200 * (i + 1)));
    } finally {
      clearTimeout(timer);
    }
  }

  fail(`知识库请求失败(${lastStatus})：${lastText.slice(0, 220)}`);
}

/** 文档列表 */
export async function listVikingDocs(options: { pageNum?: number; pageSize?: number } = {}): Promise<{ total: number; items: VikingDoc[] }> {
  const data = await vikingCall<any>('/api/knowledge/doc/list', {
    page_num: options.pageNum ?? 1,
    page_size: options.pageSize ?? 50,
  });

  const items: VikingDoc[] = (data?.doc_list ?? []).map((d: any) => ({
    collectionName: d.collection_name ?? '',
    docId: String(d.doc_id ?? ''),
    docName: String(d.doc_name ?? ''),
    docType: String(d.doc_type ?? ''),
    addType: String(d.add_type ?? ''),
    createTime: Number(d.create_time ?? 0),
    updateTime: Number(d.update_time ?? 0),
    addedBy: String(d.added_by ?? ''),
  }));

  return { total: Number(data?.total_num ?? items.length), items };
}

/**
 * 某个文档的切片（预览用，只取前几条）。
 *
 * ⚠️ 实测：`point/list` **不按 `doc_id` 过滤**（传 doc_id 也返回整个集合的切片）——
 * 所以这里取一页后在本地按 `point_id` 是否包含 doc_id 过滤
 * （实测 point_id 形如 `415467-<doc_id>-0`，前缀里带 doc_id）。
 */
export async function listVikingPoints(docId: string, options: { pageSize?: number } = {}) {
  const want = Math.max(1, Math.min(20, options.pageSize ?? 5));
  const data = await vikingCall<any>('/api/knowledge/point/list', {
    page_num: 1,
    page_size: 100,
  });
  const all = (data?.point_list ?? []).map((p: any) => ({
    pointId: String(p.point_id ?? ''),
    content: String(p.md_content ?? p.content ?? ''),
  }));
  const mine = all.filter((p: { pointId: string }) => !docId || p.pointId.includes(docId));
  return { total: mine.length || all.length, items: (mine.length ? mine : all).slice(0, want), filtered: mine.length > 0 };
}

/** 按 URL 添加文档（服务端自己去抓取、解析、切片；`tos_fe` 上传方式 API Key 无权使用） */
export async function addVikingDocByUrl(input: { docId: string; docName: string; docType: string; url: string }) {
  if (!input.docId) fail('doc_id 不能为空');
  if (!input.docName) fail('doc_name 不能为空');
  if (!input.docType) fail('doc_type 不能为空');
  if (!input.url) fail('url 不能为空');

  const data = await vikingCall<any>('/api/knowledge/doc/add', {
    add_type: 'url',
    doc_id: input.docId,
    doc_name: input.docName,
    doc_type: input.docType,
    url: input.url,
  });

  return { docId: String(data?.doc_id ?? input.docId), collectionName: String(data?.collection_name ?? '') };
}

/** 删除文档（异步，列表会滞后几秒） */
export async function deleteVikingDoc(docId: string): Promise<void> {
  if (!docId) fail('doc_id 不能为空');
  await vikingCall('/api/knowledge/doc/delete', { doc_id: docId });
}

/** 文件名 → doc_type（知识库按扩展名决定解析方式） */
export function docTypeFromFilename(filename: string): string {
  const ext = String(filename || '').split('.').pop()?.toLowerCase() || '';
  const known = ['pdf', 'docx', 'doc', 'txt', 'md', 'markdown', 'csv', 'xlsx', 'xls', 'pptx', 'ppt', 'html', 'json'];
  return known.includes(ext) ? ext : 'txt';
}

/** 上传到知识库的单个文件大小上限（与平台知识库一致） */
export const VIKING_MAX_UPLOAD_BYTES = MAX_UPLOAD_BYTES;
