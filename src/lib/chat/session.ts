/**
 * AI 智能助理的对话记录持久化（浏览器端会话存储）
 *
 * 产品需求：
 *   1. 在系统内切换页面 / 刷新页面 → 对话记录保留，用户不用重新描述需求；
 *   2. 关闭浏览器标签页 → 自动清除（sessionStorage 本身的生命周期就是这样）；
 *   3. 切换登录用户 → 立即清除，避免把上一位用户的对话带给下一位用户。
 *
 * 所以这里用 sessionStorage（同一标签页内跨页面/刷新保留，关标签页即销毁），
 * 并额外记录这份对话「属于哪个用户」：
 *   - 挂载时先取当前登录用户 id，再调用 loadChat()；
 *     若存档里的 owner 与当前用户不一致 → 清空存档并返回空对话；
 *   - 取不到当前用户（接口异常）时不做比对，避免误清用户的对话。
 *
 * 纯函数 + StorageLike 结构类型，不依赖 window，方便在 node 脚本里用假 storage 跑测试
 * （见 scripts/test-chat-session.ts）。
 */

/** 对话内容（JSON 字符串）在 sessionStorage 里的键，沿用线上已有键名以便平滑升级 */
export const CHAT_MESSAGES_KEY = 'agent_chat_messages';

/** 这份对话归属的用户 id */
export const CHAT_OWNER_KEY = 'agent_chat_owner';

/** sessionStorage / localStorage 的最小结构（便于测试注入假实现） */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** 读取存档归属的用户 id；没有或读取失败返回 null */
export function readChatOwner(storage: StorageLike): string | null {
  try {
    const owner = storage.getItem(CHAT_OWNER_KEY);
    return owner && owner.length > 0 ? owner : null;
  } catch {
    return null;
  }
}

/** 读取存档的对话；没有、格式不对或读取失败一律返回空数组（不抛异常） */
export function readChatMessages<T>(storage: StorageLike): T[] {
  try {
    const raw = storage.getItem(CHAT_MESSAGES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

/** 清空存档（对话 + 归属信息）。用户点「清空对话」或检测到换用户时调用 */
export function clearChat(storage: StorageLike): void {
  try {
    storage.removeItem(CHAT_MESSAGES_KEY);
  } catch {
    /* 隐私模式等场景下可能不允许写入，忽略 */
  }
  try {
    storage.removeItem(CHAT_OWNER_KEY);
  } catch {
    /* 同上 */
  }
}

/**
 * 载入对话。
 *
 * @param storage       一般是 window.sessionStorage（也可传假实现做测试）
 * @param currentUserId 当前登录用户 id；拿不到时传 null（此时只读不比对、不清空）
 * @returns messages 要展示的对话；cleared 是否因为「换用户」而清空了存档
 */
export function loadChat<T>(
  storage: StorageLike,
  currentUserId: string | null
): { messages: T[]; cleared: boolean } {
  const owner = readChatOwner(storage);

  // 明确了当前用户、且与存档归属不一致 → 视为切换用户，清掉上一位的对话
  if (currentUserId && owner && owner !== currentUserId) {
    clearChat(storage);
    return { messages: [], cleared: true };
  }

  // 首次使用（没有 owner）或同一用户 → 正常恢复
  return { messages: readChatMessages<T>(storage), cleared: false };
}

/**
 * 保存对话（同时记下归属用户，供下次切换用户时比对）。
 * 写入失败（配额不足 / 隐私模式）静默忽略，不影响界面使用。
 */
export function saveChat<T>(storage: StorageLike, currentUserId: string | null, messages: T[]): void {
  try {
    storage.setItem(CHAT_MESSAGES_KEY, JSON.stringify(messages));
  } catch {
    return; // 内容没存进去就别再单独改 owner，避免出现「有归属没内容」的怪状态
  }
  if (!currentUserId) return;
  try {
    storage.setItem(CHAT_OWNER_KEY, currentUserId);
  } catch {
    /* 忽略：owner 没记上也不影响本次会话，只是下次无法比对用户 */
  }
}
