import { NextRequest } from 'next/server';
import { createHandlers, GET_byId, PUT_byId, DELETE_byId } from '@/lib/api/crud';

const handlers = createHandlers('lesson_plans', ['title']);

export async function GET(req: NextRequest) {
  return handlers.GET(req);
}

export async function POST(req: NextRequest) {
  return handlers.POST(req);
}
