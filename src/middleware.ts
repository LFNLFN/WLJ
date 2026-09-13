import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth/config';
import { verifySessionToken } from '@/lib/auth/session';

/**
 * 全站登录门禁
 *
 * 页面：未登录 → 跳转 /login?next=<原地址>
 * 接口：未登录 → 401（下面白名单除外）
 *
 * ⚠️ 白名单里 /api/student-scale-records 是微信小程序端**直连**的接口
 *    （小程序 utils/assessment.js → `${WLJ_API_BASE}/student-scale-records`）：
 *    - 普通用户（家长）不登录，只要带上设备 userid 就能提交 / 只看自己的记录；
 *    - 教师在小程序里登录后拿 Bearer token，可以看全部记录并批阅。
 *    因此这一条不在 middleware 里拦，而是**由路由内部按身份判定**：
 *      src/app/api/student-scale-records/route.ts（列表：登录=全部，未登录=必须带 userid）
 *      src/app/api/student-scale-records/[id]/route.ts（单条：同上）
 *      src/app/api/student-scale-records/[id]/review/route.ts（批阅：必须登录且是教师/治疗师/管理员）
 */

/** 免登录页面（登录页、找回密码页） */
const PUBLIC_PAGES = ['/login', '/forgot'];

/** 免登录接口（前缀匹配） */
const PUBLIC_API_PREFIXES = [
  '/api/auth/', // 登录 / 注册 / 退出 / 当前用户
  '/api/health', // 部署健康检查（README/脚本里用 curl 调用）
  '/api/weapp-sync', // 小程序同步（服务端到服务端）
  '/api/student-scale-records', // ⚠️ 小程序直连写入评估记录
];

/** 静态资源扩展名，直接放行 */
const STATIC_FILE = /\.(?:png|jpe?g|gif|svg|ico|webp|css|js|mjs|map|txt|woff2?|ttf|docx?|xlsx?|pdf|html)$/i;

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (pathname.startsWith('/_next') || STATIC_FILE.test(pathname)) {
    return NextResponse.next();
  }

  const isPublicApi = PUBLIC_API_PREFIXES.some(
    (prefix) => pathname === prefix.replace(/\/$/, '') || pathname.startsWith(prefix)
  );
  if (isPublicApi) {
    return NextResponse.next();
  }

  const isPublicPage = PUBLIC_PAGES.includes(pathname);
  // Web 用 httpOnly Cookie，小程序用 Authorization: Bearer <token>
  const cookieToken = req.cookies.get(SESSION_COOKIE)?.value;
  const bearer = /^Bearer\s+(.+)$/i.exec((req.headers.get('authorization') || '').trim())?.[1];
  const session = await verifySessionToken(cookieToken || bearer);

  if (!session) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }
    if (isPublicPage) {
      return NextResponse.next();
    }
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(loginUrl);
  }

  // 已登录还访问登录页/找回密码页 → 回首页
  if (isPublicPage) {
    const home = req.nextUrl.clone();
    home.pathname = '/';
    home.search = '';
    return NextResponse.redirect(home);
  }

  // 把当前用户透传给后续处理（页面/接口可用 headers() 读取）
  const headers = new Headers(req.headers);
  headers.set('x-user-id', session.id);
  headers.set('x-user-role', session.role);
  headers.set('x-user-name', encodeURIComponent(session.name));
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
