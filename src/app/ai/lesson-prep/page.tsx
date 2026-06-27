'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { aiGenerate, aiRAGSearch } from '@/lib/api';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface RAGResult {
  id: string;
  title: string;
  content: string;
  type: string;
}

export default function AILessonPrepPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: '你好！我是 AI 备课助手。我可以帮你：\n\n1️⃣ **生成教案** — 输入主题，我帮你生成完整的教案\n2️⃣ **备课建议** — 输入课程内容，我给出教学建议\n3️⃣ **阶段计划** — 帮你规划课程阶段性教学计划\n4️⃣ **搜索已有教案** — 我会从你的教案库中检索相关内容作为参考\n\n请告诉我你需要什么帮助？',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [configStatus, setConfigStatus] = useState<'checking' | 'ok' | 'error' | 'unknown'>('unknown');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 检查 AI 配置状态
  useEffect(() => {
    checkConfig();
  }, []);

  const checkConfig = async () => {
    setConfigStatus('checking');
    try {
      const res = await aiGenerate([
        { role: 'user', content: '返回"ok"' }
      ], 0.1, 10);
      if (res.content) {
        setConfigStatus('ok');
      } else {
        setConfigStatus('error');
      }
    } catch (err) {
      setConfigStatus('error');
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    const userMsg: Message = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      // 先 RAG 检索
      let ragContext = '';
      try {
        const ragRes = await aiRAGSearch(text, 3);
        if (ragRes.results && ragRes.results.length > 0) {
          ragContext = '\n\n从教案库中找到以下相关内容作为参考：\n' +
            ragRes.results.map((r: RAGResult) =>
              `【${r.type}】${r.title}\n${r.content}\n`
            ).join('\n');
        }
      } catch (e) {
        // RAG 检索失败不影响主流程
      }

      // 构建 system prompt
      const systemPrompt = `你是一位专业的特殊教育备课助手，帮助教师准备教案和课程内容。请根据用户的需求提供详细的备课建议。

${ragContext ? `以下是教案库中检索到的相关内容，请参考这些内容来回答：\n${ragContext}` : ''}

回答要求：
1. 如果用户要求生成教案，请提供完整的教案结构（教学目标、教学内容、教学方法、教学步骤等）
2. 如果用户要求备课建议，请针对具体内容给出详细建议
3. 内容要具体、实用、可操作
4. 适合中国特殊教育机构的实际教学场景`;

      const aiRes = await aiGenerate([
        { role: 'system', content: systemPrompt },
        ...messages.filter(m => m.role === 'user').slice(-4).map(m => ({ role: 'user' as const, content: m.content })),
        { role: 'user', content: text },
      ]);

      const assistantMsg: Message = {
        role: 'assistant',
        content: aiRes.content || '抱歉，我没有得到有效的回复，请稍后重试。',
      };
      setMessages(prev => [...prev, assistantMsg]);

    } catch (err: any) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `❌ 请求失败：${err.message || '请检查 AI 配置是否正确'}`,
      }]);
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

  const addToLessonPlan = (content: string, title?: string) => {
    // 跳转到新建教案页面，带内容
    const encoded = encodeURIComponent(content);
    const name = title ? `?title=${encodeURIComponent(title)}&content=${encoded}` : `?content=${encoded}`;
    router.push(`/lesson-plans/new${name}`);
  };

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
                <h2 className="text-2xl font-bold text-gray-800">🤖 AI 辅助备课</h2>
                <p className="text-sm text-gray-500 mt-1">基于大模型 + 教案库检索，快速生成备课内容</p>
              </div>
              <div className="flex items-center gap-3">
                {/* 配置状态 */}
                <div className="flex items-center gap-2 text-sm">
                  <span className={`w-2 h-2 rounded-full ${
                    configStatus === 'ok' ? 'bg-green-500' :
                    configStatus === 'error' ? 'bg-red-500' :
                    configStatus === 'checking' ? 'bg-yellow-500 animate-pulse' : 'bg-gray-400'
                  }`} />
                  <span className="text-gray-500">
                    {configStatus === 'ok' ? 'AI 已就绪' :
                     configStatus === 'error' ? 'AI 未配置' :
                     configStatus === 'checking' ? '检查中...' : '未知'}
                  </span>
                </div>
                <button
                  onClick={() => setShowConfig(!showConfig)}
                  className="px-3 py-1.5 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200 transition-colors"
                >
                  ⚙️ 配置
                </button>
              </div>
            </div>

            {/* 配置面板 */}
            {showConfig && (
              <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <h4 className="text-sm font-medium text-yellow-800 mb-2">AI 配置说明</h4>
                <div className="text-sm text-yellow-700 space-y-1">
                  <p>在项目根目录的 <code className="bg-yellow-100 px-1 rounded">.env.local</code> 文件中配置以下环境变量：</p>
                  <pre className="bg-yellow-100 p-2 rounded text-xs mt-2">
{`# DeepSeek（推荐，中国大陆可直接访问）
AI_API_KEY=sk-你的DeepSeekAPIKey
AI_BASE_URL=https://api.deepseek.com
AI_MODEL=deepseek-chat

# 或 通义千问
# AI_API_KEY=sk-你的通义APIKey
# AI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
# AI_MODEL=qwen-plus`}
                  </pre>
                  <p className="mt-2">配置完成后重启服务即可使用。</p>
                </div>
              </div>
            )}

            {/* 快捷操作 */}
            <div className="flex gap-2 mb-6 flex-wrap">
              {[
                { label: '📝 生成教案', prompt: '请帮我生成一份关于"认知能力训练"的教案，面向特殊教育儿童' },
                { label: '📋 备课建议', prompt: '我正在准备一节"生活自理能力"课程，请给我备课建议' },
                { label: '📅 阶段计划', prompt: '请帮我规划一个20课时的"社交技能训练"课程阶段计划' },
                { label: '🔍 搜索参考', prompt: '搜索教案库中关于社交训练的内容作为参考' },
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={() => {
                    setInput(item.prompt);
                  }}
                  className="px-4 py-2 bg-white border border-gray-200 text-gray-600 text-sm rounded-lg hover:border-primary-300 hover:text-primary-600 transition-colors"
                >
                  {item.label}
                </button>
              ))}
            </div>

            {/* 对话区域 */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="h-[500px] overflow-y-auto p-6 space-y-4">
                {messages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-lg p-4 ${
                      msg.role === 'user'
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-50 border border-gray-200 text-gray-700'
                    }`}>
                      <div className="text-sm whitespace-pre-wrap leading-relaxed">
                        {msg.content}
                      </div>
                      {msg.role === 'assistant' && msg.content.length > 50 && (
                        <div className="flex gap-2 mt-3 pt-3 border-t border-gray-200">
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
                        <span className="ml-1">AI 正在思考...</span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* 输入区域 */}
              <div className="border-t border-gray-200 p-4">
                <div className="flex gap-3">
                  <textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="输入你的备课需求，按 Enter 发送..."
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none resize-none text-sm"
                    rows={2}
                    disabled={loading}
                  />
                  <button
                    onClick={sendMessage}
                    disabled={loading || !input.trim()}
                    className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 self-end"
                  >
                    {loading ? '发送中...' : '发送'}
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-2">按 Shift+Enter 换行 | AI 生成内容仅供参考，请根据实际情况调整</p>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
