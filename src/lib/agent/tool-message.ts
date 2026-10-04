/**
 * 工具执行结果 → 回给模型的 tool 消息内容。
 *
 * 为什么单独抽出来（真实事故，2026-10-04）：
 *   线上数据库一直在抖动（TCP 通、但 PG 会话 10s 建不起来，见 README 排障）。
 *   工具失败时，原来的 tool 消息只有一个 `{"ok":false,"error":"Connection terminated due to connection timeout"}`，
 *   模型很容易把它理解成"这份资料不存在 / 我没有权限"，于是回：
 *     · 「系统里没有这名学生的评估记录，建议联系主课老师」
 *     · 「如果你确实需要查看特定学生信息，请向管理员申请相应的数据访问权限」
 *   —— 用户看到的就是这些"敷衍/推责"话术，而真相只是**数据库此刻连不上**。
 *
 * 所以失败时在 tool 消息里显式补一条提示：这是系统侧故障，不代表没有数据，也不代表权限问题；
 * 必须如实告诉用户"暂时查不到、稍后重试"，不许解释成权限或数据不存在。
 */

import type { ToolExecutionResult } from './types';

/** 失败时附加给模型的说明（不要改成"可能没有权限"之类的措辞） */
export const TOOL_FAILURE_NOTE =
  '【系统提示·给模型看】本轮工具调用**失败**了，失败原因是系统/数据库侧故障（不是"没有数据"，' +
  '也不是权限或角色问题）。回答时必须如实说明"系统暂时查不了，请稍后重试"，' +
  '并说明是系统故障；**不要**用「没有权限 / 请向管理员申请权限 / 联系 XX 老师查询 / 系统里没有这个学生」' +
  '之类的说法来顶替，也不要把这次失败当成"资料不存在"的依据。';

/**
 * 把执行结果序列化成 tool 消息内容。
 * 成功：原样返回工具结果；失败：在原有信息上补 TOOL_FAILURE_NOTE。
 */
export function toolResultPayload(result: ToolExecutionResult): string {
  if (result.ok) {
    return JSON.stringify(result.result ?? { ok: true });
  }
  const error = (result as { error?: string }).error;
  return JSON.stringify({
    ok: false,
    error,
    hint: TOOL_FAILURE_NOTE,
  });
}
