/**
 * 火山知识库「直连检索」接线测试（不需要真实 key，用本地 mock 冒充知识库服务）。
 *
 * 验证 src/lib/agent-tools.ts 里 searchViaKnowledgeApi：
 *   - 请求打到 /api/knowledge/collection/search_knowledge，且带 `Authorization: Bearer <KB_API_KEY>`；
 *   - 请求体带 name / resource_id / query / project / limit；
 *   - data.result_list 能正确映射成 KnowledgeItem（source=ark-kb，带 score）；
 *   - KB_API_KEY 配了但服务返回错误时，会降级到托管智能体那条路，并把两条原因都带在 notice 里；
 *   - getAgentConfigStatus().knowledgeBaseMode 变为 'kb-api'，页面配置面板能显示出来。
 *
 * 运行：npm run test:kb-api
 */

import fs from 'fs';
import path from 'path';
import http from 'http';
import { AddressInfo } from 'net';
import { searchKnowledgeBase, getAgentConfigStatus, type KnowledgeItem } from '../src/lib/agent-tools';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  ✗ ${name}${detail !== undefined ? ` -> ${JSON.stringify(detail)}` : ''}`);
  }
}

// 库内检索那部分需要 DATABASE_URL（本测试只关心知识库那一段，但 searchKnowledgeBase 会一起跑）
function loadEnvLocal() {
  const file = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
}
loadEnvLocal();

interface Captured {
  authorization?: string;
  body?: any;
}

function startMock(handler: (captured: Captured) => { status: number; payload: any }) {
  const captured: Captured = {};
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      captured.authorization = req.headers.authorization;
      captured.body = raw ? JSON.parse(raw) : {};
      const { status, payload } = handler(captured);
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    });
  });
  return new Promise<{ url: string; captured: Captured; close: () => Promise<void> }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        captured,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

/** 冒充方舟「托管智能体」：POST 消息、GET 事件（轮询）、GET /events/stream（SSE），并记录命中情况 */
function startArkMock(onCreateSession: () => void) {
  const state = { posts: 0, gets: 0, streamHits: 0, posted: [] as any[], getUrls: [] as string[] };

  /** 本轮的事件序列（与实测的 SSE 帧一致：tool_result 里包着知识库检索结果） */
  const turnEvents = [
    {
      id: 'sevt-tool',
      type: 'agent.tool_result',
      content: [
        {
          type: 'text',
          text:
            'exit_code: 0 --- stdout --- ' +
            JSON.stringify({
              ok: true,
              data: {
                result_list: [
                  {
                    id: '415467-_sys_auto_gen_doc_id-16716496736846251352-0',
                    content: '档案编号：WLJ-2024-0001\n广州市智障幼儿康复训练档案（试用版）\n儿童姓名：王小明',
                  },
                ],
              },
            }),
        },
      ],
    },
    { id: 'sevt-msg', type: 'agent.message', content: [{ type: 'text', text: '根据知识库：王小明，档案编号 WLJ-2024-0001。' }] },
    { id: 'sevt-idle', type: 'session.status_idle', content: [] },
  ];

  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : {};
      const url = req.url || '';
      const isEvents = url.indexOf('/events') >= 0;

      // ---- SSE 流 ----
      if (isEvents && url.indexOf('/stream') >= 0 && req.method === 'GET') {
        state.streamHits++;
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
        res.write(': ready\n\n');
        for (const e of turnEvents) res.write(`data: ${JSON.stringify(e)}\n\n`);
        res.end();
        return;
      }

      res.setHeader('content-type', 'application/json');
      if (req.method === 'POST' && url === '/api/v3/sessions') {
        onCreateSession();
        return res.end(JSON.stringify({ id: 'sesn-temp-created' }));
      }
      if (isEvents && req.method === 'POST') {
        state.posts++;
        state.posted.push(body);
        return res.end(JSON.stringify({ ok: true }));
      }
      if (isEvents && req.method === 'GET') {
        state.gets++;
        state.getUrls.push(url);
        if (state.gets === 1) {
          // 轮询兜底路径的基线快照
          return res.end(JSON.stringify({ data: [{ id: 'sevt-old', type: 'agent.message', content: [{ type: 'text', text: '历史回答' }] }] }));
        }
        return res.end(JSON.stringify({ data: turnEvents }));
      }
      res.statusCode = 404;
      res.end('{}');
    });
  });

  return new Promise<{
    url: string;
    posted: any[];
    eventGets: number;
    streamHits: number;
    getUrls: string[];
    close: () => Promise<void>;
  }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}/api/v3`,
        posted: state.posted,
        get eventGets() {
          return state.gets;
        },
        get streamHits() {
          return state.streamHits;
        },
        getUrls: state.getUrls,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

async function main() {
  // 只测知识库这条路：把方舟托管智能体关掉，避免真去调外网（慢）
  process.env.ARK_API_KEY = '';
  process.env.ARK_AGENT_ID = '';
  process.env.ARK_ENVIRONMENT_ID = '';
  process.env.ARK_VAULT_ID = '';
  process.env.KB_API_KEY = 'kb-api-key-for-test';
  process.env.KB_COLLECTION_NAME = 'wlj-kb';
  process.env.KB_RESOURCE_ID = 'kb-test-1234';
  process.env.KB_PROJECT = 'default';

  console.log('== 1. 正常返回：原文切片能映射进对话上下文 ==');
  const ok = await startMock(() => ({
    status: 200,
    payload: {
      code: 0,
      data: {
        rewrite_query: '王小明 训练',
        result_list: [
          {
            point_id: 'pt_1',
            chunk_id: 'ck_1',
            chunk_title: '王小明 感统训练记录',
            content: '王小明，男，6 岁，2026 年 3 月开始在本中心接受感觉统合训练，每周两次。',
            score: 0.71,
            rerank_score: 0.93,
          },
        ],
      },
    },
  }));
  process.env.KB_API_HOST = ok.url;

  const raw = await searchKnowledgeBase('王小明最近训练得怎么样');
  const data = JSON.parse(raw);
  const kb = (data.items as KnowledgeItem[]).filter((i) => i.source === 'ark-kb');

  check('source 标记为 local+ark', data.source === 'local+ark', data.source);
  check('拿到知识库原文切片', kb.length === 1 && kb[0].type === '火山知识库', kb);
  check('标题与正文映射正确', kb[0]?.title === '王小明 感统训练记录' && /感觉统合训练/.test(kb[0]?.content || ''), kb[0]);
  check('带上相关性分（优先用 rerank_score）', kb[0]?.score === 0.93, kb[0]?.score);
  check('请求带 Authorization: Bearer <KB_API_KEY>', ok.captured.authorization === 'Bearer kb-api-key-for-test', ok.captured.authorization);
  check('请求体带 name / resource_id / query / project', 
    ok.captured.body?.name === 'wlj-kb' && ok.captured.body?.resource_id === 'kb-test-1234' &&
    ok.captured.body?.query === '王小明最近训练得怎么样' && ok.captured.body?.project === 'default',
    ok.captured.body);
  check('配置面板能识别直连模式', getAgentConfigStatus().knowledgeBaseMode === 'kb-api', getAgentConfigStatus().knowledgeBaseMode);
  await ok.close();

  console.log('\n== 2. key 不对：降级但如实报告原因 ==');
  const bad = await startMock(() => ({ status: 400, payload: { code: 1000001, message: 'invalid api key' } }));
  process.env.KB_API_HOST = bad.url;

  const badData = JSON.parse(await searchKnowledgeBase('王小明'));
  check('直连失败时不再装作查到了', (badData.items || []).every((i: KnowledgeItem) => i.source !== 'ark-kb'), badData.items);
  check('notice 里带上知识库侧的原因', /知识库检索失败\(400\)/.test(badData.notice || ''), badData.notice);
  check('notice 里也带上「方舟那条路为何没兜住」', /未配置 ARK_API_KEY/.test(badData.notice || ''), badData.notice);
  await bad.close();

  console.log('\n== 3. 未配置 KB_API_KEY：不该去打扰外部服务 ==');
  delete process.env.KB_API_KEY;
  delete process.env.VIKING_KB_API_KEY;
  const none = JSON.parse(await searchKnowledgeBase('王小明'));
  check('未配置时 knowledgeBaseMode 不再是 kb-api', getAgentConfigStatus().knowledgeBaseMode !== 'kb-api', getAgentConfigStatus().knowledgeBaseMode);
  check('未配置时不会有 ark-kb 结果', (none.items || []).every((i: KnowledgeItem) => i.source !== 'ark-kb'), none.items);

  console.log('\n== 4. 托管智能体会话流（按你给的 session 调用方式）==');
  // 完全按实测的事件流结构：agent.tool_result 里包着 search_knowledge 的响应体
  const ARK_KEY = ['ark', '12345678-1234-1234-1234-123456789012', 'abcde'].join('-');
  let createdSession = false;
  const ark = await startArkMock(() => {
    createdSession = true;
  });
  process.env.ARK_API_KEY = ARK_KEY;
  process.env.ARK_BASE_URL = ark.url;
  process.env.ARK_AGENT_ID = 'agent-future-home-kb';
  process.env.ARK_ENVIRONMENT_ID = 'env-should-be-ignored';
  process.env.ARK_VAULT_ID = 'vlt-should-be-ignored';
  process.env.ARK_SESSION_ID = 'sesn-20261004055646-hqst3';
  process.env.ARK_AGENT_TIMEOUT_MS = '20000';
  delete process.env.KB_API_KEY;

  const sessRaw = JSON.parse(await searchKnowledgeBase('王小明的康复档案里有哪些信息？'));
  const items4 = sessRaw.items as KnowledgeItem[];
  check('显式 ARK_SESSION_ID 优先：没有再去新建会话', createdSession === false, { createdSession });
  check('向指定 session 发了 user.message', ark.posted.length > 0 && /王小明/.test(JSON.stringify(ark.posted)), ark.posted);
  check('默认用 SSE 事件流监控（/events/stream），不再每 3 秒轮询', ark.streamHits === 1 && ark.eventGets === 0, { stream: ark.streamHits, polls: ark.eventGets });
  check('从 agent.tool_result 抽出了知识库原文切片', items4.some((i) => i.source === 'ark-kb' && /WLJ-2024-0001/.test(i.content || '')), items4.map((i) => i.source));
  check('同时保留智能体的最终回答', items4.some((i) => i.source === 'ark-agent'), items4.map((i) => i.source));
  check('切片排在同一条结果里靠前的位置（便于模型引用原文）', items4[0]?.source === 'ark-kb', items4.map((i) => i.source));
  await ark.close();

  delete process.env.ARK_SESSION_ID;

  console.log('\n== 4b. SSE 不可用时退回轮询（仍然必须带 ?limit=）==');
  const arkPoll = await startArkMock(() => {});
  process.env.ARK_BASE_URL = arkPoll.url;
  process.env.ARK_SESSION_STREAM = '0';
  const pollRaw = JSON.parse(await searchKnowledgeBase('王小明的档案编号'));
  const pollItems = pollRaw.items as KnowledgeItem[];
  check('关掉 SSE 时能靠轮询拿到结果', pollItems.some((i) => i.source === 'ark-kb') && pollItems.some((i) => i.source === 'ark-agent'), pollItems.map((i) => i.source));
  check('轮询的 GET 必须带 ?limit=（默认 50 会把新事件挡在窗口外）', arkPoll.getUrls.length > 0 && arkPoll.getUrls.every((u) => /limit=\d+/.test(u)), arkPoll.getUrls);
  check('轮询路径不碰 SSE 接口', arkPoll.streamHits === 0, arkPoll.streamHits);
  await arkPoll.close();
  delete process.env.ARK_SESSION_STREAM;

  console.log('\n== 5. 知识库限流（429）：退避重试一次；仍失败则快速失败，不去拖 30 秒的托管智能体 ==');
  process.env.KB_API_KEY = 'kb-api-key-for-test';
  process.env.KB_COLLECTION_NAME = 'WLJ';
  process.env.KB_API_RESET_MS = '';
  process.env.ARK_API_KEY = ['ark', '12345678-1234-1234-1234-123456789012', 'abcde'].join('-');
  process.env.ARK_AGENT_ID = 'agent-future-home-kb';
  process.env.ARK_SESSION_ID = 'sesn-20261004055646-hqst3';

  let hits = 0;
  const flaky = await startMock(() => {
    hits++;
    if (hits === 1) return { status: 429, payload: { code: 1000001, message: 'request limit exceeded' } };
    return { status: 200, payload: { code: 0, data: { result_list: [{ id: 'pt_retry', content: '重试成功的切片' }] } } };
  });
  process.env.KB_API_HOST = flaky.url;
  const retried = JSON.parse(await searchKnowledgeBase('王小明'));
  check('第一次 429 会自动退避重试并成功', hits === 2 && (retried.items || []).some((i: KnowledgeItem) => i.id === 'pt_retry'), { hits, items: retried.items });
  await flaky.close();

  let alwaysHits = 0;
  const always429 = await startMock(() => {
    alwaysHits++;
    return { status: 429, payload: { code: 1000001, message: 'request limit exceeded' } };
  });
  const ark2 = await startArkMock(() => {});
  process.env.KB_API_HOST = always429.url;
  process.env.ARK_BASE_URL = ark2.url;
  const throttled = JSON.parse(await searchKnowledgeBase('王小明'));
  check('一直 429 时如实报限流（notice 带 429）', /知识库检索失败\(429\)/.test(throttled.notice || ''), throttled.notice);
  check('限流时不会再去调托管智能体（省掉几十秒的无谓等待）', ark2.posted.length === 0 && alwaysHits >= 1, { posted: ark2.posted.length, alwaysHits });
  await always429.close();
  await ark2.close();

  delete process.env.ARK_SESSION_ID;
  delete process.env.ARK_API_KEY;

  console.log('\n----------------------------------------');
  console.log(`通过 ${passed}，失败 ${failed}`);
  if (failed > 0) {
    console.log('失败项：', failures.join('、'));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('测试脚本异常：', e);
  process.exit(1);
});
