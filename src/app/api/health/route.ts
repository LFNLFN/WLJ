import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/api/db';

export async function GET(req: NextRequest) {
  try {
    const db = await getDb();
    await db.query('SELECT 1');
    return NextResponse.json({
      status: 'ok',
      db: 'postgresql',
      time: new Date().toISOString()
    });
  } catch (err: any) {
    return NextResponse.json({ status: 'error', error: err.message }, { status: 500 });
  }
}
