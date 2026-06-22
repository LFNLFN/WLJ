import { NextRequest } from 'next/server';
import { GET_byId, PUT_byId, DELETE_byId } from '@/lib/api/crud';

const TABLE = 'lesson_plans';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  return GET_byId(req, TABLE, params.id);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  return PUT_byId(req, TABLE, params.id);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  return DELETE_byId(req, TABLE, params.id);
}
