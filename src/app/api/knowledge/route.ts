/**
 * 知识库接口
 *
 *  GET  /api/knowledge?q=&category=&limit=&offset=   列出 / 搜索资料（列表只回传正文预览）
 *  GET  /api/knowledge?id=kb_xxx                     读取单条资料的完整正文
 *  POST /api/knowledge                               新增资料
 *       · JSON：{ title, category, content }
 *       · multipart/form-data：file=@xxx（可选 title / category / content）
 *         文件会先抽取成纯文本再入库；解析不了的类型会返回 400 并说明原因，不做假解析。
 *
 * 「知识库」落在业务库的 knowledge_documents 表（首次调用时幂等建表），
 * AI 工具 search_knowledge_base 会检索这张表。
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractTextFromBuffer, MAX_EXTRACT_CHARS } from '@/lib/knowledge/extract';
import {
  createKnowledgeDocument,
  getKnowledgeDocument,
  KNOWLEDGE_CATEGORIES,
  listKnowledgeDocuments,
  MAX_UPLOAD_BYTES,
} from '@/lib/knowledge/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (id) {
      const doc = await getKnowledgeDocument(id);
      if (!doc) return NextResponse.json({ error: '资料不存在' }, { status: 404 });
      return NextResponse.json(doc);
    }

    const result = await listKnowledgeDocuments({
      q: searchParams.get('q') || '',
      category: searchParams.get('category') || '',
      limit: Number(searchParams.get('limit')) || 50,
      offset: Number(searchParams.get('offset')) || 0,
    });
    return NextResponse.json({ ...result, categories: KNOWLEDGE_CATEGORIES });
  } catch (err: any) {
    console.error('[api/knowledge GET]', err);
    return NextResponse.json({ error: err.message || '读取知识库失败' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';
    const createdBy = req.headers.get('x-user-id') || null;

    let title = '';
    let category = '';
    let content = '';
    let filename: string | null = null;
    let mimetype: string | null = null;
    let size = 0;
    const notes: string[] = [];

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      title = String(form.get('title') || '');
      category = String(form.get('category') || '');
      content = String(form.get('content') || '');

      const file = form.get('file');
      if (file && typeof file === 'object' && 'arrayBuffer' in file && (file as File).size > 0) {
        const uploaded = file as File;
        if (uploaded.size > MAX_UPLOAD_BYTES) {
          return NextResponse.json(
            { error: `文件超过 ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB 上限，请拆分后再上传` },
            { status: 413 }
          );
        }
        const buf = Buffer.from(await uploaded.arrayBuffer());
        const extracted = await extractTextFromBuffer(uploaded.name, uploaded.type, buf);
        if (!extracted.text.trim()) {
          return NextResponse.json(
            { error: `未能从 ${uploaded.name} 中抽取到文字：${extracted.note || '文件内容为空'}` },
            { status: 400 }
          );
        }
        content = extracted.text;
        filename = uploaded.name;
        mimetype = uploaded.type || null;
        size = buf.length;
        if (!title.trim()) title = uploaded.name.replace(/\.[^.]+$/, '');
        if (extracted.note) notes.push(extracted.note);
      }
    } else {
      const body = await req.json().catch(() => ({}));
      title = String(body?.title || '');
      category = String(body?.category || '');
      content = String(body?.content || '');
      filename = body?.filename ? String(body.filename) : null;
    }

    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();
    if (!trimmedTitle) return NextResponse.json({ error: '请填写资料标题' }, { status: 400 });
    if (!trimmedContent) {
      return NextResponse.json({ error: '请粘贴资料内容，或上传一个可解析的文件' }, { status: 400 });
    }
    if (trimmedContent.length > MAX_EXTRACT_CHARS * 4) {
      return NextResponse.json({ error: '资料内容过长，请拆分后再上传' }, { status: 413 });
    }

    const doc = await createKnowledgeDocument({
      title: trimmedTitle,
      category,
      content: trimmedContent,
      filename,
      mimetype,
      size,
      source: filename ? 'upload' : 'manual',
      createdBy,
    });

    return NextResponse.json(
      {
        ...doc,
        // 列表接口只回传预览，这里也统一截断，避免响应过大
        content: doc.content.slice(0, 300),
        contentLength: doc.content.length,
        ...(notes.length ? { notes } : {}),
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error('[api/knowledge POST]', err);
    return NextResponse.json({ error: err.message || '上传资料失败' }, { status: 500 });
  }
}
