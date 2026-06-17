import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/api/db';
import { Pool } from 'pg';

function isPg(db: any): db is Pool {
  return db.constructor?.name === 'Pool';
}

export async function GET(req: NextRequest) {
  try {
    const db = await getDb();
    if (isPg(db)) {
      await db.query('SELECT 1');
    } else {
      db.prepare('SELECT 1').get();
    }
    return NextResponse.json({
      status: 'ok',
      db: isPg(db) ? 'postgresql' : 'sqlite',
      time: new Date().toISOString()
    });
  } catch (err: any) {
    return NextResponse.json({ status: 'error', error: err.message }, { status: 500 });
  }
}
