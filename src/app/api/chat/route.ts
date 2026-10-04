import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { executeTool } from '@/lib/agent/execute';
import { listToolSchemas } from '@/lib/agent/registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 单次请求内允许的最大工具调用轮数，防止死循环 */
const MAX_TOOL_ROUNDS = 5;

const SYSTEM_PROMPT =
  '你是企业内部智能助理。需要查资料时先查知识库或数据库，需要生成文件时调用生成工具并给用户提供下载链接。';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const messages: ChatCompletionMessageParam[] = Array.isArray(body?.messages) ? body.messages : [];

    const apiKey = process.env.ARK_API_KEY || process.env.AI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: '请先配置 ARK_API_KEY 环境变量' }, { status: 400 });
    }

    const client = new OpenAI({ apiKey, baseURL: process.env.ARK_BASE_URL });
    const model = process.env.ARK_MODEL_ENDPOINT!;
    // 工具 schema 统一由注册表提供，避免与 agent-tools 的实现脱节
    const tools = listToolSchemas() as unknown as OpenAI.Chat.Completions.ChatCompletionTool[];

    const runnerMessages: ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages,
    ];

    const steps: { name: string; ok: boolean; elapsedMs: number; error?: string }[] = [];

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const response = await client.chat.completions.create({
        model,
        messages: runnerMessages,
        tools,
        tool_choice: 'auto',
      });

      const message = response.choices[0]?.message;
      const toolCalls = message?.tool_calls;

      // 没有工具调用，或已达轮数上限：返回最终回答
      if (!message || !toolCalls || toolCalls.length === 0 || round === MAX_TOOL_ROUNDS) {
        return NextResponse.json({
          reply: message?.content ?? '',
          ...(steps.length > 0 ? { steps } : {}),
        });
      }

      // 保存大模型的中间思考状态（含 tool_calls）
      runnerMessages.push(message);

      for (const call of toolCalls) {
        // 兼容 openai 类型里的 custom tool call 变体
        if (call.type !== 'function') continue;

        const name = call.function.name;
        // executeTool 内部完成：参数解析、schema 校验、超时、异常兜底
        const result = await executeTool(name, call.function.arguments);
        steps.push({
          name,
          ok: result.ok,
          elapsedMs: result.elapsedMs,
          ...(result.ok ? {} : { error: (result as { error: string }).error }),
        });

        runnerMessages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(
            result.ok ? result.result : { ok: false, error: (result as { error: string }).error }
          ),
        });
      }
    }

    // 理论不可达
    return NextResponse.json({ reply: '', steps });
  } catch (error: any) {
    console.error('[api/chat]', error);
    return NextResponse.json({ error: error?.message || '内部服务异常' }, { status: 500 });
  }
}
