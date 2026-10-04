/**
 * 服务端工具执行接口。
 *
 * GET  /api/ai/tools   -> { ok, tools, config }
 *      tools：可用工具的 schema 列表（供前端/大模型使用）
 *      config：当前 AI / 知识库接入状态（**不含任何密钥**），供页面显示"已就绪/未配置"
 * POST /api/ai/tools   -> 执行单个工具
 *      body: { name: string, arguments?: object | string }
 *
 * 该路由受 middleware 鉴权保护（需要登录）。
 */

import { NextResponse } from 'next/server';
import { executeTool } from '@/lib/agent/execute';
import { runWithAgentContext } from '@/lib/agent/context';
import { agentContextFromRequest } from '@/lib/agent/identity';
import { listToolSchemas } from '@/lib/agent/registry';
import { getAgentConfigStatus } from '@/lib/agent-tools';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ ok: true, tools: listToolSchemas(), config: getAgentConfigStatus() });
}

export async function POST(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: '请求体必须是合法的 JSON' }, { status: 400 });
  }

  const name = body?.name ?? body?.tool;
  if (!name || typeof name !== 'string') {
    return NextResponse.json({ ok: false, error: '缺少工具名 name' }, { status: 400 });
  }

  const args = body.arguments ?? body.args ?? {};
  // 带调用者身份执行：search_knowledge_base 会把身份拼进发给方舟托管智能体的问题里，
  // 否则这条路径（不经过 /api/chat）对智能体来说是"匿名调用"，遇到学生数据同样会被拒答。
  const ctx = await agentContextFromRequest(request);
  const result = await runWithAgentContext(ctx, () => executeTool(name, args));

  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
