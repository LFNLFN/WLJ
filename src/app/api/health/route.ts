import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/api/db';

export async function GET(req: NextRequest) {
  try {
    const db = getDb();
    // 简单查询确认数据库正常
    db.prepare('SELECT 1').get();
    return NextResponse.json({
      status: 'ok',
      time: new Date().toISOString()
    });
  } catch (err: any) {
    return NextResponse.json({ status: 'error', error: err.message }, { status: 500 });
  }
}
