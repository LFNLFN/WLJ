/**
 * 知识库检索回归测试（src/lib/agent-tools.ts 的 searchKnowledgeBase / searchLocalKnowledge）。
 *
 * 背景（线上真实反馈）：有人在「📚 知识库」里保存了一份和王小明有关的资料，
 * 但跟智能助理对话时怎么问都拿不到 —— 短词「王小明」能查到，一旦问成一句话
 * （「王小明最近训练得怎么样」）就 0 条。
 * 原因：整句被当成了「必须命中的强检索词」，等于要求资料里原样出现这句话。
 * 本脚本就是防止它复发（修复前第 2、4 条会失败）。
 *
 * 运行：npm run test:kb-search
 */

import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
import { searchKnowledgeBase, type KnowledgeItem } from '../src/lib/agent-tools';

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
// 只测「库内检索」，关掉方舟外部检索，结果稳定且不依赖外网
process.env.ARK_API_KEY = '';
process.env.ARK_KNOWLEDGE_BASE_ID = '';

const ID_A = 'kb_test_wangxiaoming';
const ID_B = 'kb_test_course_system';

const FIXTURES = [
  {
    id: ID_A,
    title: '王小明 感统训练记录',
    category: '康复档案',
    content:
      '王小明，男，6 岁，2026 年 3 月开始在本中心接受感觉统合训练，每周两次。当前主要问题是前庭觉敏感与大运动协调不足，注意力持续时间约 8 分钟。家长反馈在家情绪较稳定。',
  },
  {
    id: ID_B,
    title: '未来家课程体系说明',
    category: '课程体系',
    content:
      '本中心课程体系分为四大板块：感觉统合训练、认知能力训练、语言沟通训练、社交游戏训练。其中认知能力训练面向 4-8 岁儿童，每周 2 次，每次 50 分钟。',
  },
];

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

async function search(q: string): Promise<KnowledgeItem[]> {
  const raw = await searchKnowledgeBase(q);
  return (JSON.parse(raw).items || []) as KnowledgeItem[];
}

/** 命中的知识库资料标题 */
function kbHits(items: KnowledgeItem[]) {
  return items.filter((i) => i.source === 'knowledge_documents').map((i) => i.title);
}

async function main() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) {
    console.log('⚠️ 未配置 DATABASE_URL，跳过（本测试需要连数据库）');
    return;
  }

  const db = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000, application_name: 'wlj-test-kb-search' });
  await db.connect();

  const cleanup = async () => {
    await db.query(`DELETE FROM knowledge_documents WHERE id = ANY($1::text[])`, [[ID_A, ID_B]]).catch(() => {});
  };

  try {
    await cleanup();
    for (const f of FIXTURES) {
      await db.query(
        `INSERT INTO knowledge_documents (id, title, category, content, filename, mimetype, size, source, "createdBy", "createdAt", "updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,'upload','test',now()::text,now()::text)`,
        [f.id, f.title, f.category, f.content, `${f.title}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 200]
      );
    }
    console.log(`已放入 ${FIXTURES.length} 份测试资料（跑完会删掉）\n`);

    console.log('== 1. 短词提问 ==');
    check('「王小明」能查到王小明的资料', kbHits(await search('王小明')).includes(FIXTURES[0].title));

    console.log('\n== 2. 整句提问（本次故障的回归点）==');
    const q2 = '王小明最近训练得怎么样';
    const r2 = kbHits(await search(q2));
    check(`「${q2}」也能查到（修复前是 0 条）`, r2.includes(FIXTURES[0].title), r2);

    const q3 = '王小明的训练情况';
    const r3 = kbHits(await search(q3));
    check(`「${q3}」也能查到`, r3.includes(FIXTURES[0].title), r3);

    const q4 = '我们机构的课程体系包括哪些课程';
    const r4 = kbHits(await search(q4));
    check(`「${q4}」能查到课程体系资料（修复前是 0 条）`, r4.includes(FIXTURES[1].title), r4);

    const q5 = '感觉统合评估的评分标准是怎么记的';
    const r5 = kbHits(await search(q5));
    check(`「${q5}」能查到场感统资料`, r5.includes(FIXTURES[0].title), r5);

    console.log('\n== 3. 检索结果结构 ==');
    const items = await search('王小明');
    check('命中项带 type/source 标记', items.some((i) => i.type === '知识库资料' && i.source === 'knowledge_documents'), items.map((i) => i.source));
    check('命中项带正文片段', items.some((i) => (i.content || '').includes('感觉统合')));

    console.log('\n== 4. 不该乱返回（精度）==');
    const noise = await search('xyzzy123 完全无关的问题');
    check('完全无关的问题返回 0 条', kbHits(noise).length === 0, noise.length);
  } finally {
    await cleanup();
    const left = (await db.query(`SELECT count(*)::int AS n FROM knowledge_documents`)).rows[0].n;
    console.log(`\n已清理测试资料（当前知识库共 ${left} 条）`);
    await db.end();
  }

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
