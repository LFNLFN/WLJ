/**
 * 服务端智能体工具执行层的类型定义。
 */

export type ToolName = 'search_knowledge_base' | 'query_database' | 'generate_file';

/** 工具上下文（鉴权信息透传，暂未强制使用） */
export interface ToolContext {
  userId?: string;
  role?: string;
}

/** 简易 JSON Schema 描述（兼容 OpenAI function calling 的 parameters 字段） */
export interface JsonSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

/** 工具定义：schema 用于喂给大模型，handler 用于服务端实际执行 */
export interface ToolDefinition {
  name: ToolName;
  description: string;
  parameters: JsonSchema;
  handler: (args: Record<string, any>, ctx: ToolContext) => Promise<unknown>;
}

/** 执行结果（成功或失败都返回统一结构，便于日志与前端展示） */
export type ToolExecutionResult =
  | { ok: true; name: string; result: unknown; elapsedMs: number }
  | { ok: false; name: string; error: string; elapsedMs: number };

/** 喂给大模型的工具声明（OpenAI 风格） */
export interface ToolSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: JsonSchema;
  };
}
