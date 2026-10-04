/**
 * 工具调用时的「调用者身份」上下文。
 *
 * 背景（真实问题）：middleware 会把登录用户透传成 `x-user-id` / `x-user-role` / `x-user-name`，
 * 但 `/api/chat` 之前完全没用 —— 模型和方舟托管智能体都不知道"是谁在问"，
 * 于是遇到学生/评估这类敏感数据时会以「你当前没有访问学生及相关数据的权限」搪塞（实测）。
 *
 * 这里用 AsyncLocalStorage 把身份带到工具执行层：
 *   - `/api/chat` 在处理每个请求时 `runWithAgentContext({...}, () => 工具循环)`
 *   - `agent-tools` 里用 `getAgentContext()` 取到身份，拼进发给托管智能体的检索问题里
 * 用 AsyncLocalStorage 而不是模块级变量，是为了并发请求之间不串身份。
 */

import { AsyncLocalStorage } from 'node:async_hooks';

export interface AgentContext {
  userId?: string;
  name?: string;
  /** admin | teacher | therapist */
  role?: string;
}

const storage = new AsyncLocalStorage<AgentContext>();

/** 角色英文码 → 中文（与 src/lib/auth/config.ts 的 ROLE_LABELS 保持一致） */
export const AGENT_ROLE_LABELS: Record<string, string> = {
  admin: '管理员',
  teacher: '教师',
  therapist: '治疗师',
};

export function roleLabel(role?: string): string {
  const key = String(role || '').trim();
  return AGENT_ROLE_LABELS[key] || key || '未知角色';
}

/** 在指定身份下执行（同一请求内的工具调用都能读到） */
export function runWithAgentContext<T>(ctx: AgentContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getAgentContext(): AgentContext | undefined {
  return storage.getStore();
}

/**
 * 一行「调用者」说明，拼在发给外部智能体的检索问题前面。
 * 没有身份信息时返回空串，行为与以前一致。
 */
export function callerLine(ctx = getAgentContext()): string {
  if (!ctx?.name && !ctx?.userId) return '';
  const who = ctx.name || ctx.userId || '';
  return `【调用者：${who}（${roleLabel(ctx.role)}），本中心内部登录账号】`;
}
