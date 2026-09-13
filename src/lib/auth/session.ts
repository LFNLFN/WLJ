/**
 * 会话签名 / 校验（Edge 与 Node 双运行时可用）
 *
 * token 结构：base64url(JSON payload) + '.' + base64url(HMAC-SHA256 签名)
 * 签名使用 Web Crypto（globalThis.crypto.subtle），middleware 的 Edge Runtime
 * 与 Route Handler 的 Node Runtime（Node 20+）都原生支持。
 */
import { getAuthSecret, SESSION_MAX_AGE } from './config';

export interface SessionUser {
  id: string;
  name: string;
  phone: string;
  role: string;
}

export interface SessionPayload extends SessionUser {
  /** 过期时间（秒级时间戳） */
  exp: number;
}

function getSubtle(): SubtleCrypto {
  const c = (globalThis as any).crypto;
  if (!c || !c.subtle) {
    throw new Error(
      '当前 Node 运行时缺少 Web Crypto（globalThis.crypto）。请使用 Node 20+，或加启动参数 NODE_OPTIONS=--experimental-global-webcrypto'
    );
  }
  return c.subtle as SubtleCrypto;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(input: string): Uint8Array {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function textToBase64Url(text: string): string {
  return bytesToBase64Url(new TextEncoder().encode(text));
}

function base64UrlToText(input: string): string {
  return new TextDecoder().decode(base64UrlToBytes(input));
}

async function importKey(secret: string): Promise<CryptoKey> {
  return getSubtle().importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/** 生成会话 token */
export async function createSessionToken(user: SessionUser): Promise<string> {
  const payload: SessionPayload = {
    id: user.id,
    name: user.name,
    phone: user.phone,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
  };
  const body = textToBase64Url(JSON.stringify(payload));
  const key = await importKey(getAuthSecret());
  const sig = await getSubtle().sign('HMAC', key, new TextEncoder().encode(body));
  return `${body}.${bytesToBase64Url(new Uint8Array(sig))}`;
}

/** 校验会话 token，失败返回 null（不抛异常，方便 middleware 使用） */
export async function verifySessionToken(
  token: string | undefined | null
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const dot = token.indexOf('.');
    if (dot <= 0) return null;
    const body = token.slice(0, dot);
    const sigPart = token.slice(dot + 1);
    if (!body || !sigPart) return null;

    const key = await importKey(getAuthSecret());
    const ok = await getSubtle().verify(
      'HMAC',
      key,
      base64UrlToBytes(sigPart) as unknown as BufferSource,
      new TextEncoder().encode(body) as unknown as BufferSource
    );
    if (!ok) return null;

    const payload = JSON.parse(base64UrlToText(body)) as SessionPayload;
    if (!payload || !payload.id || !payload.exp) return null;
    if (payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
