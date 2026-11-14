#!/usr/bin/env node
/**
 * 从微信小程序题库生成 PC 端的只读题库副本。
 *
 * 用途：评估记录详情页需要显示「题目原文 + 全部选项（A-总是 / B-经常）」，
 * 而 PC 端没有小程序的题库；这里把小程序 `utils/*-data.js` 里的题目/选项
 * 统一导出成 src/lib/scale-question-bank.json。
 *
 * 用法：
 *   npm run bank:sync
 *   SENSORY_APP_DIR=/path/to/sensory-integration-app npm run bank:sync
 *
 * 注意：小程序新增/修改量表后需要重新执行一次并提交 JSON。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const appDir = process.env.SENSORY_APP_DIR || path.join(os.homedir(), 'Desktop', 'sensory-integration-app');
const outFile = path.join(__dirname, '..', 'src', 'lib', 'scale-question-bank.json');

if (!fs.existsSync(path.join(appDir, 'utils'))) {
  console.error(`找不到小程序题库目录：${path.join(appDir, 'utils')}`);
  process.exit(1);
}

const bank = {};
function init(id, title) {
  bank[id] = { title, items: {} };
}
function add(id, key, item) {
  if (key === undefined || key === null || key === '') return;
  bank[id].items[String(key)] = item;
}
function opts(arr) {
  return (arr || []).map((o) => (typeof o === 'string'
    ? { value: o, label: o }
    : {
        value: String(o.value !== undefined ? o.value : o.label),
        label: String(o.label !== undefined ? o.label : o.value),
      }));
}

// 1) sections[].items[] 结构
[
  ['sensory-4-5', 'sensory-4-5-data'],
  ['attention-sensory-3-4', 'attention-sensory-3-4-data'],
  ['attention-eval', 'attention-eval-data'],
].forEach(([scale, file]) => {
  const m = require(path.join(appDir, 'utils', file));
  init(scale, m.scale_info.title);
  (m.sections || []).forEach((sec) => (sec.items || []).forEach((it) => {
    add(scale, it.id, { text: it.text, section: sec.title, options: opts(it.options) });
  }));
});

// 2) 感觉统合评估量表：categories[].sections[].questions[]，固定 是/否
{
  const m = require(path.join(appDir, 'utils', 'sensory-general-data'));
  init('sensory-general', m.scale_info.title);
  (m.categories || []).forEach((cat) => (cat.sections || []).forEach((sec) => (sec.questions || []).forEach((q) => {
    add('sensory-general', q.id, {
      text: q.text,
      section: cat.title + (sec.label ? ' / ' + sec.label : ''),
      options: [{ value: '是', label: '是' }, { value: '否', label: '否' }],
    });
  })));
}

// 3) 自闭症：section.options 为共享选项，个别题目自带 options
{
  const m = require(path.join(appDir, 'utils', 'autism-data'));
  init('autism', m.scale_info.title);
  (m.sections || []).forEach((sec) => {
    (sec.items || []).forEach((it) => {
      const list = it.options && it.options.length ? it.options : sec.options;
      add('autism', it.id, { text: it.text, section: sec.title, options: opts(list) });
    });
    (sec.text_fields || []).forEach((tf) => {
      add('autism', tf.id, { text: tf.label, section: sec.title, options: [] });
    });
  });
}

// 4) 6-12 岁注意力：options 是对象 {A:'...',B:'...'}
{
  const m = require(path.join(appDir, 'utils', 'attention-data'));
  init('attention', m.scale_info.title);
  (m.questions || []).forEach((q) => {
    add('attention', q.id, {
      text: q.text,
      section: '',
      options: Object.keys(q.options || {}).map((k) => ({ value: k, label: q.options[k] })),
    });
  });
}

// 5) 4-6 岁注意力：questions[].options 数组
{
  const m = require(path.join(appDir, 'utils', 'attention-4-6-data'));
  init('attention-4-6', m.scale_info.title);
  (m.questions || []).forEach((q) => {
    add('attention-4-6', q.id, { text: q.text, section: '', options: opts(q.options) });
  });
}

// 6) MCH-FS 喂养问卷
{
  const m = require(path.join(appDir, 'utils', 'mch-fs-data'));
  init('mch-fs', m.scale_info.title);
  const p1 = m.part1 || {};
  ['disease_history', 'feeder_identity'].forEach((k) => {
    const it = p1[k];
    if (it && it.field) add('mch-fs', it.field, { text: it.label, section: '基础信息', options: opts(it.options) });
  });
  (p1.behaviors || []).forEach((it) => {
    add('mch-fs', it.field || it.id, { text: it.text, section: '行为调查', options: opts(it.options) });
  });
  ['diet_6m', 'diet_12m'].forEach((k) => {
    const group = p1[k];
    if (!group) return;
    (group.items || []).forEach((it) => {
      add('mch-fs', it.field || it.id, { text: it.text, section: group.label || '饮食结构', options: opts(it.options) });
    });
  });
  (m.part2_questions || []).forEach((q) => {
    add('mch-fs', q.id, {
      text: q.text,
      section: '核心评分量表（1 最好 / 7 最差）',
      options: [1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: String(n), label: String(n) })),
    });
  });
}

// 7) 口腔运动
{
  const m = require(path.join(appDir, 'utils', 'oral-motor-data'));
  init('oral-motor', m.scale_info.title);
  (m.sections || []).forEach((sec) => {
    (sec.items || []).forEach((it) => {
      add('oral-motor', it.id, { text: it.text, section: sec.title, options: opts(it.options) });
    });
  });
  (m.oral_motor.items || []).forEach((it) => {
    add('oral-motor', it.id, {
      text: it.text,
      section: m.oral_motor.title,
      options: (m.oral_motor.levels || []).map((l) => ({ value: String(l.value), label: String(l.label) })),
    });
  });
}

// 8) TML 量表（题库在 assessment.js 内）
{
  const a = require(path.join(appDir, 'utils', 'assessment'));
  Object.keys(a.TML_SCALES || {}).forEach((scale) => {
    const s = a.TML_SCALES[scale];
    init(scale, s.name);
    (s.items || []).forEach((it) => {
      add(scale, it.number, {
        text: it.text,
        section: '',
        options: (a.TML_SCORE_OPTIONS[scale] || []).map((o) => ({ value: String(o.value), label: String(o.label) })),
      });
    });
  });
}

fs.writeFileSync(outFile, JSON.stringify(bank, null, 2));
console.log(`已生成 ${outFile}`);
Object.keys(bank).forEach((k) => console.log(`  ${k}: ${Object.keys(bank[k].items).length} 项`));
console.log(`文件大小：${(fs.statSync(outFile).size / 1024).toFixed(1)} KB`);
