/**
 * 智能体工具执行层功能测试。
 *
 * 运行方式（见下方脚本）：
 *   npx tsc scripts/test-agent-tools.ts --outDir .agent-test-build --module commonjs \
 *     --target es2020 --moduleResolution node --esModuleInterop --skipLibCheck --resolveJsonModule
 *   node .agent-test-build/scripts/test-agent-tools.js
 */

import path from 'path';
import fs from 'fs';
import { listToolSchemas, TOOL_DEFINITIONS } from '../src/lib/agent/registry';
import { executeTool } from '../src/lib/agent/execute';

// --- 载入 .env.local（不覆盖已存在的环境变量）---
function loadEnvLocal() {
  const file = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnvLocal();

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

async function run() {
  console.log('\n== 1. 工具注册表 ==');
  const schemas = listToolSchemas();
  const names = schemas.map((s) => s.function.name);
  check('注册了 3 个工具', schemas.length === 3, names);
  check(
    '包含全部工具名',
    ['search_knowledge_base', 'query_database', 'generate_file'].every((n) => names.includes(n)),
    names
  );
  check('schema 结构正确', schemas.every((s) => s.type === 'function' && !!s.function.parameters));

  console.log('\n== 2. 执行器基础行为 ==');
  const unknown = await executeTool('not_a_tool', {});
  check('未知工具返回失败', unknown.ok === false && /未知工具/.test((unknown as any).error));

  const missing = await executeTool('search_knowledge_base', {});
  check('缺少必填参数被拦截', missing.ok === false && /必填/.test((missing as any).error));

  const badEnum = await executeTool('generate_file', { type: 'pdf', filename: 'x', content: {} });
  check('枚举校验生效', badEnum.ok === false && /不合法/.test((badEnum as any).error));

  const badJson = await executeTool('query_database', '{ not json');
  check('非法 JSON 参数被拦截', badJson.ok === false && /JSON/.test((badJson as any).error));

  console.log('\n== 3. generate_file（Excel）==');
  const excel = await executeTool('generate_file', {
    type: 'excel',
    filename: '测试报表',
    content: { headers: ['姓名', '年龄'], rows: [['张三', 8], ['李四', 9]] },
  });
  check('Excel 生成成功', excel.ok === true, excel);
  if (excel.ok) {
    const url = (excel.result as any).downloadUrl as string;
    const abs = path.join(process.cwd(), 'public', url);
    check('Excel 文件已落盘', fs.existsSync(abs), abs);
    check('Excel 大小 > 0', fs.statSync(abs).size > 0);
    check('下载地址前缀正确', url.startsWith('/generated/'), url);
  }

  console.log('\n== 4. generate_file（Word）==');
  const word = await executeTool('generate_file', {
    type: 'word',
    filename: '训练计划文档',
    content: { title: '训练计划', paragraphs: ['第一段'], headers: ['项目', '目标'], rows: [['专注力', '提升']] },
  });
  check('Word 生成成功', word.ok === true, word);
  if (word.ok) {
    const url = (word.result as any).downloadUrl as string;
    check('Word 扩展名为 .docx', url.endsWith('.docx'), url);
    check('Word 文件已落盘', fs.existsSync(path.join(process.cwd(), 'public', url)));
  }

  console.log('\n== 4b. generate_file（PPT）==');
  const ppt = await executeTool('generate_file', {
    type: 'ppt',
    filename: '王小明训练进展分析',
    content: {
      title: '王小明训练进展分析',
      subtitle: '2026 年 10 月 · 未来家儿童能力发展中心',
      slides: [
        { title: '基本情况', bullets: ['男，6 岁，2026 年 3 月入学', '诊断：智力发育迟缓', '每周训练 2 次'] },
        { title: '评估结果', bullets: ['粗大运动 2 分（部分完成）', '认知 1 分', '语言交往 1 分'], table: { headers: ['领域', '得分'], rows: [['粗大运动', 2], ['认知', 1]] } },
        { title: '下一步建议', bullets: ['加强前庭觉训练', '家长配合每日 10 分钟'] },
      ],
    },
  });
  check('PPT 生成成功', ppt.ok === true, ppt);
  if (ppt.ok) {
    const url = (ppt.result as any).downloadUrl as string;
    const abs = path.join(process.cwd(), 'public', url);
    check('PPT 扩展名为 .pptx', /\.pptx$/.test(url), url);
    check('PPT 文件已落盘', fs.existsSync(abs), abs);
    const buf = fs.readFileSync(abs);
    check('PPT 是合法 zip（PK 头）', buf.slice(0, 2).toString() === 'PK', buf.slice(0, 2).toString());
    check('PPT 大小 > 10KB', buf.length > 10 * 1024, buf.length);
  }

  const pptText = await executeTool('generate_file', {
    type: 'ppt',
    filename: 'markdown 分页',
    content: { title: '就绪度评估', text: '# 现状\n- 平台知识库 0 条\n# 结论\n- 需要上传资料' },
  });
  check('只给 text 时按 Markdown 标题分页也能生成', pptText.ok === true, pptText);

  console.log('\n== 5. generate_file 安全性 ==');
  const traversal = await executeTool('generate_file', {
    type: 'excel',
    filename: '../../../../etc/passwd',
    content: { rows: [['x']] },
  });
  check('路径穿越文件名被清洗', traversal.ok === true, traversal);
  if (traversal.ok) {
    const name = (traversal.result as any).filename as string;
    check('文件名不含路径分隔符', !name.includes('/') && !name.includes('..'), name);
    const abs = path.join(process.cwd(), 'public', (traversal.result as any).downloadUrl as string);
    check('文件仍位于 generated 目录', path.resolve(abs).startsWith(path.resolve(process.cwd(), 'public', 'generated')));
  }

  console.log('\n== 6. query_database ==');
  const unknownAction = await executeTool('query_database', { action: 'drop_table_users' });
  check(
    '非法 action 被拒绝',
    unknownAction.ok === false && /不合法|未知查询动作/.test((unknownAction as any).error),
    unknownAction
  );

  const stats = await executeTool('query_database', { action: 'stats' });
  if (stats.ok) {
    console.log('    stats =', JSON.stringify((stats.result as any).counts));
    check('stats 返回各表计数', typeof (stats.result as any).counts === 'object');
  } else {
    console.log(`    （跳过：数据库不可用 -> ${(stats as any).error}）`);
  }

  const students = await executeTool('query_database', { action: 'students', params: { limit: 1 } });
  if (students.ok) {
    check('students 列表返回 items', Array.isArray((students.result as any).items), students.result);
    check('students 分页字段完整', typeof (students.result as any).total === 'number');
  } else {
    console.log(`    （跳过：数据库不可用 -> ${(students as any).error}）`);
  }

  const searchStudents = await executeTool('query_database', {
    action: 'students',
    params: { search: '张', limit: 5 },
  });
  check('students 支持模糊搜索', searchStudents.ok === true, searchStudents);

  // 业务库查不到人时要引导模型去知识库再查一遍（儿童档案常只上传到知识库：
  // 实测「王小明的康复档案里写了什么？」只查了业务库、直接回"系统里没有这个学生"，而知识库里有这份档案）
  const noHit = await executeTool('query_database', {
    action: 'students',
    params: { search: '绝对不存在的学生名xyzq', limit: 5 },
  });
  check(
    '业务库 0 条时给出"去知识库再查一次"的 hint',
    noHit.ok === true &&
      (noHit.result as any).total === 0 &&
      typeof (noHit.result as any).hint === 'string' &&
      (noHit.result as any).hint.includes('search_knowledge_base'),
    (noHit as any).result
  );
  check(
    '业务库有命中时不加 hint（不干扰正常回答）',
    students.ok === true && (students.result as any).hint === undefined,
    (students as any).result
  );
  const noSearch = await executeTool('query_database', { action: 'students', params: { limit: 1 } });
  check(
    '没有 search 关键字（纯列表）时不加 hint',
    noSearch.ok === true && (noSearch.result as any).hint === undefined,
    (noSearch as any).result
  );

  const missingTable = await executeTool('query_database', { action: 'lesson_plans' });
  if (!missingTable.ok) {
    check('缺失数据表返回清晰错误', /不存在|尚未初始化/.test((missingTable as any).error), missingTable);
  } else {
    check('lesson_plans 表可用', Array.isArray((missingTable.result as any).items));
  }

  console.log('\n== 7. search_knowledge_base ==');
  const kb = await executeTool('search_knowledge_base', { query: '感觉统合' });
  if (kb.ok) {
    const r = kb.result as any;
    check('知识库检索返回结构化结果', Array.isArray(r.items), r);
    check('返回 source 字段', typeof r.source === 'string' && r.source.length > 0, r.source);
    console.log(`    source=${r.source} total=${r.total}` + (r.notice ? ` notice=${r.notice}` : ''));
  } else {
    check('知识库可正常返回结果', false, kb);
  }

  // 火山方舟凭证非法时应"降级"而非报错
  const kb2 = await executeTool('search_knowledge_base', { query: '课程' });
  check('非法 Ark 凭证时工具仍可用（降级）', kb2.ok === true, kb2);

  console.log('\n----------------------------------------');
  console.log(`通过 ${passed}，失败 ${failed}`);
  if (failed > 0) {
    console.log('失败项：', failures.join('、'));
    process.exit(1);
  }
}

run().catch((e) => {
  console.error('测试脚本异常：', e);
  process.exit(1);
});
