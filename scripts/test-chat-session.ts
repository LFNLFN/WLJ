/**
 * AI 智能助理「对话记录持久化」逻辑测试（src/lib/chat/session.ts）。
 *
 * 对应产品需求：
 *   - 切换页面 / 刷新页面：对话保留
 *   - 关闭浏览器标签页：清空（sessionStorage 生命周期）
 *   - 切换登录用户：清空，不把上一位用户的对话带给下一位
 *
 * 运行方式（package.json 的 test:chat-session 脚本）：
 *   npx tsc scripts/test-chat-session.ts --outDir .agent-test-build --module commonjs \
 *     --target es2020 --moduleResolution node --esModuleInterop --skipLibCheck --resolveJsonModule
 *   node .agent-test-build/scripts/test-chat-session.js
 *
 * 纯内存假 storage，不依赖浏览器 / 数据库。
 */

import {
  CHAT_MESSAGES_KEY,
  CHAT_OWNER_KEY,
  clearChat,
  loadChat,
  readChatOwner,
  saveChat,
  type StorageLike,
} from '../src/lib/chat/session';

/** 假 sessionStorage；新建一个实例即等价于「换了一个标签页 / 关掉重开」 */
class FakeStorage implements StorageLike {
  private map = new Map<string, string>();
  /** 模拟隐私模式 / 配额不足：开启后写入抛错 */
  failWrites = false;

  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error('QuotaExceededError');
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  keys(): string[] {
    return Array.from(this.map.keys()).sort();
  }
  /** 直接塞入原始字符串（模拟旧版本存档 / 损坏数据） */
  seed(key: string, value: string): void {
    this.map.set(key, value);
  }
}

interface Msg {
  role: 'user' | 'assistant';
  content: string;
}
const say = (role: Msg['role'], content: string): Msg => ({ role, content });

const USER_A = 'user-a';
const USER_B = 'user-b';

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

function main() {
  console.log('\n== 1. 首次使用 / 基本存取 ==');
  const s1 = new FakeStorage();
  const first = loadChat<Msg>(s1, USER_A);
  check('空存档返回空对话，且不算「换用户」', first.messages.length === 0 && first.cleared === false, first);

  const history: Msg[] = [say('user', '我们机构的课程体系包括哪些课程？'), say('assistant', '包括……')];
  saveChat(s1, USER_A, history);
  check('保存后写入了对话存档', s1.getItem(CHAT_MESSAGES_KEY) !== null, s1.keys());
  check('保存后写入了用户归属', readChatOwner(s1) === USER_A, readChatOwner(s1));

  const reopened = loadChat<Msg>(s1, USER_A);
  check('同一用户能完整恢复对话', JSON.stringify(reopened.messages) === JSON.stringify(history), reopened);

  console.log('\n== 2. 切换页面 / 刷新页面：保留对话 ==');
  // 组件卸载再挂载 = 再跑一次 loadChat（同一个 storage）
  const pageA = loadChat<Msg>(s1, USER_A);
  const pageB = loadChat<Msg>(s1, USER_A);
  check('多次进入页面都保留对话', pageA.messages.length === 2 && pageB.messages.length === 2, [pageA, pageB]);
  check('多次进入页面都不会清空存档', s1.getItem(CHAT_MESSAGES_KEY) !== null);

  const newer: Msg[] = [...history, say('user', '把学生名单导出成 Excel')];
  saveChat(s1, USER_A, newer);
  check('继续提问后恢复的是最新记录', loadChat<Msg>(s1, USER_A).messages.length === 3);

  console.log('\n== 3. 切换用户：清空上一位用户的对话 ==');
  const switched = loadChat<Msg>(s1, USER_B);
  check('换用户后返回空对话且标记已清空', switched.messages.length === 0 && switched.cleared === true, switched);
  check('换用户后对话存档已删除', s1.getItem(CHAT_MESSAGES_KEY) === null, s1.keys());
  check('换用户后归属信息已删除', readChatOwner(s1) === null, s1.keys());

  const bHistory: Msg[] = [say('user', '统计一下各表数据量')];
  saveChat(s1, USER_B, bHistory);
  check('用户 B 的对话归属 B', readChatOwner(s1) === USER_B);
  check('用户 B 能恢复自己的对话', loadChat<Msg>(s1, USER_B).messages.length === 1);
  // 前面 A 的对话此时已不存在，A 回来也是空的
  check('用户 A 换回后不会看到 B 的对话', loadChat<Msg>(s1, USER_A).messages.length === 0);

  console.log('\n== 4. 取不到当前用户：只读不比对、不误清 ==');
  const s2 = new FakeStorage();
  saveChat(s2, USER_A, history);
  const unknown = loadChat<Msg>(s2, null);
  check('未知当前用户时仍能恢复对话', unknown.messages.length === 2 && unknown.cleared === false, unknown);
  check('未知当前用户时归属信息保持不变', readChatOwner(s2) === USER_A);
  saveChat(s2, null, [...history, say('assistant', '补充一句')]);
  check('未知当前用户时保存不会清掉已有归属', readChatOwner(s2) === USER_A, s2.keys());
  check('未知当前用户时对话内容照常更新', loadChat<Msg>(s2, USER_A).messages.length === 3);

  console.log('\n== 5. 关闭浏览器标签页：新标签页是干净会话 ==');
  const afterTabClose = new FakeStorage(); // sessionStorage 随标签页销毁，新标签页是空的
  const fresh = loadChat<Msg>(afterTabClose, USER_A);
  check('新标签页没有旧对话', fresh.messages.length === 0 && fresh.cleared === false, fresh);

  console.log('\n== 6. 脏数据 / 兼容 / 异常写入 ==');
  const s3 = new FakeStorage();
  s3.seed(CHAT_MESSAGES_KEY, '{ 这不是合法 JSON');
  const broken = loadChat<Msg>(s3, USER_A);
  check('存档损坏时返回空对话且不抛异常', broken.messages.length === 0, broken);

  const s4 = new FakeStorage();
  s4.seed(CHAT_MESSAGES_KEY, JSON.stringify(history)); // 旧版本存档：只有对话、没有归属
  const legacy = loadChat<Msg>(s4, USER_A);
  check('兼容旧存档（无归属信息）', legacy.messages.length === 2 && legacy.cleared === false, legacy);
  saveChat(s4, USER_A, legacy.messages);
  check('旧存档补上归属信息', readChatOwner(s4) === USER_A);

  const s5 = new FakeStorage();
  s5.failWrites = true;
  let threw = false;
  try {
    saveChat(s5, USER_A, history);
  } catch {
    threw = true;
  }
  check('写入失败（配额不足）不抛异常', threw === false);
  check('写入失败时不会留下孤立的归属信息', s5.keys().length === 0, s5.keys());

  console.log('\n== 7. 「清空对话」按钮 ==');
  const s6 = new FakeStorage();
  saveChat(s6, USER_A, history);
  clearChat(s6);
  check('清空后两个键都被删除', s6.keys().length === 0, s6.keys());

  console.log('\n----------------------------------------');
  console.log(`通过 ${passed}，失败 ${failed}`);
  if (failed > 0) {
    console.log('失败项：', failures.join('、'));
    process.exit(1);
  }
}

main();
