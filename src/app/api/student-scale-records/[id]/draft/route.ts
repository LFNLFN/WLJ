import { NextRequest, NextResponse } from 'next/server';
import { getDb, parseRow } from '@/lib/api/crud';
import { ensureSchema } from '@/lib/api/schema';
import { getSessionFromRequest } from '@/lib/auth/current';
import { requireStaff } from '@/lib/auth/service';
import { generateAssessmentDraft } from '@/lib/ai/assessment-draft';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TABLE = 'student_scale_records';

function nowText() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * 生成 AI 评估结果草稿（文书辅助，需人工确认）
 *
 * - 仅教师/治疗师/管理员可用
 * - 只写入 aiDraft* 字段，不改动评估员已写的 summary / recommendations
 * - 生成内容包含：综合结论、优势、困难、分维度建议、红旗、资料不足项
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const db = await getDb();
    await ensureSchema();

    const session = await getSessionFromRequest(req);
    const staff = await requireStaff(db, session?.id);
    if (!staff.ok) {
      return NextResponse.json({ error: staff.error }, { status: staff.status });
    }

    const found = await db.query(`SELECT * FROM ${TABLE} WHERE id = $1`, [params.id]);
    const row = found.rows[0];
    if (!row) return NextResponse.json({ error: '未找到该评估记录' }, { status: 404 });

    let raw: any = {};
    if (row.rawdata) {
      try {
        raw = typeof row.rawdata === 'string' ? JSON.parse(row.rawdata) : row.rawdata;
      } catch {
        raw = {};
      }
    }

    const draft = await generateAssessmentDraft(raw);

    const recommendationsText = draft.recommendations
      .map((r, idx) => `${idx + 1}. ${r.domain ? '【' + r.domain + '】' : ''}${r.advice}`)
      .join('\n');

    const detail = {
      strengths: draft.strengths,
      difficulties: draft.difficulties,
      recommendations: draft.recommendations,
      redFlags: draft.redFlags,
      uncertainties: draft.uncertainties,
    };

    const result = await db.query(
      `UPDATE ${TABLE}
          SET "aiDraftSummary" = $2,
              "aiDraftRecommendations" = $3,
              "aiDraftDetail" = $4,
              "aiDraftStatus" = 'generated',
              "aiDraftMeta" = $5,
              "aiDraftAt" = $6,
              "aiDraftAcceptedAt" = '',
              "aiDraftAcceptedBy" = ''
        WHERE id = $1
        RETURNING *`,
      [
        params.id,
        draft.summary,
        recommendationsText,
        JSON.stringify(detail),
        JSON.stringify(draft.meta),
        nowText(),
      ]
    );

    console.log(
      `[ai-draft] 记录=${params.id} 量表=${raw?.scaleName || row.scalename || ''} ` +
        `生成人=${staff.value.name || staff.value.id} 模型=${draft.meta.model} ` +
        `耗时=${draft.meta.latencyMs}ms 校验=${draft.meta.numericCheck}`
    );

    return NextResponse.json(parseRow(result.rows[0]));
  } catch (err: any) {
    const status = err?.statusCode || (err?.message ? 502 : 500);
    console.error('[ai-draft] 生成失败:', err?.message || err);
    return NextResponse.json(
      { error: err?.message || 'AI 草稿生成失败，请稍后重试' },
      { status }
    );
  }
}
