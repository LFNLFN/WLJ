#!/usr/bin/env node
/**
 * 火山方舟「托管智能体 (Managed Agents)」问答脚本
 *
 * 用法：
 *   node scripts/ark-agent-ask.js "你的问题"
 *   node scripts/ark-agent-ask.js "你的问题" --session sesn-xxxx     # 复用已有会话
 *   node scripts/ark-agent-ask.js "你的问题" --list                  # 只列出 agent / session
 *
 * 协议（2026-06 预览版，baseUrl = https://ark.cn-beijing.volces.com/api/v3）：
 *   GET  /agents                     列出智能体
 *   GET  /agents/{agent_id}          智能体详情（含绑定的 skills / model）
 *   GET  /sessions                   列出会话（会话上绑定 vault → 知识库凭证）
 *   POST /sessions/{id}/events       发送消息 { events: [{ type:'user.message', content:[{type:'text',text}] }] }
 *   GET  /sessions/{id}/events       读取事件流（agent.message 即回答，span.* 为过程）
 *
 * 需要的环境变量（.env.local）：
 *   ARK_API_KEY     必填
 *   ARK_AGENT_ID    智能体 ID，形如 agent-20261004041201-99smp
 *   ARK_SESSION_ID  可选，复用已有会话（会话上必须已绑定知识库凭证）
 *   ARK_BASE_URL    可选，默认 https://ark.cn-beijing.volces.com/api/v3
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');

function loadEnvLocal() {
  const file = path.join(PROJECT_ROOT, '.env.local');
  const env = {};
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (!m) continue;
    env[m[1]] = m[2].trim().replace(/^"|"$/g, '');
  }
  return env;
}

const env = loadEnvLocal();
const API_KEY = process.env.ARK_API_KEY || env.ARK_API_KEY;
const BASE_URL = (process.env.ARK_BASE_URL || env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/+$/, '');
const AGENT_ID = process.env.ARK_AGENT_ID || env.ARK_AGENT_ID;
let SESSION_ID = process.env.ARK_SESSION_ID || env.ARK_SESSION_ID;

async function api(method, apiPath, body) {
  const res = await fetch(`${BASE_URL}${apiPath}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* 非 JSON */
  }
  if (!res.ok) {
    const err = json?.error;
    throw new Error(`${method} ${apiPath} → HTTP ${res.status} ${err?.code || ''} ${err?.message || text.slice(0, 200)}`);
  }
  return json;
}

const clip = (s, n = 300) => String(s ?? '').replace(/\s+/g, ' ').slice(0, n);

function summarize(event) {
  const t = event.type || '?';
  if (t === 'user.message' || t === 'agent.message' || t === 'agent.thinking') {
    return (event.content || []).map((c) => c.text || '').join('');
  }
  if (t.startsWith('span.')) return clip(JSON.stringify(event), 200);
  if (t.includes('status')) return clip(JSON.stringify(event.stop_reason || ''), 80);
  return '';
}

async function listAll() {
  const agents = await api('GET', '/agents');
  console.log('== 智能体 ==');
  for (const a of agents.data || []) {
    console.log(`  ${a.id}  ${a.name}  skills=${(a.skills || []).map((s) => s.display_name || s.skill_id).join(',')}`);
  }
  const sessions = await api('GET', '/sessions');
  console.log('== 会话（vault 里放知识库凭证）==');
  for (const s of sessions.data || []) {
    console.log(`  ${s.id}  status=${s.status}  agent=${s.agent?.id}  vaults=${(s.vault_ids || []).join(',')}  title=${s.title}`);
  }
}

/** 用 environment + vault 新建一个会话（vault 里放 Viking 知识库凭证） */
async function createSession() {
  const environmentId = process.env.ARK_ENVIRONMENT_ID || env.ARK_ENVIRONMENT_ID;
  const vaultId = process.env.ARK_VAULT_ID || env.ARK_VAULT_ID;
  if (!environmentId || !vaultId) return null;
  const created = await api('POST', '/sessions', {
    environment_id: environmentId,
    agent: AGENT_ID,
    vault_ids: [vaultId],
    title: '临时检索会话',
  });
  return created.id;
}

async function ask(question) {
  if (!SESSION_ID) {
    SESSION_ID = await createSession();
    if (SESSION_ID) console.log(`（已新建临时会话 ${SESSION_ID}）`);
  }
  if (!SESSION_ID) throw new Error('未指定会话：请在 .env.local 配置 ARK_SESSION_ID，或配置 ARK_ENVIRONMENT_ID+ARK_VAULT_ID 自动新建');

  const before = (await api('GET', `/sessions/${SESSION_ID}/events`)).data || [];
  const beforeIds = new Set(before.map((e) => e.id));

  console.log(`会话 ${SESSION_ID} 提问：${question}\n`);
  await api('POST', `/sessions/${SESSION_ID}/events`, {
    events: [{ type: 'user.message', content: [{ type: 'text', text: question }] }],
  });

  const deadline = Date.now() + 180_000;
  let sawIdle = false;
  const printed = new Set();
  let answer = '';

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 4000));
    const events = (await api('GET', `/sessions/${SESSION_ID}/events`)).data || [];
    for (const e of events) {
      if (beforeIds.has(e.id) || printed.has(e.id)) continue;
      printed.add(e.id);
      const text = summarize(e);
      console.log(`· ${e.type}${text ? ` :: ${clip(text, 400)}` : ''}`);
      if (e.type === 'agent.message') answer += (e.content || []).map((c) => c.text || '').join('');
      if (e.type === 'session.status_idle' || e.type === 'session.thread_status_idle') sawIdle = true;
    }
    if (sawIdle) break;
  }

  console.log('\n===== 最终回答 =====');
  console.log(answer || '(未收到 agent.message)');
}

(async () => {
  const args = process.argv.slice(2);
  const sessionFlag = args.indexOf('--session');
  if (sessionFlag >= 0) {
    SESSION_ID = args[sessionFlag + 1];
    args.splice(sessionFlag, 2);
  }
  if (args.includes('--list')) return listAll();

  const question = args.join(' ').trim();
  if (!question) {
    console.error('用法：node scripts/ark-agent-ask.js "你的问题" [--session sesn-xxx] | --list');
    process.exit(1);
  }
  await ask(question);
})().catch((e) => {
  console.error('失败：', e.message);
  process.exit(1);
});
