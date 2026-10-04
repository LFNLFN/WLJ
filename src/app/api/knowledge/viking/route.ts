/**
 * 火山知识库（Viking KnowledgeBase）文档管理接口 —— 智能助理页面的「📚 知识库」面板用。
 *
 *  GET    /api/knowledge/viking                 列出知识库里的文档（doc/list）
 *  GET    /api/knowledge/viking?docId=xxx       看某个文档的前几条切片（point/list）
 *  POST   /api/knowledge/viking                 上传文件（multipart，字段 file）
 *  DELETE /api/knowledge/viking?docId=xxx       删除文档（doc/delete，异步生效）
 *
 * ⚠️ 上传为什么要先落到公网地址：
 *   API Key 身份下 `add_type="tos_fe"`（控制台拖文件那种）会返回 `not support tos_fe for user:xxxx`，
 *   唯一可用的是 `add_type="url"` —— **由知识库服务按 URL 自己去抓取文件**。
 *   所以这里把文件临时写到 `public/generated/`（部署后即 `/generated/xxx`，公网可访问），
 *   再把该地址交给知识库；解析与切片由知识库侧异步完成，列表会滞后几秒。
 *   ⚠️ 这会把文件内容外发给火山知识库，涉及儿童个人信息的材料请确认后再传。
 */

import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import {
  addVikingDocByUrl,
  deleteVikingDoc,
  docTypeFromFilename,
  isVikingConfigured,
  listVikingDocs,
  listVikingPoints,
  VIKING_MAX_UPLOAD_BYTES,
} from '@/lib/knowledge/viking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GENERATED_DIR = path.join(process.cwd(), 'public', 'generated');

/** 知识库能解析的扩展名（拿不准就别传，免得服务端解析失败还占额） */
const ALLOWED_EXT = ['pdf', 'docx', 'doc', 'txt', 'md', 'markdown', 'csv', 'xlsx', 'xls', 'pptx', 'ppt', 'html', 'json'];

function notConfigured() {
  return NextResponse.json(
    {
      error:
        '未配置火山知识库：请在服务器环境变量里设置 KB_API_KEY（控制台「知识库 → API Key」）与 KB_COLLECTION_NAME（例如 WLJ）',
    },
    { status: 400 }
  );
}

export async function GET(req: NextRequest) {
  if (!isVikingConfigured()) return notConfigured();

  try {
    const docId = req.nextUrl.searchParams.get('docId') || '';
    if (docId) {
      const points = await listVikingPoints(docId, { pageSize: Number(req.nextUrl.searchParams.get('size')) || 5 });
      return NextResponse.json({ docId, ...points });
    }

    const result = await listVikingDocs({
      pageNum: Number(req.nextUrl.searchParams.get('page')) || 1,
      pageSize: Number(req.nextUrl.searchParams.get('size')) || 50,
    });
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[api/knowledge/viking GET]', err);
    return NextResponse.json({ error: err?.message || '读取火山知识库失败' }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  if (!isVikingConfigured()) return notConfigured();

  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: '请选择要上传的文件（表单字段名 file）' }, { status: 400 });
    }
    if (file.size > VIKING_MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `文件超过 ${(VIKING_MAX_UPLOAD_BYTES / 1024 / 1024).toFixed(0)}MB 上限` },
        { status: 400 }
      );
    }

    const docType = docTypeFromFilename(file.name);
    if (!ALLOWED_EXT.includes(docType)) {
      return NextResponse.json(
        { error: `暂不支持 .${docType} 类型（支持：${ALLOWED_EXT.join(' / ')}）` },
        { status: 400 }
      );
    }

    // 1) 临时写到 public/generated（部署后即 /generated/<name>，公网可访问）
    await fs.mkdir(GENERATED_DIR, { recursive: true });
    const safeName = file.name.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 80);
    const storedName = `kb-${Date.now()}-${safeName}`;
    const storedPath = path.join(GENERATED_DIR, storedName);
    await fs.writeFile(storedPath, Buffer.from(await file.arrayBuffer()));

    // 2) 公网地址：优先 PUBLIC_BASE_URL（反代场景更稳），否则用请求自身的 origin
    const base = (process.env.PUBLIC_BASE_URL || req.nextUrl.origin).replace(/\/+$/, '');
    const publicUrl = `${base}/generated/${encodeURIComponent(storedName)}`;

    // 3) 交给知识库按 URL 抓取
    try {
      const docId = `wlj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const added = await addVikingDocByUrl({ docId, docName: file.name, docType, url: publicUrl });
      return NextResponse.json({
        ok: true,
        docId: added.docId,
        docName: file.name,
        docType,
        publicUrl,
        notice:
          '已提交给火山知识库，由其抓取解析（切片异步完成，列表可能滞后几秒）。' +
          '临时文件保留在 /generated 下，可在核对后删除。',
      });
    } catch (err: any) {
      // 失败就把临时文件清掉，避免在公网留没用的文件
      await fs.unlink(storedPath).catch(() => {});
      throw err;
    }
  } catch (err: any) {
    console.error('[api/knowledge/viking POST]', err);
    return NextResponse.json({ error: err?.message || '上传到火山知识库失败' }, { status: 502 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!isVikingConfigured()) return notConfigured();

  try {
    const docId = req.nextUrl.searchParams.get('docId') || '';
    if (!docId) return NextResponse.json({ error: '缺少 docId' }, { status: 400 });
    await deleteVikingDoc(docId);
    return NextResponse.json({ ok: true, docId, notice: '删除是异步的，列表可能滞后几秒' });
  } catch (err: any) {
    console.error('[api/knowledge/viking DELETE]', err);
    return NextResponse.json({ error: err?.message || '删除失败' }, { status: 502 });
  }
}
