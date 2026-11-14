import rawBank from './scale-question-bank.json';

/**
 * 量表题库（PC 端只读副本）
 *
 * 数据由小程序 `utils/*-data.js` 生成，用于在评估记录详情里还原：
 *   - 题目原文
 *   - 全部选项（A/B/C…）及其文字
 *
 * 小程序新增量表后，需要同步重新生成本文件（见 scripts 里的说明或 README）。
 */

export interface BankOption {
  value: string;
  label: string;
}

export interface BankItem {
  text: string;
  section?: string;
  options: BankOption[];
}

export interface ScaleBank {
  title: string;
  items: Record<string, BankItem>;
}

const BANK = rawBank as unknown as Record<string, ScaleBank>;

/** 量表名称 → scaleId（兼容老记录里没有 scaleId 的情况） */
const NAME_TO_SCALE_ID: Record<string, string> = {
  '儿童感觉统合检查表': 'sensory',
  '感觉统合评估量表': 'sensory-general',
  '未来家感觉统合发展评定量表 (3-4岁)': 'attention-sensory-3-4',
  '未来家感统系统发展评定量表 (4-5.5岁)': 'sensory-4-5',
  '未来家感觉统合发展评定量表 (4-5.5岁)': 'sensory-4-5',
  '未来家注意力感统发展评定量表 (5.5-8岁)': 'attention-eval',
  '未来家感觉统合发展评定量表 (5.5-8岁)': 'attention-eval',
  '未来家注意力感统发展评定定量表 (3-4岁)': 'attention-sensory-3-4',
  '未来家6-12岁注意力水平测评体系': 'attention',
  '未来家儿童注意力水平测评体系 (4-6岁)': 'attention-4-6',
  '自闭症儿童心理教育评核（第三版）': 'autism',
  '婴幼儿喂养困难调查问卷 (MCH-FS)': 'mch-fs',
  '中文口腔运动功能评估表': 'oral-motor',
  '症状与学习成绩评估表': 'tml1',
  '注意力缺陷-多动障碍(ADHD)评估量表': 'tml2',
  '社交反应量表 (SRS)': 'tml3',
};

export function resolveScaleId(report: any): string {
  if (!report) return '';
  const direct = report.scaleId || report.scaleid;
  if (direct && BANK[direct]) return direct;
  const byName = NAME_TO_SCALE_ID[report.scaleName || report.scalename || ''];
  if (byName && BANK[byName]) return byName;
  return direct ? String(direct) : '';
}

export function getScaleBank(scaleId: string): ScaleBank | null {
  if (!scaleId) return null;
  return BANK[scaleId] || null;
}

export function findQuestion(scaleId: string, key: string | number): BankItem | null {
  const bank = getScaleBank(scaleId);
  if (!bank) return null;
  return bank.items[String(key)] || null;
}

/** 按题目文字兜底查找（老记录只有 text、没有 id 时） */
export function findQuestionByText(scaleId: string, text: string): BankItem | null {
  const bank = getScaleBank(scaleId);
  if (!bank || !text) return null;
  const target = text.trim();
  for (const item of Object.values(bank.items)) {
    if (item.text && item.text.trim() === target) return item;
  }
  return null;
}

/**
 * 选项展示：默认「标记-文字」（如 A-总是）。
 * 选项文字已自带标记（A-没有出现 / 3｜功能正常）时直接使用，避免出现 A-A-...
 */
export function formatOption(option: BankOption | { value?: unknown; label?: unknown }): string {
  const value = option && option.value !== undefined && option.value !== null ? String(option.value) : '';
  const label = option && option.label !== undefined && option.label !== null ? String(option.label) : '';
  if (!value) return label;
  if (!label || label === value) return value;
  if (
    label.startsWith(value + '-') ||
    label.startsWith(value + '－') ||
    label.startsWith(value + '｜') ||
    label.startsWith(value + ' ') ||
    label.startsWith(value + '·')
  ) {
    return label;
  }
  return value + '-' + label;
}

/** 答案解析：把选项标记与文字拼成可读文本 */
export function formatAnswer(value: unknown, label?: string): string {
  if (value === undefined || value === null || value === '') {
    return label ? String(label) : '';
  }
  if (Array.isArray(value)) {
    return value.map((v) => String(v)).join('、');
  }
  const v = String(value);
  if (!label) return v;
  return formatOption({ value: v, label });
}

// ============================================================================
// 评估记录详情：把 rawData 整理成「题目 + 全部选项 + 选中项」的行
// ============================================================================

export interface ReviewRow {
  key: string;
  no: number | string;
  section?: string;
  question: string;
  value: unknown;
  label?: string;
  options: BankOption[];
  score?: number | null;
  note?: string;
}

export interface ReviewData {
  rows: ReviewRow[];
  /** 只有维度汇总、没有逐题答案时返回（如儿童感觉统合检查表） */
  dimensionResults: any[];
}

/**
 * 汇总报告里可能的多种结构：answerDetails / allResults / itemScores /
 * results（逐题或维度）/ answers / part1Answers / part2Answers，
 * 再用题库补题目原文与全部选项。
 */
export function buildReviewRows(raw: any): ReviewData {
  const scaleId = resolveScaleId(raw);
  const answers = raw && raw.answers && typeof raw.answers === 'object' ? raw.answers : {};
  const notes = raw && raw.notes && typeof raw.notes === 'object' ? raw.notes : {};

  const rows: ReviewRow[] = [];
  const seen = new Set<string>();
  const push = (row: ReviewRow) => {
    const key = String(row.key || '');
    if (!key || seen.has(key)) return;
    seen.add(key);
    rows.push(row);
  };

  const details = Array.isArray(raw && raw.answerDetails) ? raw.answerDetails : [];
  const allResults = Array.isArray(raw && raw.allResults) ? raw.allResults : [];
  const itemScores = Array.isArray(raw && raw.itemScores) ? raw.itemScores : [];
  const results = Array.isArray(raw && raw.results) ? raw.results : [];
  const isDimensionResults = results.length > 0 && results[0] && results[0].factorName;

  if (details.length > 0) {
    details.forEach((d: any, idx: number) => {
      if (!d) return;
      push({
        key: String(d.id === undefined ? idx : d.id),
        no: idx + 1,
        section: d.section,
        question: d.text || d.question || '',
        value: d.answer,
        label: d.label,
        options: [],
      });
    });
  } else if (allResults.length > 0) {
    allResults.forEach((r: any, idx: number) => {
      push({
        key: String(r.id === undefined ? idx : r.id),
        no: r.id === undefined ? idx + 1 : r.id,
        section: r.section,
        question: r.text || r.shortText || '',
        value: r.answer,
        label: r.label,
        options: [],
      });
    });
  } else if (itemScores.length > 0) {
    itemScores.forEach((r: any, idx: number) => {
      push({
        key: String(r.number === undefined ? idx + 1 : r.number),
        no: r.number === undefined ? idx + 1 : r.number,
        section: '',
        question: r.text || '',
        value: r.score,
        options: [],
        score: r.score,
      });
    });
  } else if (results.length > 0 && !isDimensionResults) {
    results.forEach((r: any, idx: number) => {
      push({
        key: String(r.id === undefined ? idx : r.id),
        no: r.id === undefined ? idx + 1 : r.id,
        section: r.section,
        question: r.text || r.shortText || '',
        value: r.answer,
        label: r.label,
        options: [],
        score: r.score,
      });
    });
  }

  // 补齐 answers 里未出现在明细中的题目
  Object.keys(answers).forEach((key, idx) => {
    push({ key, no: idx + 1, question: '', value: answers[key], options: [] });
  });

  // 喂养问卷的 part1 / part2
  const part1 = raw && raw.part1Answers && typeof raw.part1Answers === 'object' ? raw.part1Answers : {};
  Object.keys(part1).forEach((key) => {
    push({ key, no: key, question: '', value: part1[key], options: [] });
  });
  const part2 = raw && raw.part2Answers && typeof raw.part2Answers === 'object' ? raw.part2Answers : {};
  Object.keys(part2).forEach((key) => {
    push({ key, no: key, question: '', value: part2[key], options: [] });
  });

  if (rows.length === 0) {
    return {
      rows: [],
      dimensionResults: isDimensionResults ? results : [],
    };
  }

  const merged = rows.map((row) => {
    const lookupKey = scaleId && row.key.indexOf(scaleId + '_') === 0 ? row.key.slice(scaleId.length + 1) : row.key;
    const bankItem = findQuestion(scaleId, lookupKey) || findQuestionByText(scaleId, row.question);
    const options = row.options && row.options.length > 0
      ? row.options
      : (bankItem && bankItem.options ? bankItem.options : []);
    const question = row.question || (bankItem ? bankItem.text : '');
    const section = row.section || (bankItem ? bankItem.section : '');
    return { ...row, question, section, options, note: notes[row.key] || '' };
  });

  return { rows: merged, dimensionResults: [] };
}
