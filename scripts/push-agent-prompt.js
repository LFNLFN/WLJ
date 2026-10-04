#!/usr/bin/env node
/**
 * 把 src/lib/agent/wlj-system-prompt.md 推送到火山方舟托管智能体。
 *
 * 用法：
 *   node scripts/push-agent-prompt.js --dry-run     # 只看将要推送的内容长度 / 差异
 *   node scripts/push-agent-prompt.js               # 实际推送（会创建新版本）
 *   node scripts/push-agent-prompt.js --name "未来家知识助理" --description "…"
 *   node scripts/push-agent-prompt.js --dry-run --with-external-search   # 追加「外部资料检索授权」草稿（见下）
 *   node scripts/push-agent-prompt.js --with <文件路径>                   # 追加任意一段文本
 *
 * 可选追加（默认不追加）：
 *   --with-external-search   追加 src/lib/agent/prompt-addon-external-search.md 里 `---` 之后的正文，
 *                            让助理可以去检索公开的外部资料（默认职责范围是"中心内部知识助理"，会拒绝外部问题）
 *   --with <file>            追加指定文件里 `---` 之后的正文（与上面等价，只是文件自己给）
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
const EXTERNAL_SEARCH_ADDON = path.join(PROJECT_ROOT, 'src/lib/agent/prompt-addon-external-search.md');
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
function readBody(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const marker = raw.indexOf('\n---\n');
  const body = marker >= 0 ? raw.slice(marker + 5) : raw;
  return body.trim();
}

/** 主 prompt（可选追加 addon：默认不追加，避免悄悄改变助理的职责范围） */
function readPrompt() {
  const base = readBody(PROMPT_FILE);
  const withExternal = process.argv.includes('--with-external-search');
  const withFile = arg('--with');
  const addonFile = withExternal ? EXTERNAL_SEARCH_ADDON : withFile;
  if (!addonFile) return base;
  if (!fs.existsSync(addonFile)) throw new Error(`追加文件不存在：${addonFile}`);
  const addon = readBody(addonFile);
  console.log(`已追加可选段落：${path.relative(PROJECT_ROOT, addonFile)}（+${addon.length} 字）`);
  return `${base}\n\n${addon}`;
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
