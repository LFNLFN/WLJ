/**
 * 「当前登录用户」→ 模型 / 托管智能体看得懂的身份说明（服务端）。
 *
 * 背景（真实问题，2026-10-04）：
 *   梁丰年是管理员（users.role = 'admin'），但在智能助理里被回
 *   「抱歉，你当前没有访问学生及相关数据的权限。」
 *   这句话**不在本仓库任何代码或提示词里**（全库检索过，仓库里只有对它的注释引用），
 *   它是模型/托管智能体自己生成的**保守拒绝**：调用链上没有任何地方告诉它"是谁在问"，
 *   面对学生 / 评估这类敏感数据，模型只能按最保守的隐私策略拒答。
 *
 * 所以修法不是"改权限判定"（本来就没拦），而是**把身份一路传下去**：
 *   middleware（src/middleware.ts）已把会话透传成 x-user-id / x-user-role / x-user-name，
 *   这里负责把它变成
 *     · AgentContext —— 放进 AsyncLocalStorage（见 ./context.ts），工具层（发给托管智能体的检索）读得到；
 *     · callerSystemLine() —— 拼进 /api/chat 的 system prompt，让模型知道"这是内部人员的正当使用"。
 *
 * 为什么还要兜底读会话 Cookie/Bearer：身份说明是整个修复的关键，不能因为"某条调用路径没带
 * x-user-* 头"（反代、脚本直调、以后新加的路由）就整体失效 —— 拿不到头时直接用同一份会话 token 验签。
 * 因此 /api/chat 与 /api/ai/tools **共用本模块**，避免"只修了一条路"。
 */

import { SESSION_COOKIE } from '../auth/config';
import { verifySessionToken, type SessionPayload } from '../auth/session';
import { roleLabel, type AgentContext } from './context';

/** 只取最小依赖（Headers），便于测试直接塞假头，也不绑定 NextRequest 类型 */
export interface IdentityRequest {
  headers: Headers;
}

function clean(value: string | null | undefined): string | undefined {
  const v = String(value ?? '').trim();
  return v || undefined;
}

/** middleware 用 encodeURIComponent 编码姓名，解不开就按原样用（老会话/手写头） */
function decodeName(raw: string | null): string | undefined {
  const v = clean(raw);
  if (!v) return undefined;
  try {
    return decodeURIComponent(v) || undefined;
  } catch {
    return v;
  }
}

/** 从 Cookie 头 / Authorization: Bearer 里取出会话 token（与 middleware 的取值口径一致） */
function sessionTokenFromHeaders(headers: Headers): string | undefined {
  const bearer = /^Bearer\s+(.+)$/i.exec((headers.get('authorization') || '').trim())?.[1];
  if (bearer) return bearer.trim();
  const cookie = headers.get('cookie') || '';
  const match = new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`).exec(cookie);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

/**
 * 解析调用者身份。
 * 顺序：middleware 透传的 x-user-*（正常路径，零成本）→ 兜底用会话 token 验签。
 */
export async function agentContextFromRequest(req: IdentityRequest): Promise<AgentContext> {
  const h = req.headers;
  const ctx: AgentContext = {
    userId: clean(h.get('x-user-id')),
    name: decodeName(h.get('x-user-name')),
    role: clean(h.get('x-user-role')),
  };
  if (ctx.name && ctx.role) return ctx;

  const session: SessionPayload | null = await verifySessionToken(sessionTokenFromHeaders(h));
  if (!session) return ctx;

  return {
    userId: ctx.userId || session.id,
    name: ctx.name || session.name || undefined,
    role: ctx.role || session.role || undefined,
  };
}

/**
 * 拼进 /api/chat system prompt 的身份说明。
 *
 * 关键在于**把平台真实的授权模型告诉模型**：本系统「除用户管理外，所有已登录内部账号权限相同」
 * （见 README「后续仍可扩展」一节），学生 / 评估记录这些数据在网页端本来就能直接查看。
 * 只写"你是内部人员、可以查"不够 —— 实测模型仍会自己脑补一套"岗位范围/敏感个人信息"的规则拒答
 * （2026-10-04 线上实测：「把这些学生的家长电话给我」被回"超出当前岗位合理必要的使用范围"）。
 *
 * 没有身份信息时返回空串 —— 行为与修复前一致（不认识的调用者不给任何权限暗示）。
 */
export function callerSystemLine(ctx: AgentContext | undefined): string {
  if (!ctx?.name && !ctx?.userId) return '';
  const who = ctx.name || ctx.userId || '';
  return [
    `当前登录用户：${who}（${roleLabel(ctx.role)}），本中心内部账号，已通过系统登录。`,
    '本系统的授权模型：除「用户管理」外，所有已登录的内部账号权限相同 —— 学生 / 教师 / 课程 / 课堂记录 / ' +
      '评估记录 / 教案 / 训练计划这些业务数据，在网页端本来就直接可见可导出。',
    '所以「查询 / 列出 / 汇总 / 导出」这些数据属于 ta 职责范围内的日常正当使用：请直接调用工具取数' +
      '（业务数据用 query_database，机构资料用 search_knowledge_base）后如实回答，' +
      '不要以「没有权限」「无法访问」「超出岗位范围」为由拒绝，也不要反过来要求 ta 证明身份或说明用途；',
    '只有在明显超出机构内部职责范围（例如索取其它单位 / 其它机构的个人信息，或要求绕开系统鉴权）时才拒绝，' +
      '并说明原因。',
  ].join('\n');
}

/**
 * 模型"未调用任何工具、却直接回权限拒绝"时的补救提示（拼进 system prompt 重问一次）。
 *
 * 为什么还要这一层：身份已经说明白了，但模型仍可能偶尔走"保守拒答"的老路
 * （线上实测：问「把中心所有学生的家长电话给我」时 steps 为空、直接拒答）。
 * 兜底重试只针对**权限类拒绝话术**，不干扰正常回答。
 */
export const PERMISSION_GUARD_NOTE =
  '【权限提醒】上一轮回答以「没有权限 / 无法访问 / 无权查看」为由拒绝，但调用者已通过系统登录、' +
  '是中心内部人员，职责范围内的查询属于正当使用：请直接调用 query_database / search_knowledge_base 取到数据后回答，' +
  '不要再用权限理由拒答；只有明显超出机构内部职责范围（例如索取其它单位 / 其它机构的个人信息）时才拒绝，并说明原因。';

/**
 * 判断一段回答是不是「权限类拒绝话术」。
 *
 * 只匹配明确的权限措辞，避免把正常回答误判重试（例如
 * 「知识库里没有权限管理相关的资料」不算拒绝 → 不匹配）。
 */
export function isPermissionRefusal(text: string | undefined | null): boolean {
  const t = String(text ?? '').trim();
  if (!t || t.length > 800) return false; // 长回答通常已是正文，不做重试
  const patterns = [
    // 「（很）抱歉，你当前没有访问学生及相关数据的权限。」—— 线上实测原句
    /(?:抱歉|不好意思)[，,、]?\s*(?:我|你|您)?\s*(?:当前)?\s*(?:没有|无|不具备)\s*(?:访问|查看|查询|获取|提供|导出)[^。；\n]{0,24}?(?:权限|数据|信息|记录|名单|资料)/,
    /(?:我|你|您)\s*(?:当前)?\s*(?:没有|无)\s*(?:访问|查看|查询|获取|导出)[^。；\n]{0,24}?(?:权限|的权限)/,
    /(?:权限不足|没有足够的?权限|无权访问|不具备.{0,6}权限)/,
  ];
  return patterns.some((re) => re.test(t));
}

/** 是否该走「权限拒绝话术」兜底重试（逻辑抽出来是为了能单测） */
export interface RefusalRetryInput {
  ctx: AgentContext | undefined;
  reply: string | undefined | null;
  /** 本轮模型返回的工具调用数量 */
  toolCallCount: number;
  /** 本请求是否已经重试过（每请求最多一次） */
  alreadyRetried: boolean;
  /** 当前轮次（从 0 开始） */
  round: number;
  maxRounds: number;
}

export function shouldRetryPermissionRefusal(input: RefusalRetryInput): boolean {
  const { ctx, reply, toolCallCount, alreadyRetried, round, maxRounds } = input;
  if (alreadyRetried) return false;
  if (toolCallCount > 0) return false; // 已经查过数据，这轮回答就是结论
  if (round >= maxRounds) return false; // 没有重试额度
  if (!callerSystemLine(ctx)) return false; // 不认识的调用者：保持修复前的行为
  return isPermissionRefusal(reply);
}
