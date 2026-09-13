import type { NextRequest } from 'next/server';
import { SESSION_COOKIE } from './config';
import { verifySessionToken } from './session';

/** 从请求 Cookie 中解析当前登录用户（签名校验通过才算） */
export async function getSession(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  return verifySessionToken(token);
}

export async function getSessionUserId(req: NextRequest): Promise<string | undefined> {
  const session = await getSession(req);
  return session?.id;
}
