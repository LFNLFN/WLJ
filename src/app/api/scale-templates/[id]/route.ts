import { NextRequest } from 'next/server';
import { GET_byId, PUT_byId, DELETE_byId } from '@/lib/api/crud';
import { ensureSchema } from '@/lib/api/schema';

const TABLE = 'scale_templates';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  await ensureSchema();
  return GET_byId(req, TABLE, params.id);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  await ensureSchema();
  return PUT_byId(req, TABLE, params.id);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  await ensureSchema();
  return DELETE_byId(req, TABLE, params.id);
}
