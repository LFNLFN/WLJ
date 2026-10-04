import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { executeTool } from '@/lib/agent/execute';
import { listToolSchemas } from '@/lib/agent/registry';
import {
  augmentMessagesWithAttachments,
  dropImageParts,
  prepareAttachments,
} from '@/lib/chat/attachments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 单次请求内允许的最大工具调用轮数，防止死循环 */
const MAX_TOOL_ROUNDS = 5;

/** 只接受最近这么多轮历史，避免上下文过长 */
const MAX_HISTORY_MESSAGES = 12;

const SYSTEM_PROMPT = [
  '你是「未来家儿童能力发展中心」的 AI 智能助理，服务对象是中心的教师、治疗师和管理人员。',
  '回答前先取证据，不要凭记忆编造：',
  '1) 涉及课程体系、评估量表、教案、训练计划、机构制度等资料性问题，先调用 search_knowledge_base 检索；',
  '2) 涉及具体业务数据（学生 / 教师 / 课程 / 评估记录等），先调用 query_database 查询；',
  '3) 用户要求导出或生成文件时调用 generate_file，并把返回的下载地址（/generated/...）明确告诉用户。',
  '用户可能随提问附带图片或文件：',
  '  · 图片会以图片形式给你，请直接看图回答；',
  '  · 文本 / 表格 / Word 附件的内容会以 <file name="...">…</file> 的形式拼在问题后面；',
  '  · 如果消息里说明某个附件「未能解析」，必须如实告诉用户你没读到它，不要凭文件名猜测内容。',
  '严格区分「检索到的依据」与「你的建议」，没有依据时如实说明缺少资料。',
  '用中文回答，先给结论再补充要点；涉及儿童个人信息时只回答必要的部分，不做医学诊断。',
].join('\n');

/** 看起来是「接入点不支持图片输入」的错误 */
function looksLikeVisionUnsupported(raw: string): boolean {
  return /image|vision|multimodal|multi-modal|content type|invalid.*content|unsupported/i.test(raw);
}

export async function POST(req: NextRequest) {
  /** 附件处理说明：即使模型调用失败，也一并返回，便于确认哪些附件被读到了 */
  let attachmentNotes: string[] = [];
  try {
    const body = await req.json();
    const rawMessages: ChatCompletionMessageParam[] = (Array.isArray(body?.messages) ? body.messages : [])
      .filter(
        (m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim()
      )
      .slice(-MAX_HISTORY_MESSAGES);

    if (rawMessages.length === 0) {
      return NextResponse.json({ error: 'messages 不能为空' }, { status: 400 });
    }

    const apiKey = process.env.ARK_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: '请先配置 ARK_API_KEY 环境变量' }, { status: 400 });
    }
    if (!process.env.ARK_MODEL_ENDPOINT) {
      return NextResponse.json({ error: '请先配置 ARK_MODEL_ENDPOINT（方舟推理接入点）' }, { status: 400 });
    }

    // 附件：图片走多模态，文本类文件抽取成文本拼进提问
    const prepared = await prepareAttachments(body?.attachments);
    const augmented = augmentMessagesWithAttachments(rawMessages, prepared);
    attachmentNotes = [
      ...prepared.texts.map((t) => `已读取文件：${t.name}`),
      ...prepared.images.map((img) => `已附带图片：${img.name}`),
      ...prepared.skipped.map((s) => `未解析 ${s.name}：${s.reason}`),
    ];

    const client = new OpenAI({ apiKey, baseURL: process.env.ARK_BASE_URL });
    const model = process.env.ARK_MODEL_ENDPOINT!;
    // 工具 schema 统一由注册表提供，避免与 agent-tools 的实现脱节
    const tools = listToolSchemas() as unknown as OpenAI.Chat.Completions.ChatCompletionTool[];

    let runnerMessages: ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...augmented.messages,
    ];

    const steps: { name: string; ok: boolean; elapsedMs: number; error?: string }[] = [];

    /** 调用模型；若接入点不支持图片输入，自动降级为「纯文本 + 说明」重试一次 */
    const completeOnce = async () => {
      try {
        return await client.chat.completions.create({ model, messages: runnerMessages, tools, tool_choice: 'auto' });
      } catch (err) {
        const raw = String((err as Error)?.message || err);
        if (!augmented.usedImages || !looksLikeVisionUnsupported(raw)) throw err;
        const reason = raw.slice(0, 160);
        runnerMessages = dropImageParts(runnerMessages as any, reason) as ChatCompletionMessageParam[];
        attachmentNotes.push(`当前模型接入点不支持图片输入，已忽略图片并重试（${reason}）`);
        return await client.chat.completions.create({ model, messages: runnerMessages, tools, tool_choice: 'auto' });
      }
    };

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const response = await completeOnce();

      const message = response.choices[0]?.message;
      const toolCalls = message?.tool_calls;

      // 没有工具调用，或已达轮数上限：返回最终回答
      if (!message || !toolCalls || toolCalls.length === 0 || round === MAX_TOOL_ROUNDS) {
        return NextResponse.json({
          reply: message?.content ?? '',
          ...(steps.length > 0 ? { steps } : {}),
          ...(attachmentNotes.length > 0 ? { attachments: attachmentNotes } : {}),
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
    const raw = String(error?.message || '');
    const withNotes = (payload: Record<string, unknown>) =>
      NextResponse.json(
        { ...payload, ...(attachmentNotes.length ? { attachments: attachmentNotes } : {}) },
        { status: (payload.status as number) || 500 }
      ) as unknown as NextResponse;

    // 把方舟的常见错误翻译成能看懂的提示
    if (/AccountOverdueError|overdue balance/i.test(raw)) {
      return withNotes({
        status: 502,
        error: '火山方舟账号已欠费，模型调用被暂停。请到方舟控制台「费用中心」充值后再试。',
      });
    }
    if (/AuthenticationError|invalid api key/i.test(raw)) {
      return withNotes({
        status: 502,
        error: '火山方舟 API Key 无效或已失效，请检查服务器上的 ARK_API_KEY。',
      });
    }
    if (/InvalidEndpointOrModel/i.test(raw)) {
      return withNotes({
        status: 502,
        error: '推理接入点不可用，请检查 ARK_MODEL_ENDPOINT（方舟控制台的接入点 ID）。',
      });
    }
    if (error?.name === 'AbortError' || /timeout/i.test(raw)) {
      return withNotes({ status: 504, error: '模型响应超时，请稍后重试。' });
    }
    return withNotes({ status: 500, error: raw || '内部服务异常' });
  }
}
