/**
 * 宽松 JSON 解析：模型偶尔会在字符串里输出未转义的换行/制表符，
 * 直接 JSON.parse 会报 "Bad control character"。这里先把字符串内的控制字符
 * 转义，再解析；同时去掉 markdown 代码块/前后说明。
 */
export function parseLooseJson(text: string): any {
  let body = String(text || '').trim();
  body = body.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('模型没有返回有效 JSON');
  let raw = body.slice(start, end + 1);

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

  return JSON.parse(fixed);
}
