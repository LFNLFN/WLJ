'use client';

/**
 * AI 智能助理（首页）
 *
 * 由火山方舟模型 + 服务端工具层驱动：
 *   - search_knowledge_base  查内部知识库（课程 / 量表 / 课堂记录 / 教案 / 训练计划 + 方舟知识库）
 *   - query_database         查业务库（学生 / 教师 / 课程 / 评估记录 …）
 *   - generate_file          生成 Excel / Word 并给出下载地址
 *
 * 不再依赖 DeepSeek 等外部大模型服务：模型走 ARK_MODEL_ENDPOINT，
 * 工具在服务端 /api/ai/tools 执行，对话入口是 /api/chat。
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { agentChat, getAgentTools } from '@/lib/api';

interface ToolStep {
  name: string;
  ok: boolean;
  elapsedMs: number;
  error?: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  steps?: ToolStep[];
}

/** 工具名的中文展示 */
const TOOL_LABEL: Record<string, string> = {
  search_knowledge_base: '检索知识库',
  query_database: '查询业务库',
  generate_file: '生成文件',
};

const WELCOME: Message = {
  role: 'assistant',
  content: `你好！我是未来家的 AI 智能助理，可以直接帮你干活：

1. 📚 **查知识库** — 课程体系、评估量表、教案、训练计划、机构制度
2. 📊 **查业务数据** — 学生 / 教师 / 课程 / 评估记录（如"统计各表数据量""查一下张老师的信息"）
3. 📄 **生成文件** — 导出 Excel / Word 并给你下载地址
4. 📝 **写教案** — 生成教案草稿后可以直接「保存为教案」进教案库

直接把需求说清楚就行，例如：「我们机构的课程体系包括哪些课程？」`,
};

const QUICK_PROMPTS = [
  { label: '📚 课程体系有哪些', prompt: '我们机构的课程体系包括哪些课程？' },
  { label: '🧾 量表评分标准', prompt: '感觉统合评估的评分标准是怎么记的？' },
  { label: '📊 统计业务数据', prompt: '帮我统计一下系统里各业务表的数据量' },
  { label: '📄 导出学生名单', prompt: '把学生名单导出成一个 Excel 文件给我' },
  { label: '📝 生成教案', prompt: '帮我生成一份关于「认知能力训练」的教案草稿' },
];

const ENV_HELP = `# 火山方舟（唯一的大模型服务，不再需要 DeepSeek）
ARK_API_KEY=ark-xxxx            # 必填
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
ARK_MODEL_ENDPOINT=ep-m-xxxx    # 推理接入点

# 知识库（可选，走托管智能体）
ARK_AGENT_ID=agent-xxxx
ARK_ENVIRONMENT_ID=env-xxxx
ARK_VAULT_ID=vlt-xxxx           # 凭证库里放 Viking 知识库 API Key

# 业务数据库
DATABASE_URL=postgresql://...`;

/** 清理 AI 回复里不适合直接搬运到教案库的修饰（沿用原来「保存为教案」的清洗逻辑） */
function extractCoreContent(content: string): string {
  const patterns = [
    /^(好的|好|好的，|没问题|当然可以|我来|我为您|我帮你|我这就|以下|这是)[^。]*[。：:]\s*/,
    /^[^。]*?为你[^。]*?[。：:]\s*/,
    /^[^。]*?如下[：:]\s*/,
  ];
  let cleaned = content;
  for (const p of patterns) cleaned = cleaned.replace(p, '');
  cleaned = cleaned.replace(/^[#*\s>]+/gm, '').replace(/\*\*/g, '').replace(/`/g, '');
  cleaned = cleaned.replace(/^-\s+/gm, '  • ').replace(/^\d+\.\s+/gm, '  ');
  return cleaned.replace(/\n{3,}/g, '\n\n').trim();
}

function extractTitle(text: string): string {
  const patterns = [/(?:主题|课题|课程名称|教案名称|活动名称)[：:]\s*([^\n]+)/, /^#+\s*(.+)$/m, /^(?:【|《)(.+?)(?:】|》)/];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].trim();
  }
  const lines = text.split('\n').filter((l) => l.trim() && !l.match(/^[#*\s]*$/));
  return lines[0]?.trim().slice(0, 30).replace(/^[#*\s]+/, '').trim() || 'AI 生成教案';
}

/** 行内解析：**加粗**、`代码`、/generated/xxx 下载地址 */
function renderInline(text: string, keyPrefix: string) {
  const nodes: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\/generated\/[^\s)（），。]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith('**')) {
      nodes.push(<strong key={`${keyPrefix}-b${i++}`}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`')) {
      nodes.push(
        <code key={`${keyPrefix}-c${i++}`} className="px-1 rounded bg-gray-100 text-[13px]">
          {token.slice(1, -1)}
        </code>
      );
    } else {
      nodes.push(
        <a
          key={`${keyPrefix}-a${i++}`}
          href={token}
          download
          className="text-primary-600 underline break-all"
        >
          📥 下载文件
        </a>
      );
    }
    last = m.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/** 轻量 Markdown 渲染：标题 / 列表 / 表格 / 行内样式（够用即可，不引第三方依赖） */
function renderRich(content: string) {
  const lines = content.split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 表格
    if (line.trim().startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      blocks.push(
        <div key={`t${key++}`} className="overflow-x-auto my-2">
          <table className="min-w-full text-[13px] border border-gray-200 rounded">
            <thead className="bg-gray-50">
              <tr>
                {head?.map((h, hi) => (
                  <th key={hi} className="border-b border-gray-200 px-2 py-1 text-left font-medium text-gray-600">
                    {renderInline(h, `th${key}-${hi}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((row, ri) => (
                <tr key={ri}>
                  {row.map((c, ci) => (
                    <td key={ci} className="border-b border-gray-100 px-2 py-1 align-top">
                      {renderInline(c, `td${key}-${ri}-${ci}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      blocks.push(<div key={`e${key++}`} className="h-2" />);
      i++;
      continue;
    }
    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      blocks.push(
        <div
          key={`h${key++}`}
          className={`mt-2 mb-1 font-semibold ${level <= 2 ? 'text-gray-800' : 'text-gray-700'}`}
        >
          {renderInline(heading[2], `h${key}`)}
        </div>
      );
      i++;
      continue;
    }
    const bullet = trimmed.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      blocks.push(
        <div key={`ul${key++}`} className="flex gap-2 ml-1">
          <span className="text-gray-400">•</span>
          <span>{renderInline(bullet[1], `ul${key}`)}</span>
        </div>
      );
      i++;
      continue;
    }
    const ordered = trimmed.match(/^(\d+)[.)]\s+(.*)$/);
    if (ordered) {
      blocks.push(
        <div key={`ol${key++}`} className="flex gap-2 ml-1">
          <span className="text-gray-500 min-w-[1.2em]">{ordered[1]}.</span>
          <span>{renderInline(ordered[2], `ol${key}`)}</span>
        </div>
      );
      i++;
      continue;
    }
    blocks.push(
      <div key={`p${key++}`} className="leading-relaxed">
        {renderInline(trimmed, `p${key}`)}
      </div>
    );
    i++;
  }
  return blocks;
}

export default function HomePage() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [configStatus, setConfigStatus] = useState<'checking' | 'ok' | 'error'>('checking');
  const [config, setConfig] = useState<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 从 sessionStorage 恢复对话
  useEffect(() => {
    const saved = sessionStorage.getItem('agent_chat_messages');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) setMessages(parsed);
      } catch (e) {}
    }
  }, []);

  useEffect(() => {
    if (messages.length > 0) sessionStorage.setItem('agent_chat_messages', JSON.stringify(messages));
  }, [messages]);

  // 对话更新后滚到底部
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    checkConfig();
  }, []);

  const checkConfig = async () => {
    setConfigStatus('checking');
    try {
      const res = await getAgentTools();
      setConfig(res?.config ?? null);
      setConfigStatus(res?.config?.apiKeyConfigured ? 'ok' : 'error');
    } catch (err) {
      setConfigStatus('error');
    }
  };

  const addToLessonPlan = (content: string) => {
    const core = extractCoreContent(content);
    localStorage.setItem('ai_generated_content', core);
    localStorage.setItem('ai_generated_title', extractTitle(core));
    router.push('/lesson-plans/new?from=ai');
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setLoading(true);

    try {
      // 只带最近若干轮，避免上下文过长
      const history = [...messages, { role: 'user' as const, content: text }]
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .slice(-8)
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await agentChat(history);
      if (res?.error) throw new Error(res.error);

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: res?.reply || '（智能助理没有返回内容，请换个说法再试）',
          steps: res?.steps,
        },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `❌ 请求失败：${err?.message || '请检查服务端配置'}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const kbModeLabel =
    config?.knowledgeBaseMode === 'agent'
      ? '知识库已接入（托管智能体）'
      : config?.knowledgeBaseMode === 'bot'
        ? '知识库已接入（应用）'
        : config?.knowledgeBaseMode === 'endpoint'
          ? '知识库已接入（自定义接口）'
          : '知识库未接入（仅用库内数据）';

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-4xl mx-auto">
            {/* 顶部标题区 */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-800">🤖 AI 智能助理</h2>
                <p className="text-sm text-gray-500 mt-1">
                  火山方舟大模型 + 知识库检索 / 业务数据查询 / 文件生成（无需 DeepSeek）
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div
                  className="flex items-center gap-2 text-sm"
                  title={`${kbModeLabel}（只检查配置是否存在，不代表方舟账号可用）`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      configStatus === 'ok'
                        ? 'bg-green-500'
                        : configStatus === 'error'
                          ? 'bg-red-500'
                          : 'bg-yellow-500 animate-pulse'
                    }`}
                  />
                  <span className="text-gray-500">
                    {configStatus === 'ok' ? '已配置' : configStatus === 'error' ? '未配置' : '检查中...'}
                  </span>
                </div>
                <button
                  onClick={() => setShowConfig(!showConfig)}
                  className="px-3 py-1.5 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200 transition-colors"
                >
                  ⚙️ 配置
                </button>
                <button
                  onClick={() => {
                    sessionStorage.removeItem('agent_chat_messages');
                    setMessages([WELCOME]);
                  }}
                  className="px-3 py-1.5 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200 transition-colors"
                >
                  🗑️ 清空对话
                </button>
              </div>
            </div>

            {/* 配置面板 */}
            {showConfig && (
              <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <h4 className="text-sm font-medium text-yellow-800 mb-2">服务配置</h4>
                <div className="text-sm text-yellow-700 space-y-1">
                  <p>
                    当前状态：API Key{' '}
                    <b>{config?.apiKeyConfigured ? '已配置' : '未配置'}</b> ｜ 模型{' '}
                    <b>{config?.model || '未设置'}</b> ｜ {kbModeLabel} ｜ 业务数据库{' '}
                    <b>{config?.databaseConfigured ? '已连接' : '未配置'}</b>
                  </p>
                  <p className="mt-2">
                    在项目根目录的 <code className="bg-yellow-100 px-1 rounded">.env.local</code> 中配置
                    （线上在同名环境变量里配置）：
                  </p>
                  <pre className="bg-yellow-100 p-2 rounded text-xs mt-2 overflow-x-auto">{ENV_HELP}</pre>
                  <p className="mt-2">配置完成后重启服务即可生效。</p>
                </div>
              </div>
            )}

            {/* 快捷操作 */}
            <div className="flex gap-2 mb-6 flex-wrap">
              {QUICK_PROMPTS.map((item) => (
                <button
                  key={item.label}
                  onClick={() => setInput(item.prompt)}
                  className="px-4 py-2 bg-white border border-gray-200 text-gray-600 text-sm rounded-lg hover:border-primary-300 hover:text-primary-600 transition-colors"
                >
                  {item.label}
                </button>
              ))}
            </div>

            {/* 对话区域 */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div ref={scrollRef} className="h-[520px] overflow-y-auto p-6 space-y-4">
                {messages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[85%] rounded-lg p-4 ${
                        msg.role === 'user'
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-50 border border-gray-200 text-gray-700'
                      }`}
                    >
                      <div className="text-sm">
                        {msg.role === 'user' ? (
                          <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                        ) : (
                          renderRich(msg.content)
                        )}
                      </div>

                      {/* 工具调用过程 */}
                      {!!msg.steps?.length && (
                        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-200">
                          {msg.steps.map((s, si) => (
                            <span
                              key={si}
                              title={s.error || ''}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] ${
                                s.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                              }`}
                            >
                              {s.ok ? '🔧' : '⚠️'} {TOOL_LABEL[s.name] || s.name}
                              <span className="text-gray-400">{(s.elapsedMs / 1000).toFixed(1)}s</span>
                            </span>
                          ))}
                        </div>
                      )}

                      {msg.role === 'assistant' && idx > 0 && msg.content.length > 50 && (
                        <div className="flex gap-3 mt-3 pt-3 border-t border-gray-200">
                          <button
                            onClick={() => addToLessonPlan(msg.content)}
                            className="text-xs text-primary-600 hover:text-primary-800"
                          >
                            📥 保存为教案
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <span className="animate-pulse">●</span>
                        <span className="animate-pulse" style={{ animationDelay: '0.2s' }}>●</span>
                        <span className="animate-pulse" style={{ animationDelay: '0.4s' }}>●</span>
                        <span className="ml-1">正在处理（查资料 / 查数据可能需要十几秒）...</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 输入区域 */}
              <div className="border-t border-gray-200 p-4">
                <div className="flex gap-3">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="说清楚你要查什么 / 要生成什么，按 Enter 发送..."
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none resize-none text-sm"
                    rows={2}
                    disabled={loading}
                  />
                  <button
                    onClick={sendMessage}
                    disabled={loading || !input.trim()}
                    className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 self-end"
                  >
                    {loading ? '处理中...' : '发送'}
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  按 Shift+Enter 换行 ｜ 回答由大模型结合知识库/业务库生成，请核对后再使用
                </p>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
