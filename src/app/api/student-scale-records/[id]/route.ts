import { NextRequest, NextResponse } from 'next/server';
import { getDb, parseRow } from '@/lib/api/crud';
import { getSessionFromRequest } from '@/lib/auth/current';

const TABLE = 'student_scale_records';

/** 批阅相关字段只能通过 /review 接口写入（保证批阅人可追溯） */
const REVIEW_FIELDS = [
  'reviewStatus', 'reviewstatus', 'reviewComment', 'reviewcomment',
  'reviewerId', 'reviewerid', 'reviewerName', 'reviewername', 'reviewedAt', 'reviewedat',
];

async function loadRecord(id: string) {
  const db = await getDb();
  const result = await db.query(`SELECT * FROM ${TABLE} WHERE id = $1`, [id]);
  return result.rows[0] || null;
}

/**
 * 单条记录
 *  - 已登录（教师/平台账号）→ 可以看任意记录
 *  - 未登录（普通用户）→ 必须带 ?userid= 且与该记录的 userid 一致，否则 403
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const row = await loadRecord(params.id);
    if (!row) return NextResponse.json({ error: '未找到' }, { status: 404 });

    const session = await getSessionFromRequest(req);
    if (session) return NextResponse.json(parseRow(row));

    const { searchParams } = new URL(req.url);
    const userid = searchParams.get('userid') || searchParams.get('userId');
    if (!userid || userid !== (row.userid || '')) {
      return NextResponse.json({ error: '无权查看该评估表' }, { status: 403 });
    }
    return NextResponse.json(parseRow(row));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** 修改记录：必须登录（平台/教师账号），且不允许通过这里改批阅字段 */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const db = await getDb();
    const body = await req.json().catch(() => ({}));
    for (const key of REVIEW_FIELDS) delete body[key];
    delete body.id;
    delete body._id;

    const columns = Object.keys(body);
    if (columns.length === 0) {
      const row = await loadRecord(params.id);
      if (!row) return NextResponse.json({ error: '未找到' }, { status: 404 });
      return NextResponse.json(parseRow(row));
    }

    const setClause = columns.map((c, i) => `"${c}" = $${i + 1}`).join(',');
    const result = await db.query(
      `UPDATE ${TABLE} SET ${setClause} WHERE id = $${columns.length + 1} RETURNING *`,
      [...columns.map((c) => body[c]), params.id]
    );
    if (!result.rows[0]) return NextResponse.json({ error: '未找到' }, { status: 404 });
    return NextResponse.json(parseRow(result.rows[0]));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * 删除记录
 *  - 已登录（教师/平台账号）→ 可以删任意记录
 *  - 未登录（普通用户）→ 必须带 ?userid= 且与该记录一致，只能删自己的
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const row = await loadRecord(params.id);
    if (!row) return NextResponse.json({ error: '未找到' }, { status: 404 });

    const session = await getSessionFromRequest(req);
    if (!session) {
      const { searchParams } = new URL(req.url);
      const userid = searchParams.get('userid') || searchParams.get('userId');
      if (!userid || userid !== (row.userid || '')) {
        return NextResponse.json({ error: '无权删除该评估表' }, { status: 403 });
      }
    }

    const db = await getDb();
    await db.query(`DELETE FROM ${TABLE} WHERE id = $1`, [params.id]);
    return NextResponse.json({ message: '删除成功' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
