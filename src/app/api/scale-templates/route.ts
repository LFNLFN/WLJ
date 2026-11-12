import { NextRequest } from 'next/server';
import { createHandlers } from '@/lib/api/crud';
import { ensureSchema } from '@/lib/api/schema';

const handlers = createHandlers('scale_templates');

export async function GET(req: NextRequest) {
  await ensureSchema();
  return handlers.GET(req);
}

export async function POST(req: NextRequest) {
  await ensureSchema();
  return handlers.POST(req);
}
