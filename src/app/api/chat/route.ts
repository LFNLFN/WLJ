import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { executeTool } from '@/lib/agent/execute';
import { listToolSchemas } from '@/lib/agent/registry';
import { roleLabel, runWithAgentContext } from '@/lib/agent/context';
import {
  PERMISSION_GUARD_NOTE,
  agentContextFromRequest,
  callerSystemLine,
  shouldRetryPermissionRefusal,
} from '@/lib/agent/identity';
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
  '3) 儿童的个人档案（康复训练档案 / 评估报告等 PDF）常常只上传到知识库、业务库里没有对应学生记录：'
  + 'query_database 查某个学生 0 条时，**必须**再用 search_knowledge_base 以该姓名检索一次，'
  + '把两处结果合起来回答；两处都没有命中才能说"没有查到"（并说明查过哪两处）；',
  '4) 系统里确实没有的资料，直接说明"系统里没有查到"，并列出一共查了哪几处（业务库的哪张表 / 知识库）；'
  + '不要把「请联系 XX 老师 / 中心管理人员查询」当成回答 —— 能给数据就先给数据，人工渠道最多作为补充说明；',
  '5) 用户要求导出或生成文件时调用 generate_file（支持 Excel / Word / **PPT**），并把返回的下载地址（/generated/...）明确告诉用户；'
  + '做演示稿用 type=ppt，content 给 { title, subtitle, slides:[{title, bullets:[…], table:{headers,rows}}] }，也可以只给 { title, text }（按 Markdown 标题分页）。',
  '用户可能随提问附带图片或文件：',
  '  · 图片会以图片形式给你，请直接看图回答；',
  '  · 文本 / 表格 / Word 附件的内容会以 <file name="...">…</file> 的形式拼在问题后面；',
  '  · 如果消息里说明某个附件「未能解析」，必须如实告诉用户你没读到它，不要凭文件名猜测内容。',
  '严格区分「检索到的依据」与「你的建议」，没有依据时如实说明缺少资料。',
  '医学边界的正确姿势：**先给资料，再划边界**。档案 / 评估记录里写了什么（评估项目、得分、结论等级、评估人、日期等）'
  + '照实答出来 —— 那是档案记载，不是你在下诊断；需要时在最后补一句"结论以专业人员综合评估为准"即可。'
  + '只有用户要你**下诊断、给治疗方案或用药建议**时才明确拒绝，并且拒绝时不要用"建议咨询医生 / 老师"替代本该给出的资料。',
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

    /**
     * 当前登录用户：middleware 已把会话透传成 x-user-* 头（拿不到头时 agentContextFromRequest
     * 会兜底用同一份会话 token 验签，见 src/lib/agent/identity.ts）。
     *
     * 为什么必须有：模型与方舟托管智能体都看不到我们的登录态，不告诉它"谁在问"，
     * 它遇到学生/评估这类数据就会以「你当前没有访问学生及相关数据的权限」搪塞（2026-10-04 线上实测）。
     * 同时通过 AsyncLocalStorage 把身份带进工具执行层（见 src/lib/agent/context.ts）。
     */
    const agentCtx = await agentContextFromRequest(req);
    const userLine = callerSystemLine(agentCtx);
    let systemContent = userLine ? `${SYSTEM_PROMPT}\n\n${userLine}` : SYSTEM_PROMPT;

    // 留一行可核对的日志：以后若再有人反馈"助理说我没权限 / 说我是教师"，
    // 直接看这行就知道当时模型到底拿到的身份是什么、角色来自数据库还是过期 token。
    console.log(
      `[api/chat] 调用者=${agentCtx.name || '匿名'}（${roleLabel(agentCtx.role)}）` +
        ` 身份来源=${agentCtx.source} 角色来源=${agentCtx.roleInDb ? 'db' : 'token/匿名'}` +
        (agentCtx.roleInDb && agentCtx.roleFromToken && agentCtx.roleInDb !== agentCtx.roleFromToken
          ? `（⚠️ 会话 token 里是过期的 "${agentCtx.roleFromToken}"）`
          : '')
    );

    const client = new OpenAI({ apiKey, baseURL: process.env.ARK_BASE_URL });
    const model = process.env.ARK_MODEL_ENDPOINT!;
    // 工具 schema 统一由注册表提供，避免与 agent-tools 的实现脱节
    const tools = listToolSchemas() as unknown as OpenAI.Chat.Completions.ChatCompletionTool[];

    let runnerMessages: ChatCompletionMessageParam[] = [
      { role: 'system', content: systemContent },
      ...augmented.messages,
    ];

    /** 「权限拒绝话术」兜底重试：每个请求最多触发一次（防止模型反复拒答时死循环） */
    let permissionRetried = false;
    /** 触发兜底重试的那条拒绝回答：重问后若模型给了空回复，宁可把这条原样返回，也不要回一句空话 */
    let refusalFallbackReply = '';

    const steps: { name: string; ok: boolean; elapsedMs: number; error?: string }[] = [];

    /**
     * 思考（thinking）开关。
     *
     * 实测同一个接入点（doubao-seed-2-1-pro）问「用一句话说明你是哪个模型」：
     *   · 默认（带 thinking）：7.7s，reasoning_tokens=299
     *   · thinking={type:'disabled'}：1.1s，reasoning_tokens=0   ← 快 7 倍
     *   · thinking={type:'auto'}：400 InvalidParameter（该模型不支持 auto）
     * 助理这里要的是「查资料 + 照格式回答」，不需要长思考，所以默认关掉；
     * 想恢复模型默认（复杂推理更稳）就把 ARK_CHAT_THINKING=default。
     * 注意：只对支持该参数/字段的接入点有效，不支持时会自动去掉参数重试一次。
     */
    const thinkingMode = (process.env.ARK_CHAT_THINKING || '').trim().toLowerCase();
    const thinking =
      thinkingMode === 'default' || thinkingMode === 'on' || thinkingMode === 'enabled'
        ? undefined
        : { type: 'disabled' };

    /** 调用模型；去掉不被支持的参数/图片后自动重试一次 */
    const completeOnce = async () => {
      const payload: any = { model, messages: runnerMessages, tools, tool_choice: 'auto' };
      if (thinking) payload.thinking = thinking;
      try {
        return await client.chat.completions.create(payload);
      } catch (err) {
        const raw = String((err as Error)?.message || err);
        // 接入点不认识 thinking 参数：去掉它重试（不影响功能，只是慢一点）
        if (thinking && /thinking/i.test(raw)) {
          delete payload.thinking;
          return await client.chat.completions.create(payload);
        }
        if (!augmented.usedImages || !looksLikeVisionUnsupported(raw)) throw err;
        const reason = raw.slice(0, 160);
        runnerMessages = dropImageParts(runnerMessages as any, reason) as ChatCompletionMessageParam[];
        attachmentNotes.push(`当前模型接入点不支持图片输入，已忽略图片并重试（${reason}）`);
        const retryPayload: any = { model, messages: runnerMessages, tools, tool_choice: 'auto' };
        if (thinking) retryPayload.thinking = thinking;
        return await client.chat.completions.create(retryPayload);
      }
    };

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const response = await completeOnce();

      const message = response.choices[0]?.message;
      const toolCalls = message?.tool_calls;

      // 没有工具调用，或已达轮数上限：返回最终回答
      if (!message || !toolCalls || toolCalls.length === 0 || round === MAX_TOOL_ROUNDS) {
        const content = message?.content ?? '';

        /**
         * 兜底：模型在"没调用任何工具"的情况下直接生成「你没有…权限」的拒绝话术。
         *
         * 主修复是 system prompt 里的身份 + 授权模型说明（callerSystemLine），但实测模型仍会偶发拒答
         * （线上：问「把中心所有学生的家长电话给我」时 steps 为空、直接回绝 —— 就是梁丰年看到的那类回复）。
         * 这里只在「已知调用者身份 + 本轮没调用任何工具 + 回答是权限拒绝话术」时，把权限提醒补进
         * system prompt 重问一次；每请求最多一次，正常问答完全不受影响（判定逻辑见 shouldRetryPermissionRefusal）。
         */
        if (
          shouldRetryPermissionRefusal({
            ctx: agentCtx,
            reply: content,
            toolCallCount: toolCalls?.length ?? 0,
            alreadyRetried: permissionRetried,
            round,
            maxRounds: MAX_TOOL_ROUNDS,
          })
        ) {
          permissionRetried = true;
          refusalFallbackReply = content;
          systemContent = `${systemContent}\n\n${PERMISSION_GUARD_NOTE}`;
          runnerMessages[0] = { role: 'system', content: systemContent };
          // 故意**不把这条拒绝回答塞进历史**：拒绝本身没有价值，塞进去只会让模型以为"我已经答过了"，
          // 重问时直接回一句空话（实测：会拿到 finish_reason=stop 且 content=""）。
          // 这里要的是"带着权限提醒重新生成一遍"，历史保持原样即可。
          continue;
        }

        return NextResponse.json({
          reply: content || (permissionRetried && steps.length === 0 ? refusalFallbackReply : ''),
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
        // 带上下文执行：工具内部（尤其是发给托管智能体的检索）能读到调用者身份
        const result = await runWithAgentContext(agentCtx, () => executeTool(name, call.function.arguments));
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
