#!/usr/bin/env bash
# 火山方舟「托管智能体」会话实时监控（bash 版，等价于 npm run session:watch）
#
# 用法：
#   bash scripts/session-watch.sh "王小明的出生日期是什么？"     # 新建会话（用完即删）
#   bash scripts/session-watch.sh "接着问下一句" sesn-xxxx       # 复用会话
#   KEEP=1 bash scripts/session-watch.sh "问题"                  # 保留新建的会话
#   TIMEOUT=180 bash scripts/session-watch.sh "问题"             # 兜底超时，默认 120s
#
# ⚠️ 实测：会话回到 idle 之后 SSE 连接**不会**自动断开（只继续发 `: heartbeat`），
#    所以必须自己从帧里发现 `session.status_idle` 才结束 —— 否则 `wait $STREAM_PID` 会一直挂着。
#
# 只读业务数据；新建的临时会话默认在结束时删除。

set -uo pipefail
# ⚠️ 变量后面紧跟中文全角字符时必须写成 ${VAR}：
#    "会话 $SID（新建）" 在部分 locale 下会被 bash 当成变量名 SID（ → unbound variable
cd "$(dirname "$0")/.." || exit 1
if [ -f .env.local ]; then set -a; . ./.env.local; set +a; fi

BASE="${ARK_BASE_URL:-https://ark.cn-beijing.volces.com/api/v3}"
Q="${1:-王小明的出生日期是什么？}"
SID="${2:-}"
KEEP="${KEEP:-0}"
TIMEOUT="${TIMEOUT:-120}"
DONE="$(mktemp -t wlj-session-watch.XXXXXX)"
auth=(-H "Authorization: Bearer ${ARK_API_KEY:-}")

# 1) 没有指定会话就新建
CREATED=0
if [ -z "$SID" ]; then
  SID=$(curl -s -X POST "$BASE/sessions" -H "Content-Type: application/json" "${auth[@]}" \
        -d "{\"environment_id\":\"${ARK_ENVIRONMENT_ID:-}\",\"agent\":\"${ARK_AGENT_ID:-}\",\"vault_ids\":[\"${ARK_VAULT_ID:-}\"]}" \
        | python3 -c 'import json,sys
try: print(json.load(sys.stdin).get("id",""))
except Exception: print("")')
  [ -n "$SID" ] || { echo "❌ 建会话失败（检查 ARK_API_KEY / ARK_AGENT_ID / ARK_ENVIRONMENT_ID / ARK_VAULT_ID）"; exit 1; }
  CREATED=1
  echo "会话 ${SID}（新建，结束会删除）"
else
  echo "会话 ${SID}（复用）"
fi
echo "问题 ${Q}"
echo "------------------------------------------------------------------------------"

# 2) 后台开 SSE 流：逐帧打印带相对时间，收到 idle 就写「完成标记」并退出
#    （超时由 python 的 SIGALRM 自限，不依赖外部 kill，避免留后台孤儿进程）
stream() {
  DONE="$DONE" TIMEOUT="$TIMEOUT" \
  curl -sN "$BASE/sessions/$SID/events/stream" "${auth[@]}" -H "Accept: text/event-stream" \
  | DONE="$DONE" TIMEOUT="$TIMEOUT" python3 -u -c '
import os, sys, json, time, signal

done = os.environ["DONE"]

def on_alarm(*_):
    raise SystemExit(0)

signal.signal(signal.SIGALRM, on_alarm)
signal.alarm(int(os.environ.get("TIMEOUT", "120")))
t0 = time.time()
try:
    for line in sys.stdin:
        line = line.rstrip("\n")
        if line.startswith(":"):
            print("+%6.0fms  %s（心跳）" % ((time.time() - t0) * 1000, line), flush=True)
            continue
        if not line.startswith("data: "):
            continue
        try:
            e = json.loads(line[6:])
        except Exception:
            continue
        txt = " ".join(c.get("text", "") for c in (e.get("content") or []) if isinstance(c, dict)).replace("\n", " ")
        print("+%6.0fms  %-32s %s" % ((time.time() - t0) * 1000, e.get("type", "?"), txt[:120]), flush=True)
        if "status_idle" in e.get("type", ""):
            break
finally:
    open(done, "w").write("done")
'
}
stream & STREAM_PID=$!
sleep 1   # 等流建立，避免漏掉最早的帧

# 3) 提问
curl -s -X POST "$BASE/sessions/$SID/events" -H "Content-Type: application/json" "${auth[@]}" \
  -d "{\"events\":[{\"type\":\"user.message\",\"content\":[{\"type\":\"text\",\"text\":\"$Q\"}]}]}" > /dev/null

# 4) 等「完成标记」（本轮 idle）或兜底超时
waited=0
while [ ! -s "$DONE" ] && [ "$waited" -lt "$TIMEOUT" ]; do
  sleep 1
  waited=$((waited + 1))
done
[ -s "$DONE" ] || echo "⚠️ ${TIMEOUT}s 内没等到 idle（可用 TIMEOUT=180 放宽）"
echo "------------------------------------------------------------------------------"

# 5) 取最终回答
curl -s "$BASE/sessions/$SID/events?limit=500" "${auth[@]}" | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin).get("data", [])
except Exception:
    data = []
msgs = [" ".join(c.get("text", "") for c in (e.get("content") or []) if isinstance(c, dict))
        for e in data if e.get("type") == "agent.message"]
print("最终回答：")
print(msgs[-1].strip() if msgs else "(没有 agent.message)")
print("\n共 %d 条事件" % len(data))
'

# 6) 收尾
if [ "$CREATED" = "1" ] && [ "$KEEP" != "1" ]; then
  curl -s -X DELETE "$BASE/sessions/$SID" "${auth[@]}" > /dev/null
  echo "临时会话 ${SID} 已删除（KEEP=1 可保留）"
fi
rm -f "$DONE"
