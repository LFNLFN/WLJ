/**
 * 宽松 JSON 解析：模型偶尔会输出不严格合法的 JSON，常见情况：
 *   1. 字符串里出现未转义的换行/制表符 → "Bad control character"
 *   2. 数组/对象末尾多一个逗号
 *   3. 输出被 max_tokens 截断，缺少结尾的 `]` / `}`
 *
 * 这里先做控制字符转义，再尝试原样解析、去尾逗号、补齐截断结构；
 * 仍然失败时抛错，由调用方决定是否重试模型。
 */
export function parseLooseJson(text: string): any {
  let body = String(text || '').trim();
  body = body.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
  const start = body.indexOf('{');
  if (start < 0) throw new Error('模型没有返回有效 JSON');
  let raw = body.slice(start);
  const end = raw.lastIndexOf('}');
  if (end > 0) raw = raw.slice(0, end + 1);

  const escaped = escapeControlChars(raw);
  const candidates = [
    escaped,
    stripTrailingCommas(escaped),
    closeTruncatedJson(stripTrailingCommas(escaped)),
  ];

  let lastError: any = null;
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`模型返回的 JSON 无法解析: ${lastError?.message || '未知错误'}`);
}

/** 字符串内的换行/制表符/控制字符转义 */
function escapeControlChars(raw: string): string {
  let fixed = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (escaped) {
        fixed += ch;
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        fixed += ch;
        escaped = true;
        continue;
      }
      if (ch === '"') {
        fixed += ch;
        inString = false;
        continue;
      }
      if (ch === '\n') {
        fixed += '\\n';
        continue;
      }
      if (ch === '\r') {
        fixed += '\\r';
        continue;
      }
      if (ch === '\t') {
        fixed += '\\t';
        continue;
      }
      if (ch.charCodeAt(0) < 0x20) {
        fixed += '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0');
        continue;
      }
      fixed += ch;
    } else {
      fixed += ch;
      if (ch === '"') inString = true;
    }
  }
  return fixed;
}

/** 去掉 `,]` / `,}` 这类尾逗号（只处理字符串外的逗号） */
function stripTrailingCommas(raw: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === ',') {
      let j = i + 1;
      while (j < raw.length && /\s/.test(raw[j])) j++;
      if (raw[j] === ']' || raw[j] === '}') continue;
    }
    out += ch;
  }
  return out;
}

/** 输出被截断时，补上未闭合的字符串与 `]` / `}` */
function closeTruncatedJson(raw: string): string {
  let out = raw;
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{' || ch === '[') {
      stack.push(ch);
    } else if (ch === '}' || ch === ']') {
      stack.pop();
    }
  }

  if (inString) {
    if (escaped) out += '\\';
    out += '"';
  }
  for (let i = stack.length - 1; i >= 0; i--) {
    out += stack[i] === '{' ? '}' : ']';
  }
  return out;
}
