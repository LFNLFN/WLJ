import { NextRequest } from 'next/server';
import { createHandlers } from '@/lib/api/crud';

const handlers = createHandlers('scale_templates');

export async function GET(req: NextRequest) {
  return handlers.GET(req);
}

export async function POST(req: NextRequest) {
  return handlers.POST(req);
}
