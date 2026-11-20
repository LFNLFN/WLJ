import { getWechatConfig, sendConsultSubscribeMessage } from './client';
import { resolveNotifyTeacherIds } from './recipients';

/**
 * 家长提交预约后，给固定名单内的教师发送微信订阅消息。
 *
 * 名单来自 CONSULT_NOTIFY_TEACHER_IDS / CONSULT_NOTIFY_TEACHER_PHONES；
 * 不在名单内的教师不会收到，也不会看到订阅授权入口。
 * 失败只记日志，不影响预约保存。
 */
export async function notifyConsultAppointment(db: any, appointment: any) {
  const config = getWechatConfig();
  if (!config.secret) {
    console.warn('[wechat] 未配置 WECHAT_APPSECRET，跳过订阅消息发送');
    return { sent: 0, skipped: 'no-secret' };
  }

  const notifyIds = await resolveNotifyTeacherIds(db);
  if (notifyIds.length === 0) {
    console.warn('[wechat] 未配置咨询预约通知教师名单，跳过发送');
    return { sent: 0, skipped: 'no-recipients' };
  }

  const params: any[] = [notifyIds];
  let sql = `SELECT b."userId", b.openid, b.remaining, u.name, u.role
               FROM wechat_bindings b
               JOIN users u ON u.id = b."userId"
              WHERE b.openid <> ''
                AND u.status = 'active'
                AND u.role IN ('teacher', 'therapist', 'admin')
                AND b."userId" = ANY($1::text[])`;

  if (!config.longTerm) {
    sql += ' AND b.remaining > 0';
  }

  const targets = await db.query(sql, params);
  let sent = 0;

  for (const target of targets.rows) {
    try {
      await sendConsultSubscribeMessage(target.openid, appointment);
      sent += 1;
      if (!config.longTerm) {
        await db.query(
          `UPDATE wechat_bindings
              SET remaining = GREATEST(remaining - 1, 0), "updatedAt" = $2
            WHERE "userId" = $1`,
          [target.userId, new Date().toISOString()]
        );
      }
      console.log(`[wechat] 预约通知已发送给 ${target.name || target.userId}`);
    } catch (err: any) {
      console.warn(`[wechat] 预约通知发送失败（${target.name || target.userId}）：`, err?.message || err);
    }
  }

  return { sent, total: targets.rows.length };
}
