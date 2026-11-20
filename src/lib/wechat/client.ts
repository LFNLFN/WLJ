/**
 * 微信小程序服务端接口（订阅消息）
 *
 * 需要的环境变量：
 *   WECHAT_APPID                     小程序 AppID（默认已内置 wx12e2c2c561b0055f）
 *   WECHAT_APPSECRET                 小程序 AppSecret（必填，只放服务端）
 *   WECHAT_CONSULT_TEMPLATE_ID       专家预约通知模板 ID（默认已内置）
 *   WECHAT_CONSULT_LONG_TERM         设为 1 表示模板是长期订阅；默认一次性订阅
 *   WECHAT_MINIPROGRAM_STATE         点击消息打开的小程序版本，默认 formal
 *
 * 注意：AppSecret 不写进代码，也不下发给小程序。
 */

export const DEFAULT_WECHAT_APPID = 'wx12e2c2c561b0055f';
export const DEFAULT_CONSULT_TEMPLATE_ID = 'YpfZDw3xEgJRcQ_YYvNDYLyWclZvEGuFPp0ynqkSHwY';

const TOKEN_KEY = '__wljWechatToken';

export interface WechatConfig {
  appid: string;
  secret: string;
  templateId: string;
  longTerm: boolean;
}

export function getWechatConfig(): WechatConfig {
  return {
    appid: process.env.WECHAT_APPID || DEFAULT_WECHAT_APPID,
    secret: process.env.WECHAT_APPSECRET || '',
    templateId: process.env.WECHAT_CONSULT_TEMPLATE_ID || DEFAULT_CONSULT_TEMPLATE_ID,
    longTerm: process.env.WECHAT_CONSULT_LONG_TERM === '1',
  };
}

async function fetchJson(url: string, options?: RequestInit): Promise<any> {
  const res = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('微信接口返回非 JSON：' + text.slice(0, 200));
  }
}

/** 获取 access_token（进程内缓存，提前 5 分钟过期） */
export async function getAccessToken(): Promise<string> {
  const config = getWechatConfig();
  if (!config.secret) throw new Error('未配置 WECHAT_APPSECRET');

  const g = globalThis as unknown as Record<string, { token: string; expiresAt: number } | undefined>;
  const cached = g[TOKEN_KEY];
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const url =
    'https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential' +
    '&appid=' + encodeURIComponent(config.appid) +
    '&secret=' + encodeURIComponent(config.secret);
  const data = await fetchJson(url);
  if (data.errcode || !data.access_token) {
    throw new Error(`微信 access_token 获取失败（${data.errcode || 'unknown'}）：${data.errmsg || ''}`);
  }
  const token = String(data.access_token);
  const expiresIn = Number(data.expires_in) || 7200;
  g[TOKEN_KEY] = { token, expiresAt: Date.now() + Math.max(60, expiresIn - 300) * 1000 };
  return token;
}

/** wx.login 的 code 换取 openid */
export async function code2Session(code: string): Promise<{ openid: string; unionid: string }> {
  const config = getWechatConfig();
  if (!config.secret) throw new Error('未配置 WECHAT_APPSECRET');
  if (!code) throw new Error('缺少 wx.login 的 code');

  const url =
    'https://api.weixin.qq.com/sns/jscode2session?appid=' + encodeURIComponent(config.appid) +
    '&secret=' + encodeURIComponent(config.secret) +
    '&js_code=' + encodeURIComponent(code) +
    '&grant_type=authorization_code';
  const data = await fetchJson(url);
  if (data.errcode || !data.openid) {
    throw new Error(`微信登录凭证校验失败（${data.errcode || 'unknown'}）：${data.errmsg || ''}`);
  }
  return { openid: String(data.openid), unionid: String(data.unionid || '') };
}

function clip(value: unknown, max: number): string {
  const text = String(value == null ? '' : value).trim();
  return text.length > max ? text.slice(0, max) : text;
}

/** 按“专家预约通知”模板组装 data */
export function buildConsultTemplateData(appointment: any) {
  const date = String(appointment.preferredDate || '');
  const time = String(appointment.preferredTime || '00:00');
  const phone = String(appointment.phone || '').replace(/[^\d+]/g, '');
  const notes = appointment.notes || appointment.childName
    ? `孩子：${appointment.childName || '未填写'}；${appointment.notes || ''}`
    : '家长提交了咨询预约';

  return {
    name2: { value: clip(appointment.parentName || '家长', 10) },
    phone_number3: { value: phone.slice(0, 17) },
    date4: { value: clip(`${date} ${time}`, 32) },
    name5: { value: clip(appointment.topic || '咨询预约', 10) },
    thing6: { value: clip(notes, 20) },
  };
}

/** 发送“专家预约通知”订阅消息 */
export async function sendConsultSubscribeMessage(openid: string, appointment: any) {
  const config = getWechatConfig();
  const token = await getAccessToken();
  const url = 'https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=' + encodeURIComponent(token);

  const body: any = {
    touser: openid,
    template_id: config.templateId,
    page: 'pages/teacher-consult/teacher-consult',
    data: buildConsultTemplateData(appointment),
    miniprogram_state: process.env.WECHAT_MINIPROGRAM_STATE || 'formal',
    lang: 'zh_CN',
  };

  const data = await fetchJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (data.errcode) {
    throw new Error(`订阅消息发送失败（${data.errcode}）：${data.errmsg || ''}`);
  }
  return data;
}
