#!/usr/bin/env node
/**
 * 部署后一键验收（在服务器上跑：`npm run deploy:verify`）
 *
 * 把这几轮加的能力逐条验一遍，输出 PASS / FAIL / WARN，最后给结论：
 *   1. 环境变量（DATABASE_URL / KB_API_KEY / KB_COLLECTION_NAME / PUBLIC_BASE_URL）
 *   2. 数据库连通 + 关键表是否存在（users / knowledge_documents / students …）
 *   3. 火山知识库：ping → collection/list → doc/list → search_knowledge（KB_API_KEY 直连那条路）
 *   4. 公网中转目录 /generated/：写个临时文件，从外部地址拉一次，验证火山知识库抓得到
 *      （本机跑这条会 WARN，属正常；在服务器上跑才准）
 *   5. 平台知识库：knowledge_documents 条数（0 条时给出"PDF/该怎么传"的提示）
 *
 * 只读为主：唯一的写入是第 4 步那个临时文件（跑完即删）和数据库里的一条自检记录（也会删）。
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PROJECT_ROOT = path.join(__dirname, '..');
const GENERATED_DIR = path.join(PROJECT_ROOT, 'public', 'generated');

function loadEnv() {
  const file = path.join(PROJECT_ROOT, '.env.local');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '');
  }
}
loadEnv();

const args = process.argv.slice(2);
const argOf = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const KB_HOST = (process.env.KB_API_HOST || 'https://api-knowledgebase.mlp.cn-beijing.volces.com').replace(/\/+$/, '');
const KB_KEY = (process.env.KB_API_KEY || process.env.VIKING_KB_API_KEY || '').trim();
const KB_NAME = (process.env.KB_COLLECTION_NAME || process.env.ARK_KNOWLEDGE_BASE_ID || '').trim();
const KB_RESOURCE = (process.env.KB_RESOURCE_ID || process.env.ARK_KNOWLEDGE_BASE_ID || '').trim();
const BASE_URL = (argOf('--base') || process.env.PUBLIC_BASE_URL || 'https://www.weilaijia20210101.com').replace(/\/+$/, '');

const results = [];
const record = (level, name, detail) => {
  results.push({ level, name, detail });
  const icon = level === 'PASS' ? '✅' : level === 'WARN' ? '⚠️ ' : '❌';
  console.log(`${icon} ${name}${detail ? `\n      ${detail}` : ''}`);
};
const mask = (v) => (v ? `${String(v).slice(0, 6)}…（长度 ${String(v).length}）` : '(未设置)');

async function kbCall(p, body) {
  const res = await fetch(`${KB_HOST}${p}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KB_KEY}` },
    body: JSON.stringify({ name: KB_NAME, project: process.env.KB_PROJECT || 'default', ...(KB_RESOURCE ? { resource_id: KB_RESOURCE } : {}), ...body }),
    signal: AbortSignal.timeout(20000),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

(async () => {
  console.log('='.repeat(78));
  console.log(' WLJ 部署后验收   目录:', PROJECT_ROOT);
  console.log(` 时间 ${new Date().toISOString()}   公网地址 ${BASE_URL}`);
  console.log('='.repeat(78));

  // ---------- 1. 环境变量 ----------
  console.log('\n[1] 环境变量');
  record(process.env.DATABASE_URL ? 'PASS' : 'FAIL', 'DATABASE_URL', mask(process.env.DATABASE_URL));
  record(KB_KEY ? 'PASS' : 'FAIL', 'KB_API_KEY（火山知识库直连）', mask(KB_KEY));
  record(KB_NAME ? 'PASS' : 'FAIL', 'KB_COLLECTION_NAME（如 WLJ）', KB_NAME || '(未设置，将退回 ARK_KNOWLEDGE_BASE_ID)');
  record(process.env.PUBLIC_BASE_URL ? 'PASS' : 'WARN', 'PUBLIC_BASE_URL', process.env.PUBLIC_BASE_URL || '(未设置 → 上传知识库时用请求 origin)');

  // ---------- 2. 数据库 ----------
  console.log('\n[2] 数据库');
  let db = null;
  try {
    const { Client } = require(path.join(PROJECT_ROOT, 'node_modules', 'pg'));
    db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000, application_name: 'wlj-deploy-verify' });
    await db.connect();
    const t0 = Date.now();
    await db.query('select 1');
    record('PASS', `连接成功（${Date.now() - t0}ms）`);
    const tables = ['users', 'students', 'teachers', 'courses', 'class_records', 'scale_templates', 'student_scale_records', 'knowledge_documents'];
    const found = (await db.query(`select table_name from information_schema.tables where table_schema='public'`)).rows.map((r) => r.table_name);
    const missing = tables.filter((t) => !found.includes(t));
    record(missing.length ? 'WARN' : 'PASS', '关键表存在', missing.length ? `缺：${missing.join(', ')}（用到时会幂等建表）` : `${tables.length} 张表都在`);
  } catch (err) {
    record('FAIL', '数据库连接失败', err.message);
  }

  // ---------- 3. 火山知识库 ----------
  console.log('\n[3] 火山知识库（KB_API_KEY 直连）');
  if (!KB_KEY) {
    record('WARN', '跳过：未配置 KB_API_KEY', '控制台「知识库 → API Key」生成后写入服务器环境变量');
  } else {
    try {
      const ping = await fetch(`${KB_HOST}/ping`, { headers: { Authorization: `Bearer ${KB_KEY}` }, signal: AbortSignal.timeout(10000) });
      record(ping.ok ? 'PASS' : 'FAIL', `ping（HTTP ${ping.status}）`);

      const list = await kbCall('/api/knowledge/collection/list', { page_num: 1, page_size: 50 });
      const cols = list.json?.data?.collection_list || [];
      record(list.status === 200 ? 'PASS' : 'FAIL', `collection/list → ${cols.length} 个知识库`,
        cols.map((c) => `${c.collection_name}(${c.doc_num ?? '?'} 篇)`).join(', '));

      const docs = await kbCall('/api/knowledge/doc/list', { page_num: 1, page_size: 50 });
      const items = docs.json?.data?.doc_list || [];
      record(docs.status === 200 ? 'PASS' : 'FAIL', `doc/list → ${docs.json?.data?.total_num ?? 0} 份文档`,
        items.slice(0, 5).map((d) => `${d.doc_name}(${d.doc_type})`).join(', '));

      const search = await kbCall('/api/knowledge/collection/search_knowledge', { query: '王小明', limit: 3, dense_weight: 0.5 });
      const hits = search.json?.data?.result_list || [];
      record(search.status === 200 && hits.length > 0 ? 'PASS' : 'FAIL', `search_knowledge("王小明") → ${hits.length} 条切片`,
        hits[0] ? String(hits[0].content || '').replace(/\s+/g, ' ').slice(0, 80) : '（无命中，检查 KB_COLLECTION_NAME / KB_RESOURCE_ID）');
    } catch (err) {
      record('FAIL', '火山知识库请求异常', err.message);
    }
  }

  // ---------- 4. 公网中转目录 ----------
  console.log('\n[4] /generated/ 公网可访问性（火山知识库抓取上传文件的前提）');
  const probeName = `deploy-verify-${crypto.randomBytes(4).toString('hex')}.txt`;
  const probePath = path.join(GENERATED_DIR, probeName);
  try {
    fs.mkdirSync(GENERATED_DIR, { recursive: true });
    fs.writeFileSync(probePath, `wlj deploy verify ${new Date().toISOString()}\n`);
    const url = `${BASE_URL}/generated/${probeName}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const text = await res.text().catch(() => '');
    const ok = res.status === 200 && text.includes('wlj deploy verify');
    record(ok ? 'PASS' : 'WARN', `拉取 ${url} → HTTP ${res.status}`,
      ok ? '内容一致，知识库能抓到' : '若在开发机跑属正常（本地文件不在公网）；在服务器上跑仍失败，请检查 Nginx/静态目录与 PUBLIC_BASE_URL');
  } catch (err) {
    record('WARN', '公网拉取失败', `${err.message}（在服务器上跑才有意义）`);
  } finally {
    fs.unlink(probePath, () => {});
  }

  // ---------- 5. 平台知识库 ----------
  console.log('\n[5] 平台知识库（业务库 knowledge_documents）');
  if (db) {
    try {
      const r = await db.query(`select count(*)::int as n from knowledge_documents`);
      const n = r.rows[0].n;
      record(n > 0 ? 'PASS' : 'WARN', `knowledge_documents → ${n} 条`,
        n > 0 ? '问答可直接检索到这些资料' : '0 条 = 还没成功上传过。可传 txt/md/csv/xlsx/docx/PDF（有文字层）；扫描件请传火山知识库');
    } catch (err) {
      record('WARN', '读取失败', err.message);
    }
    await db.end().catch(() => {});
  }

  // ---------- 结论 ----------
  const fail = results.filter((r) => r.level === 'FAIL');
  const warn = results.filter((r) => r.level === 'WARN');
  console.log('\n' + '='.repeat(78));
  console.log(` 结论：PASS ${results.length - fail.length - warn.length} ｜ WARN ${warn.length} ｜ FAIL ${fail.length}`);
  if (fail.length) console.log(` 需要处理：${fail.map((r) => r.name).join('；')}`);
  console.log('='.repeat(78));
  if (fail.length) process.exit(1);
})().catch((e) => {
  console.error('验收脚本异常：', e);
  process.exit(1);
});
