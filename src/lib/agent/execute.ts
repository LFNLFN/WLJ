/**
 * 服务端工具执行器。
 *
 * 负责：参数归一化 -> schema 校验 -> 超时控制 -> 执行 -> 统一错误结构。
 * 所有工具调用的失败都不会抛出到调用方，而是返回 { ok:false, error }。
 */

import { getTool } from './registry';
import type { ToolContext, ToolDefinition, ToolExecutionResult } from './types';

export const TOOL_TIMEOUT_MS = 150_000;

/** 把各种入参形态归一化为对象：支持 OpenAI 的 arguments 字符串 */
function normalizeArgs(input: unknown): { ok: true; value: Record<string, any> } | { ok: false; error: string } {
  if (input === undefined || input === null || input === '') return { ok: true, value: {} };
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { ok: true, value: parsed };
      }
      return { ok: false, error: 'arguments 字符串解析后必须是对象' };
    } catch {
      return { ok: false, error: 'arguments 不是合法的 JSON 字符串' };
    }
  }
  if (typeof input === 'object' && !Array.isArray(input)) {
    return { ok: true, value: input as Record<string, any> };
  }
  return { ok: false, error: 'arguments 必须是对象或 JSON 字符串' };
}

/** 基于 parameters schema 做轻量校验（类型 / 必填 / 枚举） */
function validateArgs(tool: ToolDefinition, args: Record<string, any>): string | null {
  const schema = tool.parameters;
  for (const key of schema.required ?? []) {
    if (args[key] === undefined || args[key] === null || args[key] === '') {
      return `缺少必填参数：${key}`;
    }
  }
  for (const [key, raw] of Object.entries(schema.properties)) {
    const value = args[key];
    if (value === undefined || value === null) continue;
    const def = raw as { type?: string; enum?: unknown[] };
    if (def.type === 'string' && typeof value !== 'string') {
      return `参数 ${key} 应为字符串`;
    }
    if (def.type === 'object' && (typeof value !== 'object' || Array.isArray(value))) {
      return `参数 ${key} 应为对象`;
    }
    if (def.type === 'number' && typeof value !== 'number') {
      return `参数 ${key} 应为数字`;
    }
    if (Array.isArray(def.enum) && !def.enum.includes(value)) {
      return `参数 ${key} 取值不合法，应为：${def.enum.join(' / ')}`;
    }
  }
  return null;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`工具 ${label} 执行超时（${ms}ms）`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * 执行指定工具。
 * @param name 工具名
 * @param args 参数（对象或 JSON 字符串）
 * @param ctx  上下文（鉴权信息）
 */
export async function executeTool(
  name: string,
  args: unknown = {},
  ctx: ToolContext = {}
): Promise<ToolExecutionResult> {
  const started = Date.now();
  const toolName = String(name ?? '');
  const tool = getTool(toolName);
  if (!tool) {
    return { ok: false, name: toolName, error: `未知工具：${toolName || '(空)'}`, elapsedMs: 0 };
  }

  const normalized = normalizeArgs(args);
  if ('error' in normalized) {
    return { ok: false, name: tool.name, error: normalized.error, elapsedMs: Date.now() - started };
  }

  const validationError = validateArgs(tool, normalized.value);
  if (validationError) {
    return { ok: false, name: tool.name, error: validationError, elapsedMs: Date.now() - started };
  }

  try {
    const result = await withTimeout(tool.handler(normalized.value, ctx), TOOL_TIMEOUT_MS, tool.name);
    return { ok: true, name: tool.name, result, elapsedMs: Date.now() - started };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, name: tool.name, error: message, elapsedMs: Date.now() - started };
  }
}

/** 依次执行多个工具调用（例如一轮里模型返回了多个 tool_calls） */
export async function executeToolCalls(
  calls: { name: string; arguments?: unknown }[],
  ctx: ToolContext = {}
): Promise<ToolExecutionResult[]> {
  const results: ToolExecutionResult[] = [];
  for (const call of calls) {
    results.push(await executeTool(call.name, call.arguments, ctx));
  }
  return results;
}
