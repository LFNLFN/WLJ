#!/usr/bin/env node
/**
 * 火山方舟「知识库」接入自检脚本
 *
 * 用法：
 *   node scripts/check-ark-kb.js                        # 检测 .env.local 里的候选 ID
 *   node scripts/check-ark-kb.js bot-xxxx agent-yyyy    # 检测指定 ID
 *
 * 对每个候选 ID，分别在两条路由上试：
 *   POST {ARK_BASE_URL}/chat/completions        普通模型推理
 *   POST {ARK_BASE_URL}/bots/chat/completions   应用(Bot/Agent) 调用
 *
 * 判定依据：
 *   - 200 且响应里带 references  → ✅ 是绑定了知识库的应用，可用
 *   - 200 但不带 references      → ⚠️ 只是个模型接入点 / 应用没绑知识库
 *   - 400 / 404                  → ❌ 该路由不认这个 ID
 *
 * 只读探测，不会写入任何数据。
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const QUERY = '我们机构的课程体系包括哪些课程？';

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

async function probe(url, apiKey, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* 非 JSON */
    }
    return { status: res.status, text, json };
  } catch (err) {
    return { status: 0, text: String(err.message || err), json: null };
  } finally {
    clearTimeout(timer);
  }
}

function analyze(r) {
  if (r.status !== 200) {
    const code = r.json?.error?.code || '';
    const msg = r.json?.error?.message || r.text;
    return { verdict: 'fail', detail: `HTTP ${r.status} ${code} ${String(msg).slice(0, 90)}` };
  }
  const message = r.json?.choices?.[0]?.message ?? {};
  const refs = message.references ?? r.json?.references;
  const refCount = Array.isArray(refs) ? refs.length : refs ? 1 : 0;
  const content = String(message.content ?? '').trim();
  const resolvedModel = r.json?.model || '(未知)';
  const promptTokens = r.json?.usage?.prompt_tokens;
  if (refCount > 0) {
    return {
      verdict: 'kb-hit',
      detail: `命中知识库，references=${refCount}，底层模型=${resolvedModel}，回答="${content.slice(0, 60)}"`,
    };
  }
  return {
    verdict: 'no-kb',
    detail: `没有 references（prompt_tokens=${promptTokens}），底层模型=${resolvedModel}，回答="${content.slice(0, 60)}"`,
  };
}

const ICON = { 'kb-hit': '✅', 'no-kb': '⚠️ ', fail: '❌' };

async function main() {
  const env = loadEnvLocal();
  const apiKey = env.ARK_API_KEY;
  const baseUrl = (env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/+$/, '');

  if (!apiKey) {
    console.error('未在 .env.local 中找到 ARK_API_KEY');
    process.exit(1);
  }

  const candidates = process.argv.slice(2).filter(Boolean);
  if (candidates.length === 0) {
    for (const k of ['ARK_BOT_ID', 'ARK_MODEL_ENDPOINT', 'ARK_KNOWLEDGE_BASE_ID']) {
      if (env[k]) candidates.push(env[k]);
    }
  }
  if (candidates.length === 0) {
    console.error('没有可检测的 ID：请传入参数，或在 .env.local 配置 ARK_BOT_ID / ARK_MODEL_ENDPOINT');
    process.exit(1);
  }

  console.log(`baseUrl = ${baseUrl}`);
  console.log(`知识库 = ${env.ARK_KNOWLEDGE_BASE_ID || '(未配置)'}`);
  console.log(`测试问题 = ${QUERY}\n`);

  const routes = [
    { label: 'chat/completions      (模型推理)', url: `${baseUrl}/chat/completions` },
    { label: 'bots/chat/completions (应用/Bot)', url: `${baseUrl}/bots/chat/completions` },
  ];

  for (const id of candidates) {
    console.log(`──── ${id} ────`);
    for (const route of routes) {
      const r = await probe(route.url, apiKey, {
        model: id,
        messages: [{ role: 'user', content: QUERY }],
      });
      const a = analyze(r);
      console.log(`  ${ICON[a.verdict]} ${route.label} → ${a.detail}`);
    }
    console.log('');
  }

  console.log('提示：知识库必须绑定到「应用(Bot/智能体)」上，调用走 bots/chat/completions。');
  console.log('     在方舟控制台打开该应用 →「调用」页，示例 curl 里的 model 值才是正确的 ID。');
}

main().catch((e) => {
  console.error('脚本异常：', e);
  process.exit(1);
});
