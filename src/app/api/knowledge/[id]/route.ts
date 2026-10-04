/**
 * 单条知识库资料：GET 读全文，DELETE 删除。
 */

import { NextRequest, NextResponse } from 'next/server';
import { deleteKnowledgeDocument, getKnowledgeDocument } from '@/lib/knowledge/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const doc = await getKnowledgeDocument(params.id);
    if (!doc) return NextResponse.json({ error: '资料不存在' }, { status: 404 });
    return NextResponse.json(doc);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || '读取资料失败' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ok = await deleteKnowledgeDocument(params.id);
    if (!ok) return NextResponse.json({ error: '资料不存在' }, { status: 404 });
    return NextResponse.json({ ok: true, id: params.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || '删除资料失败' }, { status: 500 });
  }
}
