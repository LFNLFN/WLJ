#!/usr/bin/env node
/**
 * 把 src/lib/agent/wlj-system-prompt.md 推送到火山方舟托管智能体。
 *
 * 用法：
 *   node scripts/push-agent-prompt.js --dry-run     # 只看将要推送的内容长度 / 差异
 *   node scripts/push-agent-prompt.js               # 实际推送（会创建新版本）
 *   node scripts/push-agent-prompt.js --name "未来家知识助理" --description "…"
 *
 * 说明：
 *   - system prompt 正文取自 markdown 文件里第一个 `---` 之后的全部内容
 *     （`---` 之前是给人看的说明，不进 prompt）
 *   - 更新走 POST /api/v3/agents/{agent_id}，成功会返回新的 version
 *   - 推送前会自动把当前配置备份到 .ark-backup/
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const PROMPT_FILE = path.join(PROJECT_ROOT, 'src/lib/agent/wlj-system-prompt.md');
const BACKUP_DIR = path.join(PROJECT_ROOT, '.ark-backup');

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
const BASE_URL = (
  process.env.ARK_BASE_URL ||
  env.ARK_BASE_URL ||
  'https://ark.cn-beijing.volces.com/api/v3'
).replace(/\/+$/, '');
const AGENT_ID = process.env.ARK_AGENT_ID || env.ARK_AGENT_ID;

/** 取 markdown 里第一个 `---` 之后的正文 */
function readPrompt() {
  const raw = fs.readFileSync(PROMPT_FILE, 'utf8');
  const marker = raw.indexOf('\n---\n');
  const body = marker >= 0 ? raw.slice(marker + 5) : raw;
  return body.trim();
}

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

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

(async () => {
  if (!API_KEY) throw new Error('未找到 ARK_API_KEY');
  if (!AGENT_ID) throw new Error('未找到 ARK_AGENT_ID');

  const prompt = readPrompt();
  const dryRun = process.argv.includes('--dry-run');
  const name = arg('--name');
  const description = arg('--description');

  const current = await api('GET', `/agents/${AGENT_ID}`);
  console.log(`智能体 ${AGENT_ID}（${current.name}，version=${current.version}）`);
  console.log(`当前 prompt 长度=${(current.system || '').length} → 新 prompt 长度=${prompt.length}`);
  if (current.system === prompt && !name && !description) {
    console.log('内容与线上一致，无需推送。');
    return;
  }

  // 备份当前配置
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const backup = path.join(BACKUP_DIR, `agent-${current.version}-${Date.now()}.json`);
  fs.writeFileSync(backup, JSON.stringify(current, null, 2));
  console.log(`已备份当前配置 → ${path.relative(PROJECT_ROOT, backup)}`);

  // version 是乐观并发控制：必须带上当前版本，服务端会自动 +1
  const body = {
    version: current.version,
    system: prompt,
    ...(name ? { name } : {}),
    ...(description ? { description } : {}),
  };
  if (dryRun) {
    console.log('[dry-run] 将推送的字段：', Object.keys(body).join(', '));
    return;
  }

  const updated = await api('POST', `/agents/${AGENT_ID}`, body);
  console.log(`✅ 推送成功：version=${updated.version}，name=${updated.name}`);
})().catch((e) => {
  console.error('失败：', e.message);
  process.exit(1);
});
