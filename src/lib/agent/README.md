# 服务端智能体工具执行层

把 `src/lib/agent-tools.ts` 里的能力包装成"工具"，交给大模型进行 function calling，
并由服务端统一执行。核心关注点：**参数校验、超时、异常兜底、结果结构化**。

## 组成

| 文件 | 职责 |
| --- | --- |
| `../agent-tools.ts` | 工具底层实现（知识库检索 / 数据库查询 / 文件生成）+ `getAgentConfigStatus()` |
| `types.ts` | 工具相关类型（`ToolDefinition`、`ToolExecutionResult` 等） |
| `registry.ts` | 工具注册表：schema 定义 + handler 绑定，`listToolSchemas()` 供大模型使用 |
| `execute.ts` | 执行器：`executeTool()` 完成参数归一化 → schema 校验 → 超时 → 执行 → 统一错误结构 |
| `context.ts` | 调用者身份上下文（AsyncLocalStorage，`runWithAgentContext` / `callerLine`） |
| `identity.ts` | 从请求解析调用者身份（`x-user-*` 头 → 兜底验签会话 Cookie/Bearer）、`callerSystemLine`、权限拒绝话术兜底 |

## 已有工具

- `search_knowledge_base(query)`：检索内部知识库。**默认走库内检索**（课程 / 量表 / 课堂记录 / 教案 / 训练计划 /
  平台上「📚 知识库」上传的 `knowledge_documents`），不依赖外部凭证；若配置了方舟知识库接入方式则额外合并其结果，
  未配置或调用失败会自动降级并给出 `notice`
  - 检索方式：把问题切成检索词（英文/数字串、中文串、长中文串补 2-gram，去掉「怎么 / 什么 / 哪些」等停用词），
    词之间 OR 匹配、按命中词数排序；只要查询里有 ≥3 字的「强检索词」，就要求结果至少命中一个强词——
    否则「问题」「完全」这类通用 2-gram 会把整张表都捞出来
  - **方式零（推荐，最划算）`KB_API_KEY`：直连「火山知识库」服务**，拿的是**原文切片**（不是生成好的回答），
    百毫秒级返回，最合适塞进对话上下文：
    `POST https://api-knowledgebase.mlp.cn-beijing.volces.com/api/knowledge/collection/search_knowledge`
    请求头 `Authorization: Bearer <知识库 API Key>`，请求体
    `{ name（知识库名）, resource_id（方舟里的 kb-xxx）, query, project: 'default', limit, dense_weight }`，
    返回 `data.result_list[]`（`chunk_title` / `content` / `score` / `rerank_score` / `point_id` / `doc_info`）。
    接口清单与字段来自官方 SDK `volcengine/viking_knowledgebase`（v1.0.228）；
    该服务上还有 `collection/search`（可带 rerank）、`collection/search_and_generate`（检索+生成带依据的回答）、
    `service/rerank`、`chat/completions`、以及 `doc/{add,list,...}`、`point/{add,list,...}`、`collection/{create,list,...}`
    （**所以知识库文档是可以程序化写入的**，与早期 README 里「方舟开放接口没有文档上传路径」的结论不同）。
    鉴权两种：① Bearer 知识库 API Key（本项目用这个，服务器上只需一个环境变量）；
    ② 官方 SDK 的 AK/SK V4 签名（service 名为 `"air"`）。
    验证：`npm run kb:doctor`（ping → collection/list → search_knowledge 三步实测）、`npm run test:kb-api`（本地 mock 测接线）
  - 方式一（兜底）`ARK_AGENT_ID` + `ARK_ENVIRONMENT_ID` + `ARK_VAULT_ID`：方舟「托管智能体 (Managed Agents)」。
    会话来源：**显式 `ARK_SESSION_ID` 优先**（沿用该会话上下文）；没设才用 environment+vault 自动新建临时会话、用完即删。
    **事件监控默认走 SSE**：`GET /sessions/{id}/events/stream`（`text/event-stream`，帧是 `data: {json}` + 空行，
    `: ready` 为心跳）——实时、不用每 3 秒轮询、也没有下面那个"只看前 50 条"的窗口问题；
    流建不起来时自动退回轮询。`ARK_SESSION_STREAM=0` 可强制走轮询。
    ⚠️ 读事件必须带 `?limit=`：`GET /sessions/{id}/events` **默认只返回前 50 条**（实测 `limit` 到 5000 可用）。
    会话事件超过 50 条后，新事件就落在窗口外，轮询永远"看不到"新内容直到超时 ——
    表现为「明明已经答完，却报方舟智能体未返回结果」。本项目固定带 `?limit=`（`ARK_EVENTS_LIMIT`，默认 500）。
    事件解析：`agent.message` 取最终回答；`agent.tool_result` 里是知识库 Skill 的 `search_knowledge` 响应体
    （`{"data":{"result_list":[{"id","content"}]}}`），会被解析成 `source=ark-kb` 的**原文切片**一起返回；
    `agent.thinking` 里出现「限流」时会写进 `notice`。超时但有切片时仍返回 `ok:true` + 不完整提示。
    知识库以 Skill（`viking-knowledge-search`）挂在智能体上：`POST /sessions/{id}/events` 发问题 →
    轮询 `GET /sessions/{id}/events` 取 `agent.message`。每次检索新建干净会话（绑定 vault 里的 Viking 凭证）并删除，
    也可用 `ARK_SESSION_ID` 复用固定会话。⚠️ 它返回的是**生成好的回答**且**慢**（实测 10~56 秒）
  - 方式二 `ARK_BOT_ID`：方舟「应用(Bot)」，走 `POST /api/v3/bots/chat/completions`
  - 方式三 `ARK_KB_ENDPOINT`：自建 / 兼容的检索接口，请求体 `{ knowledge_base_id, query, top_k }`
  - 优先级：配了 `KB_API_KEY` 就先走方式零；失败（key 或知识库名不对）自动降级到方式一，并把两条原因都写进 `notice`
  - ⚠️ 注意区分：方舟宿主机 `ark.cn-beijing.volces.com/api/v3/knowledge/*` 确实全部 404（实测），
    但知识库是**独立服务域名**（`api-knowledgebase.mlp.cn-beijing.volces.com`），不要因为前者 404 就以为没有知识库接口
  - ⚠️ 托管智能体依赖会话绑定的 vault 凭证；凭证无效时 Skill 会返回 `authentication_error / invalid api key`，
    此时工具仍返回回答，但会附带 `notice` 说明该回答不基于知识库
- `query_database(action, params)`：查询业务库（`stats` 或表名；支持 `id` / `search` / `limit` / `offset`）
- `generate_file(type, filename, content)`：生成 Excel(`excel`) / Word(`word`) / **PPT(`ppt`)** 并返回下载地址
  - `ppt` 的 content：`{ title, subtitle, slides:[{ title, bullets:[…], text, table:{headers,rows} }] }`；
    也可以只给 `{ title, text }` —— 会按 Markdown 的 `#` 标题自动分页（实测封面 + 每页标题/要点/表格都能正确写入 pptx）

### 盯着会话跑：`npm run session:watch` / `bash scripts/session-watch.sh`

两个版本（Node / bash）做同一件事；bash 版就是手拼 `curl -N ... &` 那套的成品，踩过两个坑已写在脚本注释里：

1. **会话回到 idle 后 SSE 连接不会自动断开**（只继续发 `: heartbeat`）→ 必须自己从帧里判定
   `session.status_idle` 才结束，否则 `wait $STREAM_PID` 会一直挂到超时（脚本里用 python 的 SIGALRM 自限时）。
2. **变量后面紧跟中文全角字符时必须写 `${VAR}`**：`echo "会话 $SID（新建）"` 在部分 locale 下会被 bash
   当成变量名 `SID（` → `unbound variable`（脚本里全是 `${SID}` 这种写法）。

```bash
bash scripts/session-watch.sh                      # 用内置默认问题
bash scripts/session-watch.sh "问题" sesn-xxxx      # 复用会话
KEEP=1 TIMEOUT=180 bash scripts/session-watch.sh "问题"
```

### 盯着会话跑：`npm run session:watch`

不想手拼 `curl -N` 的话，用脚本：它把「建会话 → 开 SSE 流 → 发 user.message → 逐帧打印 → 打最终回答」
连起来，并给每帧标注相对时间（新建的临时会话结束时自动删除）：

```bash
npm run session:watch -- "王小明的出生日期是什么？"
npm run session:watch -- "接着上一条继续" --session sesn-20261004055646-hqst3
npm run session:watch -- "问题" --keep --timeout 90000      # 保留会话 / 放宽超时
```

实测输出（21 帧 / 18.5s）：`: ready` 心跳 → `session.status_running` → `user.message` →
`span.model_request_start|end` 与 `agent.thinking`（多轮、增量）→ `agent.tool_use` + `agent.tool_result`
（知识库检索结果）→ `agent.message` → `session.thread_status_idle`，最后打印最终回答。

### 可选：放开「外部公开资料检索」（默认关闭，草稿已备好）

现在这个助理的职责范围被 `wlj-system-prompt.md` 严格限定在**中心内部业务**，所以「查某某公司财报 / 外部政策」这类问题会被礼貌拒绝（实测行为）。

仓库里已备好一份**可选追加段落**：`src/lib/agent/prompt-addon-external-search.md`
（含来源标注、隐私边界、超出能力直说、交付文件用 `generate_file` 等约束）。默认**不生效**，要显式启用：

```bash
node scripts/push-agent-prompt.js --dry-run --with-external-search   # 先看长度/差异，不推送
node scripts/push-agent-prompt.js --with-external-search             # 确认后推送（自动备份旧配置到 .ark-backup/）
node scripts/push-agent-prompt.js                                    # 不带参数 = 恢复"仅内部"的原行为
```

> 实测：不带参数时 `--dry-run` 显示「内容与线上一致，无需推送」→ 说明线上 agent 未被改动（version 4），
> 只有显式加 `--with-external-search` 才会把 prompt 从 3595 字变成 4254 字。
> `--with <任意文件>` 也可以追加别的段落。

## 使用方式

### 1. 直接执行（服务端）

```ts
import { executeTool } from '@/lib/agent/execute';

const res = await executeTool('query_database', { action: 'students', params: { limit: 10 } });
if (res.ok) console.log(res.result);
else console.error(res.error);
```

执行器永不抛出异常；无论成功失败都返回 `{ ok, name, result | error, elapsedMs }`。

> `TOOL_TIMEOUT_MS` 为 150s：托管智能体带 thinking 且可能多轮检索，实测单次 15~120s。
> 超时只影响等待，不会丢结果；超时返回的回答会带 `notice` 标记为「阶段性、可能不完整」。

### 2. HTTP 接口

```
GET  /api/ai/tools                    # 获取工具 schema 列表
POST /api/ai/tools                    # 执行单个工具
     { "name": "generate_file", "arguments": { ... } }
```

### 3. 接入对话

- `POST /api/chat`：火山方舟对话，自动完成工具调用循环（最多 5 轮）

#### 调用者身份（为什么管理员会被回「没有权限」）

模型与方舟托管智能体**都看不到登录态**。不告诉它们"是谁在问"，遇到学生 / 评估这类数据就会
以「你当前没有访问学生及相关数据的权限」搪塞（实测，管理员也一样）——这句话是模型自己生成的，不在本仓库。

- `/api/chat` 和 `/api/ai/tools` 都先用 `agentContextFromRequest()` 取身份：优先 middleware 透传的
  `x-user-id` / `x-user-role` / `x-user-name`（URL 编码），**拿不到头时用会话 Cookie / `Authorization: Bearer` 验签兜底**；
- `/api/chat` 把 `callerSystemLine()` 拼进 system prompt：说明内部账号 + 平台真实授权模型 + 不得以
  「没有权限 / 无法访问 / 超出岗位范围」为由拒绝；模型**没调工具却直接回权限拒绝话术**时，
  用 `shouldRetryPermissionRefusal()` 补一句权限提醒重问一次（每请求最多一次）；
- 工具执行统一包在 `runWithAgentContext()` 里，`search_knowledge_base` 会把
  `【调用者：姓名（角色），本中心内部登录账号】` 拼进发给托管智能体的问题前。
- 回归测试：`npm run test:kb-api` 第 7 组。

## 功能测试

```bash
npm run test:agent-tools                 # 单元 + 真实库/真实知识库冒烟测试

node scripts/ark-agent-ask.js --list                            # 列出方舟智能体 / 会话
node scripts/ark-agent-ask.js "公司差旅住宿报销标准是多少？"      # 直接和智能体对话
node scripts/check-ark-kb.js <候选ID>                            # 自检某个 ID 是不是绑了知识库的入口

node scripts/push-agent-prompt.js --dry-run                      # 查看将推送到方舟的 system prompt 差异
node scripts/push-agent-prompt.js --name 名称 --description 描述  # 推送（自动备份到 .ark-backup/）

node scripts/init-knowledge-table.js --list                      # 查看平台上「📚 知识库」已上传的资料
```

智能体的 system prompt 源文本在 `wlj-system-prompt.md`（面向未来家儿童康复业务），纳入版本管理；
推送前会自动把线上配置备份到 `.ark-backup/`（已 gitignore）。

测试覆盖：工具注册、参数校验、Excel/Word 生成与落盘、路径穿越防护、
数据库查询（真实库）、知识库异常兜底。

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `ARK_API_KEY` / `ARK_BASE_URL` / `ARK_MODEL_ENDPOINT` | 火山方舟（可选）。`ARK_API_KEY` 形如 `ark-<uuid>-<后缀>` 或纯 UUID；非法或缺失时知识库自动降级为库内检索 |
| `KB_API_KEY` | **推荐**。火山知识库 API Key（控制台「知识库 → API Key」，注意不是 `ark-*` 的方舟 Key）。配了就直连知识库服务检索原文切片 |
| `KB_COLLECTION_NAME` / `KB_RESOURCE_ID` | 可选。知识库名称 / 方舟里的 `kb-xxx`；不填则退回 `ARK_KNOWLEDGE_BASE_ID` |
| `KB_API_HOST` / `KB_PROJECT` / `KB_DENSE_WEIGHT` / `KB_API_TIMEOUT_MS` | 可选。默认 `https://api-knowledgebase.mlp.cn-beijing.volces.com` / `default` / `0.5` / `10000` |
| `ARK_AGENT_ID` / `ARK_ENVIRONMENT_ID` / `ARK_VAULT_ID` | 兜底路径：方舟「托管智能体」。三者配齐即每次检索新建并销毁会话；vault 内需放有效的 Viking 知识库 Key |
| `ARK_SESSION_ID` | 可选，复用固定会话（不配 environment+vault 时生效）。注意会话历史会参与上下文，建议单独用一个检索专用会话 |
| `ARK_AGENT_TIMEOUT_MS` | 可选，单次托管智能体检索的最长等待，默认 110000。带 thinking 时单轮 15~60s，需要多轮检索的问题可能 60~120s |
| `ARK_EVENTS_LIMIT` | 可选，读会话事件时带的 `?limit=`，默认 500（接口默认只有 50，会话一长就会漏掉新事件） |
| `ARK_BOT_ID` | 火山方舟**应用(Bot)** ID（`bot-xxxx`），该应用需在控制台绑定知识库。配置后知识库走 `/bots/chat/completions` |
| `ARK_KNOWLEDGE_BASE_ID` | 方舟知识库 ID（`kb-xxxx`）。**不能**直接被检索，只能被智能体/应用引用 |
| `ARK_KB_ENDPOINT` | 可选，自建 / 兼容的知识库检索接口地址（默认**不再**指向方舟 `/knowledge/search`，该路径不存在） |
| `DATABASE_URL` 等 | 业务数据库（见 `src/lib/api/db.ts`） |
