// ============================================================
// 康复档案 PDF/打印 渲染工具
// 移植自 pdf-export-debug（Node.js 调试台）的模板渲染逻辑，
// 供前端在浏览器中完成模板占位符渲染与打印预览。
// ============================================================

/** HTML 转义（与服务端 renderTemplate 一致） */
export function escapeHtml(str: unknown): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 渲染模板：支持 {{key}} 占位符与 {{#if expr}}...{{else}}...{{/if}} 条件块。
 * expr 支持：{{#if key}}（有值即真）或 {{#if key == '值'}} / {{#if key != '值'}}
 */
export function renderTemplate(fields: Record<string, unknown>, tpl: string): string {
  let html = tpl;
  // 1) 条件块
  html = html.replace(
    /\{\{#if\s+([^}]+?)\s*\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_m, expr: string, yes: string, no: string) => {
      const eq = expr.match(/^([\w.]+)\s*(==|===|!=|!==)\s*['"]([\s\S]*?)['"]$/);
      let show: boolean;
      if (eq) {
        const [, key, op, expected] = eq;
        const val = String(fields[key] ?? '');
        show = op === '==' || op === '===' ? val === expected : val !== expected;
      } else {
        const val = fields[expr.trim()];
        show = val !== undefined && val !== null && String(val).trim() !== '';
      }
      return show ? yes : no;
    }
  );
  // 2) 普通占位符
  return html.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => {
    const val = fields[key] !== undefined && fields[key] !== null ? fields[key] : '';
    return escapeHtml(val);
  });
}

/** 把“2019年5月12日 / 2019-05-12”拆成年/月/日，用于封面、入学登记表的年月日小格 */
export function deriveFields(fields: Record<string, unknown>): Record<string, unknown> {
  const f: Record<string, unknown> = { ...fields };
  const parse = (s: unknown) => {
    const str = String(s || '');
    let m = str.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
    if (m) return { y: m[1], mo: m[2], d: m[3] };
    m = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (m) return { y: m[1], mo: m[2], d: m[3] };
    return null;
  };
  const b = parse(f.birthDate);
  if (b) {
    f.birthYear = b.y;
    f.birthMonth = b.mo;
    f.birthDay = b.d;
  }
  if (!f.archiveDate) {
    const d = new Date();
    f.archiveDate = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  }
  const a = parse(f.archiveDate);
  if (a) {
    f.archiveYear = a.y;
    f.archiveMonth = a.mo;
    f.archiveDay = a.d;
  }
  return f;
}

// ============================================================
// 文档 / 模板配置
// ============================================================
export interface DocDef {
  key: string;                 // 文档标识
  label: string;               // 显示名称
  template: string;            // 模板文件名
  isForm?: boolean;            // 是否有表单需要填写
  fullPage?: boolean;          // 满版页（封面/目录/使用说明等独立分页）
}

export const DOCS: DocDef[] = [
  { key: 'cover', label: '封面', template: 'cover.html', isForm: true },
  { key: 'contents', label: '目录', template: 'contents.html' },
  { key: 'introduction', label: '使用说明', template: 'introduction.html' },
  { key: 'register', label: '入学登记表', template: 'template.html', isForm: true },
  { key: 'assess', label: '学习能力评估表', template: 'template2.html', isForm: true },
  { key: 'analyzeReport', label: '评估结果综合分析报告', template: 'analyzeReport.html' },
  { key: 'iep', label: '个别化教育计划（IEP）', template: 'IEP.html' },
  { key: 'personLesson', label: '个别教学记录卡', template: 'personLessonRecord.html' },
  { key: 'learnReport', label: '学习进度报告表', template: 'learnreport.html' },
  { key: 'catchup', label: '后续教育跟踪表', template: 'catchup.html' },
  { key: 'attach', label: '附件', template: 'attach.html' },
];

/** 渲染后的整页 HTML 模板集合（用于打印/预览整份档案） */
export const ARCHIVE_ORDER = DOCS.map((d) => d.template);

// ============================================================
// 学习能力评估表 - 评分项定义（与 pdf-export-debug/form.html 一致）
// ============================================================
export interface AssessGroup {
  cat: string;
  items: [string, string][];
}

export const ASSESS_GROUPS: AssessGroup[] = [
  { cat: '1．粗大运动', items: [
    ['s_1_1', '1.1　抬头：能抬头并保持片刻'],
    ['s_1_2', '1.2　翻身：能由仰卧翻至俯卧'],
    ['s_1_3', '1.3　坐：能独立坐稳'],
    ['s_1_4', '1.4　爬：能手膝爬行'],
    ['s_1_5', '1.5　站立：能扶站或独立站立'],
    ['s_1_6', '1.6　行走：能独立行走'],
    ['s_1_7', '1.7　跑：能向前跑'],
    ['s_1_8', '1.8　跳：能双脚跳起'],
    ['s_1_9', '1.9　上下楼梯：能在帮助下上下楼梯'],
    ['s_1_10', '1.10　踢球：能踢静止的球'],
    ['s_1_11', '1.11　拍球：能拍球数次'],
    ['s_1_12', '1.12　接球：能接住抛来的球'],
    ['s_1_13', '1.13　投球：能向前投球'],
    ['s_1_14', '1.14　平衡：能在平衡木上行走'],
    ['s_1_15', '1.15　协调：能完成简单协调动作'],
  ]},
  { cat: '2．精细动作', items: [
    ['s_2_1', '2.1　拼插玩具：能把玩具插入相应的孔洞内'],
    ['s_2_2', '2.2　搭积木：能搭起积木，叠高积木'],
    ['s_2_3', '2.3　串珠：能把珠子穿入绳子'],
    ['s_2_4', '2.4　拧瓶盖：能拧开、拧紧瓶盖'],
    ['s_2_5', '2.5　折纸：能按要求折纸'],
    ['s_2_6', '2.6　剪纸：能使用剪刀剪纸'],
    ['s_2_7', '2.7　涂画：能涂色、画线条'],
    ['s_2_8', '2.8　捏塑：能用橡皮泥捏出简单形状'],
    ['s_2_9', '2.9　穿脱衣服：能自己穿、脱衣服'],
    ['s_2_10', '2.10　系扣：能扣、解纽扣'],
    ['s_2_11', '2.11　用勺：能用勺进食'],
    ['s_2_12', '2.12　用筷子：能用筷子夹取食物'],
    ['s_2_13', '2.13　拿笔：能正确握笔'],
    ['s_2_14', '2.14　描画：能描画简单图形'],
    ['s_2_15', '2.15　写画：能模仿画横线、竖线、圆形'],
    ['s_2_16', '2.16　操作玩具：能完成简单的手部操作活动'],
  ]},
  { cat: '3．感觉知觉', items: [
    ['s_3_1', '3.1　视觉追踪：能注视和追视物体'],
    ['s_3_2', '3.2　视觉辨别：能辨别不同的颜色、形状和大小'],
    ['s_3_3', '3.3　视觉记忆：能记住简单图形或物品'],
    ['s_3_4', '3.4　听觉反应：对声音有反应'],
    ['s_3_5', '3.5　听觉辨别：能辨别不同的声音'],
    ['s_3_6', '3.6　听觉记忆：能记住简单的声音信息'],
    ['s_3_7', '3.7　触觉反应：能对触摸作出反应'],
    ['s_3_8', '3.8　触觉辨别：能辨别不同质地的物品'],
    ['s_3_9', '3.9　前庭觉：对平衡、旋转活动有反应'],
    ['s_3_10', '3.10　本体觉：能感知身体姿势和动作'],
  ]},
  { cat: '4．认知', items: [
    ['s_4_1', '4.1　物品认知：能认识常见物品'],
    ['s_4_2', '4.2　颜色认知：能辨别红、黄、蓝、绿等颜色'],
    ['s_4_3', '4.3　形状认知：能辨别圆形、方形、三角形等'],
    ['s_4_4', '4.4　大小比较：能辨别大、小'],
    ['s_4_5', '4.5　长短比较：能辨别长、短'],
    ['s_4_6', '4.6　多少比较：能辨别多、少'],
    ['s_4_7', '4.7　大小规律：能按大小规律排列物品'],
    ['s_4_8', '4.8　分类：能按颜色、形状、大小分类'],
    ['s_4_9', '4.9　配对：能进行相同物品配对'],
    ['s_4_10', '4.10　数概念：能认识1—10数字'],
    ['s_4_11', '4.11　点数：能点数物品数量'],
    ['s_4_12', '4.12　时间概念：能理解早、晚、日、夜'],
    ['s_4_13', '4.13　空间概念：能理解上、下、前、后、里、外'],
    ['s_4_14', '4.14　身体部位：能指出身体各部位'],
    ['s_4_15', '4.15　家庭成员：能认识家庭成员'],
    ['s_4_16', '4.16　动物认知：能认识常见动物'],
    ['s_4_17', '4.17　交通工具认知：能认识常见交通工具'],
    ['s_4_18', '4.18　蔬菜水果认知：能认识常见蔬菜、水果'],
    ['s_4_19', '4.19　职业认知：能认识简单职业'],
    ['s_4_20', '4.20　季节认知：能认识春夏秋冬'],
    ['s_4_21', '4.21　图形拼合：能完成简单拼图'],
    ['s_4_22', '4.22　顺序排列：能按顺序排列图片'],
    ['s_4_23', '4.23　记忆：能记忆简单图像或物品'],
    ['s_4_24', '4.24　解决问题：能完成简单问题解决任务'],
    ['s_4_25', '4.25　注意力：能维持一定时间的注意'],
  ]},
  { cat: '5．语言交往', items: [
    ['s_5_1', '5.1　听声音：能对声音作出反应'],
    ['s_5_2', '5.2　听指令：能听懂简单指令'],
    ['s_5_3', '5.3　理解词语：能理解常用词语'],
    ['s_5_4', '5.4　理解句子：能理解简单句子'],
    ['s_5_5', '5.5　表达需要：能用动作、表情表达需要'],
    ['s_5_6', '5.6　发音：能发出声音或模仿发音'],
    ['s_5_7', '5.7　说词语：能说出常用词语'],
    ['s_5_8', '5.8　说短句：能说出两至三个字的短句'],
    ['s_5_9', '5.9　回答问题：能回答简单问题'],
    ['s_5_10', '5.10　主动交谈：能主动与人交谈'],
    ['s_5_11', '5.11　称呼：会称呼熟悉的人'],
    ['s_5_12', '5.12　自我介绍：能说出自己的姓名'],
    ['s_5_13', '5.13　问候：会使用简单礼貌用语'],
    ['s_5_14', '5.14　对话：能与成人进行简单对话'],
    ['s_5_15', '5.15　复述：能复述简单词句'],
    ['s_5_16', '5.16　讲述：能讲述简单事情'],
    ['s_5_17', '5.17　看图说话：能根据图片进行表达'],
    ['s_5_18', '5.18　儿歌：能念简单儿歌'],
    ['s_5_19', '5.19　故事：能听简单故事'],
    ['s_5_20', '5.20　阅读：能翻阅图书并看图'],
    ['s_5_21', '5.21　书写：能模仿写画'],
    ['s_5_22', '5.22　交往意愿：愿意与他人接触'],
    ['s_5_23', '5.23　轮流等待：能在游戏中轮流等待'],
    ['s_5_24', '5.24　分享：愿意分享玩具或食物'],
    ['s_5_25', '5.25　合作：能与同伴合作完成活动'],
    ['s_5_26', '5.26　遵守规则：能遵守简单游戏规则'],
    ['s_5_27', '5.27　情绪表达：能表达高兴、生气等情绪'],
    ['s_5_28', '5.28　情绪控制：在提醒下能调整情绪'],
  ]},
  { cat: '6．社会技能', items: [
    ['s_6_1', '6.1　能辨别自己的姓名'],
    ['s_6_2', '6.2　能说出自己的年龄'],
    ['s_6_3', '6.3　能说出自己的性别'],
    ['s_6_4', '6.4　能说出父母的姓名'],
    ['s_6_5', '6.5　能认识家庭成员'],
    ['s_6_6', '6.6　能认识老师和同伴'],
    ['s_6_7', '6.7　会与人打招呼'],
    ['s_6_8', '6.8　会说"请""谢谢""再见"'],
    ['s_6_9', '6.9　能等待轮流'],
    ['s_6_10', '6.10　能遵守课堂规则'],
    ['s_6_11', '6.11　能遵守游戏规则'],
    ['s_6_12', '6.12　能参与集体活动'],
    ['s_6_13', '6.13　能接受成人安排'],
    ['s_6_14', '6.14　能完成简单任务'],
    ['s_6_15', '6.15　能主动寻求帮助'],
    ['s_6_16', '6.16　能帮助他人'],
    ['s_6_17', '6.17　能辨别危险行为'],
    ['s_6_18', '6.18　能在成人提醒下注意安全'],
    ['s_6_19', '6.19　能表达自己的意愿'],
    ['s_6_20', '6.20　能适应环境变化'],
    ['s_6_21', '6.21　能进行简单的角色游戏'],
    ['s_6_22', '6.22　能与同伴共同游戏'],
    ['s_6_23', '6.23　能在集体活动中表现适当'],
  ]},
  { cat: '7．生活自理', items: [
    ['s_7_1', '7.1　进食：能自己进食'],
    ['s_7_2', '7.2　喝水：能自己用杯子喝水'],
    ['s_7_3', '7.3　洗手：能在提醒下洗手'],
    ['s_7_4', '7.4　擦嘴：能自己擦嘴'],
    ['s_7_5', '7.5　如厕：有大小便需求时能表示'],
    ['s_7_6', '7.6　如厕后：能在帮助下清洁身体'],
    ['s_7_7', '7.7　穿鞋：能穿、脱鞋子'],
    ['s_7_8', '7.8　穿袜：能穿、脱袜子'],
    ['s_7_9', '7.9　穿上衣：能穿、脱上衣'],
    ['s_7_10', '7.10　穿裤子：能穿、脱裤子'],
    ['s_7_11', '7.11　扣扣子：能扣、解纽扣'],
    ['s_7_12', '7.12　拉拉链：能拉、开拉链'],
    ['s_7_13', '7.13　整理衣物：能整理自己的衣物'],
    ['s_7_14', '7.14　刷牙：能自己刷牙'],
    ['s_7_15', '7.15　洗脸：能自己洗脸'],
    ['s_7_16', '7.16　梳头：能自己梳头'],
    ['s_7_17', '7.17　洗澡：能在帮助下洗澡'],
    ['s_7_18', '7.18　整理玩具：能收拾玩具'],
    ['s_7_19', '7.19　收拾书包：能整理书包'],
    ['s_7_20', '7.20　做简单家务：能协助扫地、擦桌子'],
    ['s_7_21', '7.21　安全：知道不能随便跟陌生人走'],
    ['s_7_22', '7.22　安全：知道不玩危险物品'],
    ['s_7_23', '7.23　安全：知道不触碰危险电器'],
    ['s_7_24', '7.24　外出：能在成人陪同下外出'],
    ['s_7_25', '7.25　乘车：能遵守乘车规则'],
    ['s_7_26', '7.26　购物：能在帮助下购买物品'],
    ['s_7_27', '7.27　生活习惯：能按时作息'],
  ]},
];

/** 初始化评估项字段（默认空串，避免 undefined） */
export function initialAssessmentFields(): Record<string, string> {
  const f: Record<string, string> = {};
  ASSESS_GROUPS.forEach((g) => g.items.forEach(([name]) => { f[name] = ''; }));
  return f;
}

// ============================================================
// 预览 / 整册打印 HTML 构建
// ============================================================

/** 从完整 HTML 中提取所有 <style> 块内容 */
export function extractStyles(html: string): string[] {
  const out: string[] = [];
  const re = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push(m[1].trim());
  return out;
}

/** 从完整 HTML 中提取 <body> 内部内容 */
export function extractBody(html: string): string {
  const m = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return m ? m[1].trim() : '';
}

/**
 * 构建单个模板的完整 HTML（用于 iframe 预览）。
 * 与 pdf-export-debug 的 /api/preview 行为一致。
 */
export function buildTemplatePreviewHtml(
  fields: Record<string, unknown>,
  templateHtml: string,
  title = '预览'
): string {
  const f = deriveFields(fields);
  const rendered = renderTemplate(f, templateHtml);
  const styles = extractStyles(rendered);
  return [
    '<!DOCTYPE html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="UTF-8" />',
    '<title>' + title + '</title>',
    '<style>' + styles.join('\n') + '</style>',
    '</head>',
    '<body style="background:#eef1f5;">' + extractBody(rendered) + '</body>',
    '</html>',
  ].join('\n');
}

/** 整册打印时每个模板外层容器的 padding（模拟原模板 @page 的 margin） */
const ARCHIVE_WRAP_PADDING: Record<string, string> = {
  'cover.html': '0',
  'contents.html': '0',
  'introduction.html': '0',
  'template.html': '12mm 10mm',
  'template2.html': '12mm 14mm',
  'analyzeReport.html': '14mm 16mm',
  'IEP.html': '14mm 16mm',
  'personLessonRecord.html': '15mm 16mm 14mm 16mm',
  'learnreport.html': '14mm 16mm 14mm 16mm',
  'catchup.html': '18mm 17mm 15mm 17mm',
  'attach.html': '0',
};

/** 有独立页边距的内容表模板（用 padding 模拟 @page margin） */
const CONTENT_TEMPLATES = new Set(['template.html', 'template2.html']);

/**
 * 构建整册档案的打印 HTML（<style> + 各模板 body 内容）。
 * 注入页面 #print-root 后调用 window.print() 即可导出整册 PDF。
 * 统一使用 @page { margin:0 }，原模板的 @page 边距通过外层 padding 模拟，
 * 以保证与 pdf-export-debug 服务端按节生成 PDF 的排版一致。
 */
export function buildArchivePrintHtml(
  fields: Record<string, unknown>,
  templates: Record<string, string>
): string {
  const f = deriveFields(fields);
  const styles: string[] = [];
  const bodies: string[] = [];

  DOCS.forEach((doc) => {
    const tpl = templates[doc.template];
    if (!tpl) return;
    const rendered = renderTemplate(f, tpl);
    // 去掉模板自带的 @page（整册统一 margin:0，再用 padding 模拟原边距）
    const css = extractStyles(rendered)
      .map((s) => s.replace(/@page\s*\{[^}]*\}/g, ''))
      .join('\n');
    const body = extractBody(rendered);
    const padding = ARCHIVE_WRAP_PADDING[doc.template] || '0';
    const isContent = CONTENT_TEMPLATES.has(doc.template);
    bodies.push(
      `<div class="print-wrap ${isContent ? 'content' : 'cover'}" style="padding:${padding}">${body}</div>`
    );
    styles.push(css);
  });

  const printCss = [
    '@page { size: A4; margin: 0; }',
    'html, body { margin: 0; padding: 0; background: #fff; }',
    'body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
    '.print-wrap { page-break-inside: auto; break-inside: auto; }',
    '.print-wrap + .print-wrap { page-break-before: always; break-before: page; }',
    '.print-wrap.cover { padding: 0; }',
    '.print-wrap.cover .cover, .print-wrap.cover .page { width: 210mm; min-height: 297mm; margin: 0; box-shadow: none; }',
    '.print-wrap.cover .tpl-analyzereport .page { width: auto; min-height: 263mm; }',
    '.print-wrap.cover .tpl-iep .page { width: auto; min-height: 263mm; }',
    '.print-wrap.cover .tpl-personlesson .page { width: auto; min-height: 262mm; }',
    '.print-wrap.cover .tpl-learnreport .page { width: auto; min-height: 263mm; }',
    '.print-wrap.cover .tpl-catchup .page { width: auto; min-height: 258mm; }',
    '.print-wrap.content table { page-break-inside: auto; break-inside: auto; }',
    '.print-wrap.content tr, .print-wrap.content td, .print-wrap.content th { page-break-inside: avoid; break-inside: avoid; }',
  ].join('\n');

  return (
    '<style>' + printCss + '\n' + styles.join('\n') + '</style>' +
    '<div id="archivePrintBody">' + bodies.join('\n') + '</div>'
  );
}

// ============================================================
// 模板加载 / 整册打印文档构建
// ============================================================

/** 康复档案全部模板文件名（public/pdf-templates/ 下） */
export const TEMPLATE_FILES = [
  'cover.html',
  'contents.html',
  'introduction.html',
  'template.html',
  'template2.html',
  'analyzeReport.html',
  'IEP.html',
  'personLessonRecord.html',
  'learnreport.html',
  'catchup.html',
  'attach.html',
];

/** 从 /pdf-templates/ 目录加载全部模板内容 */
export async function loadTemplates(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await Promise.all(
    TEMPLATE_FILES.map(async (file) => {
      const res = await fetch('/pdf-templates/' + file);
      if (!res.ok) throw new Error('模板加载失败: ' + file);
      out[file] = await res.text();
    })
  );
  return out;
}

/**
 * 构建整册档案的完整 HTML 文档（可直接写入新窗口并调用 window.print()）。
 * 输出与 pdf-export-debug 服务端按节生成 PDF 的排版一致。
 */
export function buildArchivePrintDocument(
  fields: Record<string, unknown>,
  templates: Record<string, string>,
  title = '康复训练档案'
): string {
  const inner = buildArchivePrintHtml(fields, templates);
  return [
    '<!DOCTYPE html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="UTF-8" />',
    '<title>' + title + '</title>',
    '</head>',
    '<body>' + inner + '</body>',
    '</html>',
  ].join('\n');
}

/**
 * 打开新窗口渲染整册档案。
 * @param doPrint true 时自动调用 window.print()（可在打印对话框中选择“另存为 PDF”）
 * @returns 打开的窗口；被浏览器拦截时返回 null
 */
export function openArchivePrintWindow(
  fields: Record<string, unknown>,
  templates: Record<string, string>,
  title = '康复训练档案',
  doPrint = true
): Window | null {
  const html = buildArchivePrintDocument(fields, templates, title);
  const win = window.open('', '_blank');
  if (!win) return null; // 弹窗被浏览器拦截
  win.document.open();
  win.document.write(html);
  win.document.close();
  if (doPrint) {
    const triggerPrint = () => { win.focus(); win.print(); };
    // document.write 后 load 事件可能已触发，onload + 延时兜底
    win.onload = triggerPrint;
    setTimeout(triggerPrint, 1000);
  }
  return win;
}
