#!/usr/bin/env node
/**
 * 火山方舟「托管智能体」会话实时监控（SSE）
 *
 * 用法：
 *   node scripts/session-watch.js "王小明的出生日期是什么？"              # 新建会话（用完即删）
 *   node scripts/session-watch.js "接着上一条继续" --session sesn-xxxx    # 复用会话（带上下文）
 *   node scripts/session-watch.js "问题" --keep                        # 保留新建的会话（方便去控制台看）
 *   node scripts/session-watch.js "问题" --timeout 60000               # 最长等多久（默认 60s）
 *
 * 等价于手动做这几步（脚本帮你连起来，并给每帧打上相对时间）：
 *   1) POST {ARK_BASE_URL}/sessions               建会话（带 environment + vault）
 *   2) GET  {ARK_BASE_URL}/sessions/{id}/events/stream   开 SSE 流（就是你拼的 curl -N）
 *   3) POST {ARK_BASE_URL}/sessions/{id}/events   发 user.message
 *   4) 消费 SSE 帧，直到 session.status_idle
 *
 * 只读业务数据；新建的临时会话默认在结束时删除。
 */

const fs = require('fs');
const path = require('path');

function loadEnv() {
  const file = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
loadEnv();

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`用法：node scripts/session-watch.js "问题" [--session sesn-xxx] [--keep] [--timeout 60000]

  --session <id>   复用已有会话（带上下文）；不传则新建，结束后自动删除
  --keep           保留新建的会话
  --timeout <ms>   最长等待，默认 60000

例：
  npm run session:watch -- "王小明的出生日期是什么？"
  npm run session:watch -- "接着上一条继续" --session sesn-20261004055646-hqst3
`);
  process.exit(0);
}

const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const QUESTION = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--session' && args[args.indexOf(a) - 1] !== '--timeout') || '王小明的出生日期是什么？';
const SESSION_ID = flag('session', '');
const KEEP = args.includes('--keep');
const TIMEOUT = Number(flag('timeout', 60000));
const BASE = (process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/+$/, '');
const KEY = process.env.ARK_API_KEY;
const H = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const t0 = Date.now();
const ts = () => `+${String(Date.now() - t0).padStart(6)}ms`;

/** 把帧里的文本内容压成一行摘要 */
function frameSummary(e) {
  const text = (e.content || []).map((c) => c.text || '').filter(Boolean).join(' ').replace(/\s+/g, ' ');
  if (e.type === 'agent.tool_result') return `知识库/工具返回：${text.slice(0, 100)}`;
  if (e.type === 'agent.tool_use') return '(调用工具)';
  return text.slice(0, 110);
}

(async () => {
  if (!KEY) throw new Error('未配置 ARK_API_KEY');

  let sessionId = SESSION_ID;
  let created = false;
  if (!sessionId) {
    const res = await fetch(`${BASE}/sessions`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({
        environment_id: process.env.ARK_ENVIRONMENT_ID,
        agent: process.env.ARK_AGENT_ID,
        vault_ids: [process.env.ARK_VAULT_ID],
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`建会话失败(${res.status})：${(await res.text()).slice(0, 200)}`);
    sessionId = (await res.json()).id;
    created = true;
  }

  console.log('='.repeat(78));
  console.log(` 会话 ${sessionId}${created ? '（本次新建，结束时会删除）' : '（复用，带上下文）'}`);
  console.log(` 问题 ${QUESTION}`);
  console.log(` 流   ${ts()} 连接 ${BASE}/sessions/${sessionId}/events/stream`);
  console.log('='.repeat(78));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  const stream = await fetch(`${BASE}/sessions/${sessionId}/events/stream`, {
    headers: { ...H, Accept: 'text/event-stream' },
    signal: controller.signal,
  });
  if (!stream.ok || !stream.body) throw new Error(`SSE 连接失败(${stream.status})`);
  console.log(`${ts()}  流已建立 HTTP ${stream.status}  content-type=${stream.headers.get('content-type')}`);

  // 流建立之后再发问，避免漏掉最早的帧
  const post = await fetch(`${BASE}/sessions/${sessionId}/events`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ events: [{ type: 'user.message', content: [{ type: 'text', text: QUESTION }] }] }),
    signal: AbortSignal.timeout(20000),
  });
  if (!post.ok) throw new Error(`发消息失败(${post.status})：${(await post.text()).slice(0, 200)}`);
  console.log(`${ts()}  已发送 user.message\n`);

  const reader = stream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let dataLines = [];
  let frames = 0;
  let answer = '';
  let idle = false;

  while (!idle) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      let line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (line === '') {
        if (dataLines.length) {
          const payload = dataLines.join('\n');
          dataLines = [];
          let e = null;
          try { e = JSON.parse(payload); } catch { /* 忽略非 JSON */ }
          if (e) {
            frames++;
            console.log(`${ts()}  #${String(frames).padStart(2)} ${e.type.padEnd(32)} ${frameSummary(e)}`);
            if (e.type === 'agent.message') answer = (e.content || []).map((c) => c.text || '').join(' ');
            if (/idle/.test(e.type)) idle = true;
          }
        }
        continue;
      }
      if (line.startsWith(':')) { console.log(`${ts()}      ${line}（心跳）`); continue; }
      if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
    }
  }

  clearTimeout(timer);
  controller.abort();

  console.log('\n' + '-'.repeat(78));
  if (answer) console.log(`最终回答：\n${answer.trim()}`);
  else console.log(idle ? '本轮结束，但没有 agent.message' : `⚠️ ${TIMEOUT}ms 内未结束（可加 --timeout）`);
  console.log(`\n共 ${frames} 帧，用时 ${((Date.now() - t0) / 1000).toFixed(1)}s${idle ? '，会话已回到 idle' : ''}`);

  if (created && !KEEP) {
    await fetch(`${BASE}/sessions/${sessionId}`, { method: 'DELETE', headers: H }).catch(() => {});
    console.log(`临时会话 ${sessionId} 已删除（想保留请加 --keep）`);
  }
})().catch((e) => {
  console.error('失败：', e.message);
  process.exit(1);
});
