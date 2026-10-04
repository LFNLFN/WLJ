/**
 * 对话附件的服务端处理。
 *
 * 前端把用户选中的文件读成 dataURL（图片 / 二进制）或纯文本后随 /api/chat 一起提交，
 * 这里负责：
 *  - 校验数量与大小
 *  - 图片 → OpenAI 兼容的多模态 image_url 内容块（交给支持视觉的接入点）
 *  - 文本 / 表格 / docx → 抽取成文本，拼进用户消息（用 <file> 包裹，便于模型区分）
 *  - 解析不了的（PDF / .doc / 视频等）→ 明确写进消息里说明「未能解析」，不假装读过
 */

import { extractTextFromBuffer, isImageFile, MAX_EXTRACT_CHARS } from '@/lib/knowledge/extract';

export const MAX_ATTACHMENTS = 4;
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

export interface RawAttachment {
  name?: string;
  mimeType?: string;
  /** data:<mime>;base64,xxxx */
  dataUrl?: string;
  /** 前端已抽好的文本（可选，优先于 dataUrl 解析） */
  text?: string;
}

export interface PreparedImages {
  name: string;
  url: string;
}

export interface PreparedTexts {
  name: string;
  content: string;
}

export interface SkippedAttachment {
  name: string;
  reason: string;
}

export interface PreparedAttachments {
  images: PreparedImages[];
  texts: PreparedTexts[];
  skipped: SkippedAttachment[];
}

function parseDataUrl(dataUrl: string): { mimeType: string; buf: Buffer } | null {
  const m = /^data:([^;,]*)?(;base64)?,([\s\S]*)$/.exec(String(dataUrl || ''));
  if (!m) return null;
  const mimeType = m[1] || 'application/octet-stream';
  const isBase64 = Boolean(m[2]);
  const payload = m[3] || '';
  try {
    return { mimeType, buf: isBase64 ? Buffer.from(payload, 'base64') : Buffer.from(decodeURIComponent(payload), 'utf8') };
  } catch {
    return null;
  }
}

/** 把前端传来的附件归一化成「图片内容块 + 可读文本」，不做任何假解析 */
export async function prepareAttachments(raw: unknown): Promise<PreparedAttachments> {
  const list = Array.isArray(raw) ? raw.slice(0, MAX_ATTACHMENTS + 1) : [];
  const prepared: PreparedAttachments = { images: [], texts: [], skipped: [] };

  for (const item of list) {
    const att = (item ?? {}) as RawAttachment;
    const name = String(att.name || '未命名文件').slice(0, 200);

    if (prepared.images.length >= MAX_ATTACHMENTS || prepared.texts.length >= MAX_ATTACHMENTS) {
      prepared.skipped.push({ name, reason: `最多同时处理 ${MAX_ATTACHMENTS} 个附件` });
      continue;
    }

    // 前端已经抽好文本（例如粘贴的文本）
    if (!att.dataUrl && typeof att.text === 'string') {
      const content = att.text.slice(0, MAX_EXTRACT_CHARS);
      if (!content.trim()) {
        prepared.skipped.push({ name, reason: '内容为空' });
        continue;
      }
      prepared.texts.push({ name, content });
      continue;
    }

    const parsed = parseDataUrl(String(att.dataUrl || ''));
    if (!parsed) {
      prepared.skipped.push({ name, reason: '附件数据无法解析（可能没有读取成功）' });
      continue;
    }
    if (parsed.buf.length > MAX_ATTACHMENT_BYTES) {
      prepared.skipped.push({
        name,
        reason: `超过 ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)}MB 上限（${(parsed.buf.length / 1024 / 1024).toFixed(1)}MB）`,
      });
      continue;
    }

    const mimeType = att.mimeType || parsed.mimeType;
    if (isImageFile(name, mimeType)) {
      if (prepared.images.length >= MAX_ATTACHMENTS) {
        prepared.skipped.push({ name, reason: `最多同时处理 ${MAX_ATTACHMENTS} 张图片` });
        continue;
      }
      prepared.images.push({ name, url: `data:${mimeType};base64,${parsed.buf.toString('base64')}` });
      continue;
    }

    const extracted = await extractTextFromBuffer(name, mimeType, parsed.buf);
    if (extracted.text.trim()) {
      prepared.texts.push({ name, content: extracted.text });
    }
    if (extracted.note && !extracted.text.trim()) {
      prepared.skipped.push({ name, reason: extracted.note });
    } else if (extracted.note) {
      prepared.skipped.push({ name, reason: extracted.note });
    }
  }

  return prepared;
}

export interface AugmentResult<T> {
  messages: T[];
  /** 是否真的给模型发了图片（决定失败时能否降级重试） */
  usedImages: boolean;
}

/**
 * 把附件合并进「最后一条用户消息」。
 * 历史消息保持纯文本，避免多模态内容块被反复重放。
 */
export function augmentMessagesWithAttachments<T extends { role: string; content?: any }>(
  messages: T[],
  prepared: PreparedAttachments
): AugmentResult<T> {
  const hasAttachment = prepared.images.length > 0 || prepared.texts.length > 0 || prepared.skipped.length > 0;
  if (!hasAttachment || messages.length === 0) return { messages, usedImages: false };

  let lastUser = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      lastUser = i;
      break;
    }
  }
  if (lastUser < 0) return { messages, usedImages: false };

  const original = messages[lastUser];
  const baseText = typeof original.content === 'string' ? original.content : '';

  const fileSections = prepared.texts.map(
    (t) => `<file name="${t.name}">\n${t.content}\n</file>`
  );

  const skippedNote = prepared.skipped.length
    ? `【以下附件未能解析，请如实告知用户你没有读到它们】\n` +
      prepared.skipped.map((s) => `- ${s.name}：${s.reason}`).join('\n')
    : '';

  const textContent = [baseText, ...fileSections, skippedNote].filter(Boolean).join('\n\n');

  const next = [...messages];
  if (prepared.images.length > 0) {
    next[lastUser] = {
      ...original,
      content: [
        { type: 'text', text: textContent },
        ...prepared.images.map((img) => ({ type: 'image_url', image_url: { url: img.url } })),
      ],
    } as T;
    return { messages: next, usedImages: true };
  }

  next[lastUser] = { ...original, content: textContent } as T;
  return { messages: next, usedImages: false };
}

/** 接入点不支持图片输入时的降级：把 image_url 块换成文字说明，并保留文本 */
export function dropImageParts<T extends { role: string; content?: any }>(messages: T[], reason: string): T[] {
  return messages.map((m) => {
    if (!Array.isArray(m.content)) return m;
    const texts = m.content
      .filter((part: any) => part?.type === 'text')
      .map((part: any) => String(part.text || ''));
    const imageCount = m.content.filter((part: any) => part?.type === 'image_url').length;
    const note = imageCount
      ? `【本次提问附带了 ${imageCount} 张图片，但当前模型接入点不支持图片输入，已忽略：${reason}】`
      : '';
    return { ...m, content: [texts.join('\n\n'), note].filter(Boolean).join('\n\n') } as T;
  });
}
