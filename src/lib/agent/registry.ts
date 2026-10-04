/**
 * 工具注册表：把底层实现（src/lib/agent-tools.ts）包装成带 schema 的工具，
 * 供大模型 function calling 使用，并交由 execute.ts 统一执行。
 */

import type { JsonSchema, ToolDefinition, ToolSchema } from './types';
import { generateFile, queryDatabase, searchKnowledgeBase } from '../agent-tools';

/** 把底层返回的 JSON 字符串解析为对象；解析失败时原样返回 */
function parseResult(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return { ok: true, raw };
  }
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'search_knowledge_base',
    description:
      '检索机构内部知识库。适用于回答与课程体系、评估量表、康复训练方法、机构制度等相关的问题。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '检索关键词或自然语言问题' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    handler: async (args: Record<string, any>) =>
      parseResult(await searchKnowledgeBase(String(args.query ?? ''))),
  },
  {
    name: 'query_database',
    description:
      '查询业务数据库。action=stats 返回各业务表记录数；action 为表名时按条件分页查询记录。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'stats',
            'students',
            'teachers',
            'courses',
            'class_records',
            'scale_templates',
            'student_scale_records',
            'lesson_plans',
            'training_plans',
          ],
          description: '查询动作：stats 或表名',
        },
        params: {
          type: 'object',
          description: '可选参数：id（按主键查单条）、search（模糊搜索）、limit、offset',
        },
      },
      required: ['action'],
      additionalProperties: false,
    },
    handler: async (args: Record<string, any>) =>
      parseResult(await queryDatabase(String(args.action ?? ''), args.params || {})),
  },
  {
    name: 'generate_file',
    description: '生成可下载的 Excel(.xlsx) 或 Word(.docx) 文件，并返回下载地址。',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['excel', 'word'], description: '文件类型' },
        filename: { type: 'string', description: '期望的文件名（无需扩展名）' },
        content: {
          type: 'object',
          description:
            'excel: {headers, rows} 或 {sheets:[{name,headers,rows}]}；word: {title, paragraphs, headers, rows, text}',
        },
      },
      required: ['type', 'filename', 'content'],
      additionalProperties: false,
    },
    handler: async (args: Record<string, any>) =>
      parseResult(await generateFile(String(args.type ?? ''), String(args.filename ?? ''), args.content || {})),
  },
];

const TOOL_MAP = new Map<string, ToolDefinition>(TOOL_DEFINITIONS.map((t) => [t.name, t]));

export function getTool(name: string): ToolDefinition | undefined {
  return TOOL_MAP.get(String(name));
}

/** 返回可喂给大模型的工具 schema 列表（OpenAI 风格） */
export function listToolSchemas(allowed?: string[]): ToolSchema[] {
  const defs = allowed && allowed.length ? TOOL_DEFINITIONS.filter((t) => allowed.includes(t.name)) : TOOL_DEFINITIONS;
  return defs.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters as JsonSchema },
  }));
}
