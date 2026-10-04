#!/usr/bin/env node
/**
 * 火山知识库（Viking KnowledgeBase）接入体检 / API 验证
 *
 * 用法：
 *   node scripts/kb-doctor.js                # 用默认查询词「知识库里有哪些资料」
 *   node scripts/kb-doctor.js "王小明"        # 指定检索词
 *
 * 它按官方 SDK（volcengine/viking_knowledgebase，v1.0.228）里的接口清单依次验证：
 *   1) GET  /ping                                     服务是否可达
 *   2) POST /api/knowledge/collection/list             列出知识库（拿到 name / resource_id）
 *   3) POST /api/knowledge/collection/search_knowledge 检索原文切片（这就是能塞进对话的内容）
 * 只读，不建/不删任何资源。
 *
 * 鉴权：知识库是**独立服务**（不是 ark.cn-beijing.volces.com），
 *   Authorization: Bearer <知识库 API Key>  —— 控制台「知识库 → API Key」里生成
 *   （官方 SDK 走 AK/SK V4 签名，service 名是 "air"；本项目只用 Bearer，服务器上省一个密钥管理）
 */

const fs = require('fs');
const path = require('path');

function loadEnvLocal() {
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
loadEnvLocal();

const HOST = (process.env.KB_API_HOST || 'https://api-knowledgebase.mlp.cn-beijing.volces.com').replace(/\/+$/, '');
const KEY = (process.env.KB_API_KEY || process.env.VIKING_KB_API_KEY || '').trim();
const NAME = (process.env.KB_COLLECTION_NAME || process.env.ARK_KNOWLEDGE_BASE_ID || '').trim();
const RESOURCE_ID = (process.env.KB_RESOURCE_ID || process.env.ARK_KNOWLEDGE_BASE_ID || '').trim();
const PROJECT = process.env.KB_PROJECT || 'default';
const QUERY = process.argv[2] || '知识库里有哪些资料';
const TIMEOUT = Number(process.env.KB_API_TIMEOUT_MS || 15000);

const mask = (k) => (k ? `${k.slice(0, 6)}…${k.slice(-4)}（长度 ${k.length}）` : '(未设置)');

async function call(pathname, body, method = 'POST') {
  const started = Date.now();
  const res = await fetch(HOST + pathname, {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(KEY ? { Authorization: `Bearer ${KEY}` } : {}) },
    ...(method === 'POST' ? { body: JSON.stringify(body || {}) } : {}),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* 保留原文 */ }
  return { status: res.status, ms: Date.now() - started, json, text };
}

/** 把服务端错误翻译成人话 */
function explain(status, json, text) {
  const msg = json && (json.message || json.error && json.error.message) || String(text).slice(0, 200);
  const code = json && (json.code || json.error && json.error.code);
  if (/invalid api key|api key miss/i.test(msg)) {
    return `${status} ${msg} → KB_API_KEY 不对：请到火山控制台「知识库 → API Key」重新生成，注意它**不是** ARK_API_KEY(ark-*)`;
  }
  if (/check sign error|ak, sk/i.test(msg)) {
    return `${status} ${msg} → 走到了 AK/SK 签名通道：说明没带上 Bearer API Key（检查 KB_API_KEY 是否为空/含空格）`;
  }
  return `${status} ${msg}${code ? `（code=${code}）` : ''}`;
}

(async () => {
  console.log('='.repeat(76));
  console.log(' 火山知识库接入体检（Viking KnowledgeBase）');
  console.log(` 时间 ${new Date().toISOString()}   目录 ${process.cwd()}`);
  console.log('='.repeat(76));

  console.log('\n[1] 配置');
  console.log(`  KB_API_HOST        : ${HOST}`);
  console.log(`  KB_API_KEY         : ${mask(KEY)}`);
  console.log(`  KB_COLLECTION_NAME : ${NAME || '(未设置，将退回 ARK_KNOWLEDGE_BASE_ID)'}`);
  console.log(`  KB_RESOURCE_ID     : ${RESOURCE_ID || '(未设置)'}`);
  console.log(`  KB_PROJECT         : ${PROJECT}`);
  console.log(`  ARK_KNOWLEDGE_BASE_ID: ${process.env.ARK_KNOWLEDGE_BASE_ID || '(未设置)'}`);
  console.log(`  检索词             : ${QUERY}`);

  // 接口清单（来自官方 SDK，仅作说明）
  console.log('\n[2] 该服务上可用的知识库接口（来自官方 SDK viking_knowledgebase）');
  for (const line of [
    'POST /api/knowledge/collection/search_knowledge   混合检索，返回原文切片 ← 本项目用这个',
    'POST /api/knowledge/collection/search             同上（可带 rerank_switch / rerank_model）',
    'POST /api/knowledge/collection/search_and_generate 检索 + 直接生成带依据的回答',
    'POST /api/knowledge/chat/completions              知识库自带对话（model + messages）',
    'POST /api/knowledge/service/rerank                重排',
    'POST /api/knowledge/doc/{add,update,delete,list,info} 文档管理（可程序化写入知识库）',
    'POST /api/knowledge/point/{add,update,delete,list,info} 切片管理',
    'POST /api/knowledge/collection/{create,update,delete,list,info} 知识库管理',
    'GET  /ping',
  ]) console.log(`  · ${line}`);

  if (!KEY) {
    console.log('\n❌ 未配置 KB_API_KEY，无法验证。');
    console.log('   获取方式：火山引擎控制台 → 方舟/知识库 → 选一个知识库 → API Key / 接入信息 → 生成 API Key，');
    console.log('   然后写进服务器环境变量（或本地 .env.local）：');
    console.log('     KB_API_KEY=<知识库 API Key>');
    console.log(`     KB_COLLECTION_NAME=${NAME || '<知识库名称>'}      # 控制台里那个知识库的名字`);
    console.log(`     KB_RESOURCE_ID=${RESOURCE_ID || '<kb-xxx>'}      # 可选，方舟里的知识库 id`);
    process.exit(1);
  }

  console.log('\n[3] GET /ping');
  try {
    const r = await call('/ping', null, 'GET');
    console.log(`  ${r.status === 200 ? '✅' : '❌'} ${r.status} (${r.ms}ms) ${r.text.slice(0, 160).replace(/\s+/g, ' ')}`);
  } catch (e) {
    console.log(`  ❌ 请求失败：${e.name}: ${e.message}`);
    process.exit(1);
  }

  console.log('\n[4] POST /api/knowledge/collection/list（用来确认知识库名 / id 该填什么）');
  let collections = [];
  {
    const r = await call('/api/knowledge/collection/list', { page_num: 1, page_size: 50, project: PROJECT });
    if (r.status === 200 && r.json) {
      collections = r.json.data?.collection_list || r.json.data?.list || r.json.data || [];
      console.log(`  ✅ ${r.status} (${r.ms}ms) 共 ${Array.isArray(collections) ? collections.length : '?'} 个知识库`);
      for (const c of (Array.isArray(collections) ? collections : []).slice(0, 10)) {
        console.log(`     - name=${c.name ?? c.collection_name ?? '?'}  resource_id=${c.resource_id ?? '?'}  docs=${c.doc_num ?? c.doc_count ?? '?'}`);
      }
    } else {
      console.log(`  ❌ ${explain(r.status, r.json, r.text)}  (${r.ms}ms)`);
    }
  }

  console.log('\n[5] POST /api/knowledge/collection/search_knowledge（真正能塞进对话的原文切片）');
  {
    const body = {
      name: NAME,
      query: QUERY,
      project: PROJECT,
      limit: 5,
      dense_weight: Number(process.env.KB_DENSE_WEIGHT ?? 0.5),
    };
    if (RESOURCE_ID) body.resource_id = RESOURCE_ID;
    const r = await call('/api/knowledge/collection/search_knowledge', body);
    if (r.status === 200 && r.json) {
      const data = r.json.data || {};
      const list = data.result_list || [];
      console.log(`  ✅ ${r.status} (${r.ms}ms) rewrite_query=${data.rewrite_query || '(无)'} 命中 ${list.length} 条`);
      list.forEach((p, i) => {
        console.log(`  —— [${i + 1}] score=${p.rerank_score ?? p.score ?? '?'}  title=${p.chunk_title || (p.doc_info && p.doc_info.doc_name) || '(无)'}`);
        console.log(`         ${String(p.content || '').replace(/\s+/g, ' ').slice(0, 160)}`);
      });
      if (!list.length) {
        console.log('  提示：0 条命中 —— 确认 KB_COLLECTION_NAME / KB_RESOURCE_ID 是否指向你要的那个知识库，或换个检索词。');
      }
      // ---------- 6) 两个知识库一览（最容易混的地方） ----------
  console.log('\n[6] 两个知识库一览');
  console.log('  ① 平台知识库（业务库 knowledge_documents）：📚 面板上方「上传」进的库，只收可抽取纯文本的文件');
  try {
    const { Client } = require('pg');
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (url) {
      const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 });
      await c.connect();
      const r = await c.query(`select count(*)::int as n, max("createdAt") as latest from knowledge_documents`);
      const rows = await c.query(`select title, category, length(content) as len from knowledge_documents order by "createdAt" desc limit 5`);
      console.log(`     total = ${r.rows[0].n}${r.rows[0].latest ? '，最近一条 ' + r.rows[0].latest : ''}`);
      for (const row of rows.rows) console.log(`     - ${row.title}（${row.category}，${row.len} 字）`);
      if (r.rows[0].n === 0) {
        console.log('     ⚠️ 0 条 = 从没成功入库。注意：**PDF 传不进这个库**（抽取器不支持 PDF，接口 400）');
        console.log('        平台库只收 txt / md / csv / tsv / json / xlsx / docx；PDF、扫描件、PPT 请传火山知识库');
      }
      await c.end();
    } else {
      console.log('     (未配置 DATABASE_URL，跳过)');
    }
  } catch (e) {
    console.log('     读取失败:', e.message);
  }

  console.log('  ② 火山知识库（方舟 Viking KnowledgeBase）：🌋 面板下方「上传到火山知识库」进的库，支持 PDF/Office');
  try {
    const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` };
    const r = await fetch(`${HOST}/api/knowledge/doc/list`, {
      method: 'POST', headers: H, signal: AbortSignal.timeout(TIMEOUT),
      body: JSON.stringify({ name: NAME, project: PROJECT, ...(RESOURCE_ID ? { resource_id: RESOURCE_ID } : {}), page_num: 1, page_size: 50 }),
    });
    const j = await r.json();
    const docs = j?.data?.doc_list || [];
    console.log(`     total = ${j?.data?.total_num ?? 0}（知识库 ${NAME}）`);
    for (const d of docs.slice(0, 5)) {
      console.log(`     - ${d.doc_name}（${d.doc_type}，来源 ${d.add_type}，${d.create_time ? new Date(d.create_time * 1000).toLocaleString('zh-CN') : '-'}）`);
    }
    if (!docs.length) console.log('     （空）可在面板「🌋 火山知识库」上传，或去火山控制台传');
  } catch (e) {
    console.log('     读取失败:', e.message);
  }

  console.log('\n== 结论 ==');
      console.log('  ✅ 直连检索可用。把下面两个变量配到服务器环境后重启，助理就会优先用这条路（快、返回原文切片）：');
      console.log('     KB_API_KEY=<知识库 API Key>');
      console.log(`     KB_COLLECTION_NAME=${NAME || '<上面的 name>'}`);
      console.log(`     KB_RESOURCE_ID=${RESOURCE_ID || '<上面的 resource_id>'}`);
    } else {
      console.log(`  ❌ ${explain(r.status, r.json, r.text)}  (${r.ms}ms)`);
      console.log(`     请求体：${JSON.stringify(body)}`);
    }
  }
  console.log('');
})().catch((e) => { console.error('体检脚本异常：', e); process.exit(1); });
