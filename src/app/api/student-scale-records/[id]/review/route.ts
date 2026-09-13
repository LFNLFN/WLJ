import { NextRequest, NextResponse } from 'next/server';
import { getDb, parseRow } from '@/lib/api/crud';
import { getSessionFromRequest } from '@/lib/auth/current';
import { requireStaff } from '@/lib/auth/service';

const TABLE = 'student_scale_records';

/**
 * 教师批阅评估表（小程序教师端）
 *
 * POST body：{ comment?: string, status?: 'reviewed' | 'pending' }
 *  - status 默认 'reviewed'；传 'pending' 表示撤回批阅（清空批阅人/时间）
 *  - 批阅人（reviewerId / reviewerName）**只能取自服务端会话**，客户端传什么都不认，
 *    这样每一条批阅都能追溯到具体是哪位老师批的
 *
 * 权限：必须是已登录且状态正常的机构账号（教师 / 治疗师 / 管理员）
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const db = await getDb();
    const session = await getSessionFromRequest(req);
    const staff = await requireStaff(db, session?.id);
    if (!staff.ok) {
      return NextResponse.json({ error: staff.error }, { status: staff.status });
    }

    const exists = await db.query(`SELECT id FROM ${TABLE} WHERE id = $1`, [params.id]);
    if (!exists.rows[0]) return NextResponse.json({ error: '未找到该评估表' }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const status = String(body?.status || 'reviewed').toLowerCase() === 'pending' ? 'pending' : 'reviewed';
    const comment = String(body?.comment == null ? '' : body.comment).slice(0, 2000);

    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const result =
      status === 'pending'
        ? await db.query(
            `UPDATE ${TABLE}
                SET "reviewStatus" = 'pending', "reviewComment" = $2,
                    "reviewerId" = '', "reviewerName" = '', "reviewedAt" = $3
              WHERE id = $1 RETURNING *`,
            [params.id, comment, now]
          )
        : await db.query(
            `UPDATE ${TABLE}
                SET "reviewStatus" = 'reviewed', "reviewComment" = $2,
                    "reviewerId" = $3, "reviewerName" = $4, "reviewedAt" = $5
              WHERE id = $1 RETURNING *`,
            [params.id, comment, staff.value.id, staff.value.name, now]
          );

    return NextResponse.json(parseRow(result.rows[0]));
  } catch (err: any) {
    console.error('批阅失败:', err.message);
    return NextResponse.json({ error: err.message || '批阅失败' }, { status: 500 });
  }
}
