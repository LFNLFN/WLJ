/**
 * 上传资料的文本抽取。
 *
 * 知识库（knowledge_documents）与对话附件都复用这里的逻辑，把
 * 「用户上传的文件」尽量变成可检索 / 可喂给大模型的纯文本。
 *
 * 支持：
 *  - 纯文本类（txt / md / csv / json / log / ts / js / py / html / xml …）→ 直接按 UTF-8 解码
 *  - 表格（xlsx / xls / csv / tsv）→ 用 xlsx 库转成 CSV 文本
 *  - Word（docx）→ 用 jszip 解出 word/document.xml 再剥标签
 *  - 图片 → 不做 OCR，交给多模态模型（对话附件路径）
 *
 * 不支持（不做「假解析」，如实返回 note 说明原因）：
 *  - 旧版二进制 .doc / .xls 之外的 .doc、PDF、音视频等
 */

import * as XLSX from 'xlsx';
import JSZip from 'jszip';

/** 单个文件最多抽取多少字符（避免把超长文本塞进数据库 / 模型上下文） */
export const MAX_EXTRACT_CHARS = 20_000;

export interface ExtractResult {
  /** 抽取到的纯文本（可能为空字符串） */
  text: string;
  /** 需要告知用户的说明（截断 / 无法解析等），没有则为 undefined */
  note?: string;
}

const TEXT_EXTENSIONS = new Set([
  'txt', 'text', 'md', 'markdown', 'csv', 'tsv', 'json', 'jsonl', 'log',
  'html', 'htm', 'xml', 'yml', 'yaml', 'ini', 'conf',
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'rb', 'go', 'java', 'c', 'h', 'cpp', 'sh', 'sql', 'css',
]);

const SHEET_EXTENSIONS = new Set(['xlsx', 'xls', 'xlsm']);

/** 纯文本表格：按 UTF-8 直接读，交给 SheetJS 反而会因缺少 BOM 被当成 Windows-1252 解出乱码 */
const PLAIN_TABLE_EXTENSIONS = new Set(['csv', 'tsv']);

export function fileExtension(name: string): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(String(name || '').trim());
  return m ? m[1].toLowerCase() : '';
}

export function isImageFile(name: string, mimeType?: string): boolean {
  const mime = String(mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic', 'heif', 'svg'].includes(fileExtension(name));
}

/** 是否是「能直接当纯文本读」的文件 */
export function isTextLikeFile(name: string, mimeType?: string): boolean {
  const mime = String(mimeType || '').toLowerCase();
  if (mime.startsWith('text/')) return true;
  if (['application/json', 'application/xml', 'application/x-yaml', 'application/javascript'].includes(mime)) {
    return true;
  }
  return TEXT_EXTENSIONS.has(fileExtension(name));
}

function clip(text: string, note?: string): ExtractResult {
  const normalized = text.replace(/\r\n?/g, '\n').replace(/\u0000/g, '').trim();
  if (normalized.length <= MAX_EXTRACT_CHARS) return { text: normalized, ...(note ? { note } : {}) };
  return {
    text: normalized.slice(0, MAX_EXTRACT_CHARS),
    note: `${note ? note + '；' : ''}文本过长，已截取前 ${MAX_EXTRACT_CHARS} 字`,
  };
}

/** 表格文件 → CSV 文本（多个 sheet 依次拼接） */
function extractSheet(buf: Buffer, name: string): ExtractResult {
  const workbook = XLSX.read(buf, { type: 'buffer' });
  const parts: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    if (!csv.trim()) continue;
    parts.push(workbook.SheetNames.length > 1 ? `# ${sheetName}\n${csv}` : csv);
  }
  if (parts.length === 0) return { text: '', note: `表格 ${name} 里没有可读内容` };
  return clip(parts.join('\n\n'));
}

/** docx → 纯文本：解压后剥掉 word/document.xml 里的 XML 标签 */
async function extractDocx(buf: Buffer): Promise<ExtractResult> {
  const zip = await JSZip.loadAsync(buf);
  const entry = zip.file('word/document.xml');
  if (!entry) return { text: '', note: '这个 .docx 里找不到 word/document.xml，可能是损坏的文件' };
  const xml = await entry.async('string');
  const text = xml
    .replace(/<w:tab[^>]*\/>/g, '\t')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
  return clip(text);
}

function extractHtml(raw: string): ExtractResult {
  const text = raw
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
  return clip(text);
}

/**
 * PDF 文字抽取（纯 JS，依赖 pdf-parse@1.1.1）。
 *
 * - 依赖是可选的：没装（例如服务器没跑 npm install）或解析失败时，返回空 text + 说明，
 *   不会让上传接口 500；扫描件/图片型 PDF 本来就没有文字层，会给出"请传火山知识库"的提示。
 * - 惰性 require，避免把 30MB 的 pdf.js 拖进每次请求的模块图。
 */
async function extractPdf(buf: Buffer, name: string): Promise<ExtractResult> {
  let pdfParse: ((data: Buffer) => Promise<{ text: string; numpages?: number }>) | null = null;
  try {
    // 直接取内层模块：pdf-parse 的 index.js 开头有「!module.parent 就进 debug 模式」的逻辑，
    // 在 Next/webpack 打包后的模块语义下会误判成 debug，去读它自带的 test/data 文件并抛错。
    // lib/pdf-parse.js 没有这段，是同一个实现，安全。
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    pdfParse = require('pdf-parse/lib/pdf-parse.js');
  } catch {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      pdfParse = require('pdf-parse');
    } catch {
      pdfParse = null;
    }
  }

  if (!pdfParse) {
    return {
      text: '',
      note: `${name} 是 PDF，但服务端未安装 PDF 解析库（npm install 未完成？），未能抽取文字；` +
        '也可以把这份 PDF 上传到火山知识库（那边由火山侧解析）',
    };
  }

  try {
    const parsed = await pdfParse(buf);
    const text = String(parsed?.text || '');
    if (!text.trim()) {
      return {
        text: '',
        note: `${name} 里没有可抽取的文字（可能是扫描件 / 图片型 PDF，${parsed?.numpages ?? 0} 页）：` +
          '请上传到火山知识库（火山侧支持 OCR/版面解析），或提供文字版',
      };
    }
    const result = clip(text);
    return { ...result, note: result.note || `${name} 共 ${parsed?.numpages ?? 0} 页，已抽取文字` };
  } catch (err) {
    return { text: '', note: `${name} 解析失败：${(err as Error)?.message || '未知错误'}` };
  }
}

/**
 * 把上传的文件抽成纯文本。
 * 不会抛出异常：无法解析时返回空 text + note 说明。
 */
export async function extractTextFromBuffer(
  name: string,
  mimeType: string | undefined,
  buf: Buffer
): Promise<ExtractResult> {
  const ext = fileExtension(name);
  try {
    if (isImageFile(name, mimeType)) {
      return { text: '', note: `${name} 是图片，未做文字识别（可在提问时作为图片附件发给多模态模型）` };
    }
    if (SHEET_EXTENSIONS.has(ext)) {
      return extractSheet(buf, name);
    }
    if (PLAIN_TABLE_EXTENSIONS.has(ext)) {
      // csv / tsv 本身就是文本，直接按 UTF-8 读（去掉 BOM），避免编码被误判成乱码
      return clip(buf.toString('utf8').replace(/^\uFEFF/, ''));
    }
    if (ext === 'docx') {
      return await extractDocx(buf);
    }
    if (ext === 'doc' || ext === 'ppt' || ext === 'pptx') {
      return {
        text: '',
        note: `${name} 是旧版/二进制 Office 格式，无法直接解析；请另存为 .docx / .xlsx / PDF 文本后再上传`,
      };
    }
    if (ext === 'pdf') {
      return await extractPdf(buf, name);
    }
    if (isTextLikeFile(name, mimeType) || ext === '') {
      const raw = buf.toString('utf8');
      if (ext === 'html' || ext === 'htm') return extractHtml(raw);
      // 是否像文本：UTF-8 解码后替换字符占比过高，说明是二进制
      const replacementRatio = (raw.match(/\uFFFD/g) || []).length / Math.max(raw.length, 1);
      if (replacementRatio > 0.05) {
        return { text: '', note: `${name} 看起来是二进制文件，未能抽取文字` };
      }
      return clip(raw);
    }
    return { text: '', note: `暂不支持解析 ${ext ? '.' + ext : '该类型'} 文件，仅记录了文件名` };
  } catch (err) {
    return { text: '', note: `解析 ${name} 失败：${(err as Error).message}` };
  }
}
