import { NextRequest, NextResponse } from 'next/server';
import { executeTool } from '@/lib/agent/execute';
import { listToolSchemas } from '@/lib/agent/registry';

export const runtime = 'nodejs';

/** 单次请求内允许的最大工具调用轮数，防止死循环 */
const MAX_TOOL_ROUNDS = 5;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      messages,
      temperature = 0.7,
      maxTokens = 2048,
      tools: toolsOption,
      toolChoice,
      toolContext,
    } = body || {};

    const apiKey = process.env.AI_API_KEY;
    const baseUrl = process.env.AI_BASE_URL || 'https://api.deepseek.com';
    const model = process.env.AI_MODEL || 'deepseek-chat';

    if (!apiKey) {
      return NextResponse.json({ error: '请先配置 AI_API_KEY 环境变量' }, { status: 400 });
    }

    // tools 支持 true（全部工具）或工具名数组（子集）
    const toolSchemas = toolsOption
      ? listToolSchemas(Array.isArray(toolsOption) ? toolsOption : undefined)
      : [];

    const conversation: any[] = Array.isArray(messages) ? [...messages] : [];
    const steps: { name: string; ok: boolean; elapsedMs: number; error?: string }[] = [];

    let data: any;
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const payload: any = {
        model,
        messages: conversation,
        temperature,
        max_tokens: maxTokens,
        stream: false,
      };
      if (toolSchemas.length > 0) {
        payload.tools = toolSchemas;
        if (toolChoice) payload.tool_choice = toolChoice;
      }

      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      data = await response.json();

      if (!response.ok) {
        return NextResponse.json(
          { error: data.error?.message || 'AI 服务调用失败' },
          { status: response.status }
        );
      }

      const message = data.choices?.[0]?.message;
      const toolCalls = message?.tool_calls;

      // 没有工具调用（或未开启工具）则结束循环
      if (!Array.isArray(toolCalls) || toolCalls.length === 0) break;

      // 到达轮数上限仍要求调用工具：直接中断，避免死循环
      if (round === MAX_TOOL_ROUNDS) break;

      // 回传 assistant 的 tool_calls 消息
      conversation.push(message);

      // 服务端执行每个工具，并把结果作为 tool 消息回传
      for (const call of toolCalls) {
        const name = call.function?.name;
        const result = await executeTool(name, call.function?.arguments, toolContext || {});
        steps.push({
          name: name || '',
          ok: result.ok,
          elapsedMs: result.elapsedMs,
          ...(result.ok ? {} : { error: (result as any).error }),
        });
        conversation.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(result.ok ? result.result : { error: (result as any).error }),
        });
      }
    }

    return NextResponse.json({
      content: data?.choices?.[0]?.message?.content || '',
      ...(steps.length > 0 ? { steps } : {}),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || '请求失败' }, { status: 500 });
  }
}
