import type { NextRequest } from 'next/server';
import { SESSION_COOKIE } from './config';
import { verifySessionToken, type SessionPayload } from './session';

/**
 * 从请求中解析当前登录用户（签名校验通过才算）
 *
 * 支持两种携带方式：
 *  - Web：httpOnly Cookie（wlj_session）
 *  - 小程序：Authorization: Bearer <token>（wx.request 不方便稳靠地保存 Cookie，
 *    所以小程序登录接口会把同一个 token 返回给客户端保存）
 */
export async function getSessionFromRequest(req: NextRequest): Promise<SessionPayload | null> {
  const fromCookie = req.cookies?.get(SESSION_COOKIE)?.value;
  const header = req.headers.get('authorization') || '';
  const fromHeader = /^Bearer\s+(.+)$/i.exec(header.trim())?.[1];
  return verifySessionToken(fromCookie || fromHeader);
}

/** 兼容旧调用：等同于 getSessionFromRequest */
export async function getSession(req: NextRequest) {
  return getSessionFromRequest(req);
}

export async function getSessionUserId(req: NextRequest): Promise<string | undefined> {
  const session = await getSessionFromRequest(req);
  return session?.id;
}
