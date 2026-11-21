/**
 * 评估记录批阅接口（单独成模块）
 *
 * 从 `@/lib/api` 拆出来，避免页面热更新/增量构建时出现
 * `reviewStudentScaleRecord is not a function` 的陈旧模块问题。
 */
const API_BASE = '/api';

export async function reviewStudentScaleRecord(
  id: string,
  payload: { comment?: string; status?: 'reviewed' | 'pending' }
) {
  const res = await fetch(`${API_BASE}/student-scale-records/${encodeURIComponent(id)}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `批阅失败（${res.status}）`);
  }
  return data;
}
