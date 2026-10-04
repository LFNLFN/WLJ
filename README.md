# 未来家儿童能力发展中心 - 课程管理系统

## 登录 / 注册（账号体系）

系统已内置账号登录，**不使用短信验证码**：手机号仅作为登录账号，注册信息直接写入**线上数据库**的 `users` 表（本项目只有一个数据库：线上库，不建本地库）。

### 环境变量

| 变量 | 说明 |
|---|---|
| `AUTH_SECRET` | 会话签名密钥，**必填**（≥16 位随机字符串）。未配置时使用内置开发默认值并打印警告，生产环境务必配置 |
| `REGISTER_CODE` | 可选。配置后注册需填写该邀请码（不配置=开放注册） |

```bash
# 生成密钥
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
线上服务器请在服务器的环境变量里配置同名变量（`AUTH_SECRET`、`DATABASE_URL`）。

> **注意**：登录功能需要部署新版代码后才存在。线上域名 `www.weilaijia20210101.com` 若还在跑旧版本，
> `/api/auth/login` 会返回 404 —— 先把本分支部署到线上服务器，并配好 `AUTH_SECRET` 与 `DATABASE_URL`。
>
> 登录接口与其它接口**同源**：都在 `https://www.weilaijia20210101.com/api/` 下，
> 前端一律用相对路径 `/api` 调用，没有第二个 API 域名。

### 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/register` | 注册（name / phone / password / confirmPassword / role / securityQuestion / securityAnswer），成功后自动登录并返回**一次性恢复码** |
| POST | `/api/auth/login` | 登录（phone / password） |
| POST | `/api/auth/logout` | 退出登录（清除会话 Cookie） |
| GET | `/api/auth/me` | 当前登录用户 |
| POST | `/api/auth/password` | 已登录时修改自己的密码（oldPassword / newPassword） |
| POST | `/api/auth/security-question` | 设置 / 更新自己的密保问题 |
| GET | `/api/auth/forgot?phone=` | 找回密码第 1 步：返回该手机号可用的找回方式（密保问题 / 是否有恢复码） |
| POST | `/api/auth/forgot` | 找回密码第 2 步：`{ phone, method: 'security'\|'recovery', answer? / recoveryCode?, newPassword }` |
| GET | `/api/admin/users` | 管理员：用户列表（`?keyword=` 搜索姓名/手机号） |
| PATCH | `/api/admin/users/[id]` | 管理员：调整角色 / 启停账号 |
| POST | `/api/admin/users/[id]/reset-password` | 管理员：重置密码，返回一次性临时密码 |
| POST | `/api/admin/users/[id]/recovery-code` | 管理员：重发恢复码（旧码立即失效） |
| GET | `/api/admin/teacher-accounts` | 管理员：教师账号一览（教师管理页的「登录账号」列） |
| POST | `/api/admin/teachers/[id]/account` | 管理员：`{ action: 'create' \| 'reset' }` 为教师开通账号 / 重置教师密码，返回一次性密码 |

- 密码使用 Node 内置 `crypto.scrypt` 加盐哈希后存储（`scrypt$salt$key`），数据库不保存明文
- 会话为 HMAC-SHA256 签名的 httpOnly Cookie（`wlj_session`，7 天有效）
- 角色：`teacher` 教师 / `therapist` 治疗师 / `admin` 管理员

### users 表

| 列 | 说明 |
|---|---|
| `id` | 主键 |
| `name` | 姓名 |
| `phone` | 手机号（唯一，登录账号） |
| `passwordHash` | 密码哈希 |
| `role` / `status` / `source` | 角色 / 状态（active、inactive）/ 来源 |
| `securityQuestion` / `securityAnswerHash` | 密保问题 / 答案哈希（答案做了去空格、去标点、忽略大小写归一化） |
| `recoveryCodeHash` | 恢复码哈希（明文只在注册成功与管理员重发时各出现一次） |
| `mustChangePassword` | 是否被强制要求改密（管理员重置后置 true，改密后自动清除） |
| `resetFailCount` / `resetLockedUntil` | 找回密码失败次数 / 锁定到期时间（15 分钟） |
| `lastResetAt` / `lastResetBy` | 最近一次密码重置时间 / 操作人（`self` 或管理员 ID） |
| `lastLoginAt` / `createdAt` / `updatedAt` | 最近登录 / 创建 / 更新 |

另有审计表 `password_reset_logs`（`userId` / `phone` / `action` / `operator` / `createdAt`），
记录 `self_change`、`self_security_answer`、`self_recovery_code`、`admin_reset`、`admin_role_change`、
`admin_disable`、`admin_reissue_recovery_code` 等动作。

首次调用注册或登录接口时会自动 `CREATE TABLE IF NOT EXISTS users`（幂等），无需手工建表。

### 访问控制（src/middleware.ts）

- 未登录访问页面 → 302/307 跳转 `/login?next=<原地址>`；登录后自动回到原页面
- 未登录访问 `/api/*` → 401
- **免登录白名单**（切勿随意收紧）：
  - `/api/auth/*` 登录注册本身
  - `/api/health` 部署健康检查
  - `/api/weapp-sync` 小程序同步
  - `/api/student-scale-records` ⚠️ 微信小程序端**直连**写入评估记录（`utils/assessment.js` → `${WLJ_API_BASE}/student-scale-records`），加鉴权会导致小程序保存评估全部失败；若需收紧，请改用小程序专属 Token 请求头方案

## 找回密码 / 管理员重置密码（零第三方、零短信）

因为没有短信/邮件通道，自助找回需要**用户自己保管的凭证**，系统提供两条通道 + 一条兜底：

| 通道 | 用户视角 | 实现 |
|---|---|---|
| 密保问题 | 注册时（或之后在「账号设置」）选一个问题并填答案 | 答案归一化后用 scrypt 哈希存储；忘记密码时在「忘记密码」页回答 |
| 恢复码 | 注册成功后页面展示 `XXXX-XXXX-XXXX`，要求用户自行保存 | 只存哈希；忘记密码时凭它重置（输入不区分大小写、可不带横线） |
| 管理员重置 | 两者都丢了，联系管理员 | 管理员在「用户管理」里一键重置，得到一次性临时密码，用户登录后被强制改密 |

流程与防滥用设计：

- 「忘记密码」页：输入手机号 → 服务端返回该号可用的方式（未注册的手机号不报错，避免批量探测账号）→ 凭凭证 + 新密码提交
- 连续失败 5 次锁定 15 分钟（`resetFailCount` / `resetLockedUntil`，锁定期间即使凭证正确也拒绝），成功即清零
- 管理员重置产生的临时密码为 8 位随机（含大小写与数字），要求线下口头/当面告知；该账号 `mustChangePassword = true`，登录后直接跳到「账号设置」强制改密
- 所有密码变更都写入 `password_reset_logs` 审计表

**管理员菜单可见性**：`/users` 页面对非管理员显示「该功能仅管理员可用」，接口层还会用 `requireAdmin()` 从数据库重新确认角色（不信任 Cookie 里的角色），避免越权。

### 谁会成为管理员

- 系统内**第一个注册的用户自动成为管理员**（否则新部署的系统没人能进用户管理）
- 之后注册时只能选「教师 / 治疗师」，管理员需由现有管理员在「用户管理」中指定
- 管理员不能修改自己的角色或停用自己（避免把自己锁在系统外）
- 可选环境变量 `REGISTER_CODE`：配置后注册必须填写该邀请码，适合内部系统封闭注册

### 后续仍可扩展

- 强制下线：改密后其他设备上的旧会话仍会保留至 7 天有效期结束（如需立即失效，可在会话里加 `tokenVersion` 并在 middleware 校验）
- 登录失败限流（目前仅“找回密码”有限流）
- 评估记录按登录用户隔离（`student_scale_records.userid` 与 `users.id` 打通）
- 角色级权限控制（目前除用户管理外，所有登录用户权限相同）

## 教师管理：开通账号 / 重置教师密码

`teachers`（教师档案）与 `users`（登录账号）是两张表。教师管理页把它们打通了：

- 关联规则：**先按 `users.teacherId`，再按手机号相同**视为同一人（教师先自行注册过也能自动关联）
- 登录账号的手机号 = 教师档案里的「电话」字段，所以**教师必须先填手机号**才能开通账号
- 教师管理页（`/teachers`）对管理员多显示一列「登录账号」（已开通 / 未开通、角色、状态、待改密、最近登录）
- 行内两个操作（仅管理员可见）：
  - **开通账号**：按教师姓名 + 手机号建账号（角色 teacher），生成一次性初始密码，`mustChangePassword = true`
  - **重置密码**：生成新的一次性临时密码，旧密码立即失效，同样要求首次登录后改密
- 两个操作都会写审计日志（`admin_create_account` / `admin_reset_teacher`）
- 非管理员调用这两个接口一律 403（`requireAdmin()` 从数据库核对角色，不信任 Cookie）

> 临时密码只显示一次，页面弹窗提供复制按钮；请线下告知教师本人。

## 小程序端：家长提交 / 教师批阅

微信小程序（`~/Desktop/sensory-integration-app`）首页有「教师入口」，把用户分成两种身份：

| 身份 | 登录 | 能做什么 |
|---|---|---|
| 普通用户（家长） | 不需要登录 | 只能**提交**评估表；只能看到**自己这台设备**提交的记录（`userid` = 小程序设备标识），看不到别人的；不能批阅 |
| 教师 / 治疗师 / 管理员 | 用**未来家课程管理平台的账号密码**（手机号 + 密码）登录 | 能看到**全部**评估记录，可以**批阅**（批阅人由服务端按登录态记录）；登录状态在小程序本地保留 **24 小时**，期间免登录 |

### 小程序是怎么鉴权的

1. `POST /api/auth/login`，body 带 `{ phone, password, client: 'weapp' }` → 响应里除了 `user` 还会返回 `token`；
   Web 端登录（不带 `client`）仍然只用 httpOnly Cookie，不会把 token 暴露给前端 JS。
2. 小程序把 `token` 存本地（含 24 小时过期时间），之后请求带 `Authorization: Bearer <token>`。
3. 服务端 `src/middleware.ts` 与 `src/lib/auth/current.ts` **同时支持** Cookie 和 Bearer token。

### 小程序相关接口

| 方法 | 路径 | 权限 |
|---|---|---|
| POST | `/api/auth/login` | 公开。带 `client: 'weapp'` 时返回 `token` |
| POST | `/api/student-scale-records` | 公开提交，**必须带 `userid`**（家长免登录）；批阅字段一律由服务端忽略 |
| GET | `/api/student-scale-records` | 带会话 → 全部记录，可 `?reviewStatus=pending\|reviewed` 过滤；不带会话 → **必须带 `?userid=`**，只返回该设备的记录，否则 401 |
| GET | `/api/student-scale-records/[id]` | 带会话 → 任意；未登录 → 必须 `?userid=` 且与记录一致，否则 403 |
| PUT | `/api/student-scale-records/[id]` | **必须登录**；不允许改批阅字段 |
| DELETE | `/api/student-scale-records/[id]` | 带会话 → 任意；未登录 → 必须 `?userid=` 且与记录一致 |
| POST | `/api/student-scale-records/[id]/review` | **必须登录且是教师/治疗师/管理员**，body `{ comment, status?: 'reviewed'\|'pending' }` |

`student_scale_records` 新增批阅列：`reviewStatus`（`pending` / `reviewed`）、`reviewComment`、
`reviewerId`、`reviewerName`、`reviewedAt`（代码里幂等 `ALTER TABLE` 自动补，不用手工执行）。

> 批阅人（`reviewerId` / `reviewerName`）**只能取自服务端会话**，并且会从数据库重新核对账号角色，
> 客户端传什么都不认——所以每条批阅都能追溯到具体是哪位老师批的。

> `/api/student-scale-records` 仍留在 middleware 白名单里（家长免登录提交），
> 因此具体的读写权限是在各 route 内部按身份判定的，改动这些接口时请保留这套判定。

### 界面上怎么看批阅结果

- **PC 后台**「量表评估记录」页（`/scales/records`）：新增「批阅状态」「批阅人（含批阅时间）」「批阅意见」三列，
  并支持按批阅状态筛选；顶部统计卡新增「待批阅 / 已批阅」。
- **小程序家长端**「历史评估记录」页：每条记录显示 `⏳ 待批阅` / `✅ 已批阅`（含批阅人与批阅时间），
  有批阅意见时一并显示；统计条新增「待批阅」计数。

## AI 智能助理（首页）：提问附带图片/文件 + 页面内知识库上传

首页 `/` 是 AI 智能助理，由火山方舟模型 + 服务端工具层驱动（工具细节见 `src/lib/agent/README.md`）。

### 提问时附带图片与文件

- 输入框左侧 📎 选择图片/文件（也可直接粘贴图片）；最多 4 个，单个 ≤ 8MB。
- **图片** → 以多模态 `image_url` 内容块发给模型。若接入点不支持图片输入，服务端自动降级为纯文本重试，
  并在回答下方说明「当前模型接入点不支持图片输入，已忽略图片」。
- **文本 / 表格 / Word**（txt、md、csv、json、xlsx、xls、docx …）→ 服务端先抽取文字，再用
  `<file name="…">…</file>` 包住拼进这句提问（历史消息只保留文本，不重放附件）。
- **解析不了的类型**（PDF、旧版 `.doc`、音视频）不会假装读过：会在回答下方明确列出「未解析 + 原因」，
  system prompt 也要求模型如实告知用户没读到该附件。

接口 `POST /api/chat`：body `{ messages, attachments?: [{ name, mimeType, dataUrl }] }`，
返回 `{ reply, steps?, attachments? }`（`attachments` 为附件处理说明；即使模型调用失败也会一并返回）。

### 知识库上传资料（在页面上操作）

页头「📚 知识库」→ 上传文件或粘贴文本 → 选分类入库；支持关键词/分类搜索、查看正文、删除。

- 存储：业务库的 `knowledge_documents` 表（**只存抽取后的纯文本**，不存二进制）。
  首次调用 `/api/knowledge` 时**幂等自动建表**；也可手动跑 `node scripts/init-knowledge-table.js`
  （加 `--list` 只列出已有资料，不建表）。
- 入库的资料会被 AI 工具 `search_knowledge_base` 检索到（返回里 `source = knowledge_documents`），
  上传完直接问助理「我刚传的资料里……」即可。
- 可解析格式：`txt / md / markdown / csv / tsv / json / log / html / xml / yml / yaml / xlsx / xls / xlsm / docx`，
  单文件 ≤ 8MB。PDF、旧版 `.doc` 会返回 400 并说明原因（服务端未安装 PDF 解析库，不做假解析）。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/knowledge?q=&category=&limit=&offset=` | 列表 / 搜索（列表只回传正文预览） |
| GET | `/api/knowledge?id=kb_xxx` | 读取某条资料的完整正文 |
| POST | `/api/knowledge` | JSON `{ title, category, content }`，或 `multipart/form-data` 上传 `file` |
| GET / DELETE | `/api/knowledge/[id]` | 单条资料详情 / 删除 |

> **与「火山知识库」的区别**：上面这套是**平台自己的知识库**（数据在业务库里，随时可读写）。
> 火山知识库是**另一个独立服务**（`api-knowledgebase.mlp.cn-beijing.volces.com`），有完整的检索与文档管理接口，
> 本项目已支持直连检索（见下节）。注意别被 `ark.cn-beijing.volces.com/api/v3/knowledge/*` 的 404 误导——
> 那是方舟宿主机上没有，不代表没有知识库接口。

### 接入火山知识库（直连检索，推荐）

配 **一个环境变量** 就能让助理把火山知识库的内容整合进回答：

| 变量 | 说明 |
|---|---|
### 回答慢？先关掉 thinking

接入点 `doubao-seed-2-1-pro` 是**思考型模型**，默认每轮都先生成一大段 reasoning。同一个问题的实测对比
（`POST /api/v3/chat/completions`，问「用一句话说明你是哪个模型」）：

| 参数 | 耗时 | reasoning_tokens |
|---|---|---|
| 默认（带 thinking） | **7.7s** | 299 |
| `"thinking": {"type": "disabled"}` | **1.1s** | 0 |
| `"thinking": {"type": "auto"}` | 400 InvalidParameter（该模型不支持） | — |

所以 `/api/chat` 现在**默认带上 `thinking: {type:'disabled'}`**（助理主要是「查资料 + 照格式回答」，
不需要长思考）；想恢复模型默认（复杂推理更稳、但慢）就设 `ARK_CHAT_THINKING=default`。
接入点不支持这个字段时会自动去掉参数重试一次，不会因此报错。

| `KB_API_KEY` | 火山知识库 API Key（控制台「知识库 → API Key」生成，**不是** `ark-*` 的方舟 Key） |
| `KB_COLLECTION_NAME` | 知识库名称；不填则退回 `ARK_KNOWLEDGE_BASE_ID` |
| `KB_RESOURCE_ID` | 可选，方舟里的 `kb-xxx`；给了它检索范围更准 |
| `KB_API_HOST` / `KB_PROJECT` / `KB_DENSE_WEIGHT` / `KB_API_TIMEOUT_MS` / `KB_API_RETRY` | 可选，默认 `https://api-knowledgebase.mlp.cn-beijing.volces.com` / `default` / `0.5` / `10000` / `2`（429、5xx 会退避重试；一直限流则如实报错，不再去拖几十秒的托管智能体） |

调用的是 `POST /api/knowledge/collection/search_knowledge`（`Authorization: Bearer <KB_API_KEY>`），
返回 **原文切片**（`chunk_title` / `content` / `score` / `rerank_score`），百毫秒级，直接拼进对话上下文；
比托管智能体那条路（返回生成好的回答、实测 10–56 秒）更适合做问答依据。配了 `KB_API_KEY` 就先走直连，
失败会自动降级到托管智能体，并把两条原因写进 `notice`。

#### 托管智能体会话（`ARK_SESSION_ID`）怎么调

```bash
# 0) 实时监控（推荐）：SSE 事件流，`-N` 关掉 curl 缓冲
curl -N -H "Authorization: Bearer $ARK_API_KEY" -H "Accept: text/event-stream" \
  https://ark.cn-beijing.volces.com/api/v3/sessions/sesn-xxxx/events/stream
# 帧格式（实测）：`data: {"type":"agent.message",...}` + 空行分隔；`: ready` 是心跳注释；
# 事件类型：session.status_running / user.message / span.model_request_start|end /
#           agent.thinking / agent.tool_use / agent.tool_result / agent.message /
#           session.thread_status_idle / session.status_idle
# 本项目默认用 SSE（ARK_SESSION_STREAM=0 可退回轮询）

# 1) 看某个会话已有的事件（可用来确认上一次问答/检索到底干了什么）
curl -H "Authorization: Bearer $ARK_API_KEY" \
  https://ark.cn-beijing.volces.com/api/v3/sessions/sesn-xxxx/events

# 2) 往会话里提问（我们的实现就是这么做的）
#    POST 同一地址，body: { "events":[{"type":"user.message","content":[{"type":"text","text":"问题"}]}] }
#    然后每 3 秒 GET 一次，直到出现 session.status_idle
```

⚠️ **读事件一定要带 `?limit=`**：`GET /sessions/{id}/events` 默认只返回**前 50 条**（实测 `limit` 可到 5000）。
会话事件超过 50 条之后，新事件就落在窗口外 → 轮询永远等不到 `session.status_idle` → 报"超时"，
但服务端其实早就答完了。本项目固定带 `?limit=`（`ARK_EVENTS_LIMIT`，默认 500）。

```bash
curl -s "https://ark.cn-beijing.volces.com/api/v3/sessions/$SID/events?limit=500" \
  -H "Authorization: Bearer $ARK_API_KEY" | python3 -m json.tool | tail -40
```

事件流里值得注意的两类（实测 `sesn-20261004055646-hqst3`）：

- `agent.tool_result`：**知识库 Skill 的检索结果**，里面就是 `search_knowledge` 的响应体
  （`{"ok":true,"data":{"result_list":[{"id":"...","content":"档案编号：WLJ-2024-0001 … 儿童姓名：王小明"}]}}`）。
  本项目现在会把它解析出来，作为 `source=ark-kb` 的**原文切片**一起交给模型 —— 所以即使不配 `KB_API_KEY`，
  模型也能引用知识库原文，而不是只看到一段生成好的回答。
- `agent.thinking` / `agent.message`：推理过程与最终回答（多轮时最终答复取最后一条）。

两个实测过的坑：

1. **显式 `ARK_SESSION_ID` 现在优先**。以前只要配了 `ARK_ENVIRONMENT_ID + ARK_VAULT_ID` 就会自动新建临时会话，
   把你指定的 session 悄悄忽略掉；现在「显式配置 > 自动新建」，想强制每次新建就不要再设 `ARK_SESSION_ID`。
2. **它慢，而且会限流**：一次简单问答 ~10–20s，复杂问题实测 **113s 直接撞超时**，且日志里会出现「检索触发了限流」。
   撞超时时我们仍会把已抓到的原文切片返回（`ok:true`），并附 `notice` 说明回答不完整。想稳定快，就配 `KB_API_KEY` 走直连。

实测（2026-10-04，知识库 `WLJ` / `kb-b26625679831644f`，1 份文档）：

| 方式 | 耗时 | 返回内容 |
|---|---|---|
| 直连 `search_knowledge`（本页方案） | **318~898ms** | 5 条**原文切片**（含 token_usage 统计） |
| 托管智能体会话（`ARK_SESSION_ID`） | 11~25s（复杂问题 100s+） | 生成好的回答（可另从 tool_result 抽切片） |

```bash
# 一条命令看清两个库 + 直连链路（ping → collection/list → search_knowledge → 两个库一览）
npm run kb:doctor            # 默认检索词「知识库里有哪些资料」
npm run kb:doctor "王小明"
# 输出第 [6] 段会分别列出：平台知识库（业务库表）条数 + 火山知识库文档列表，
# 平台库为 0 时会直接提示「PDF 传不进平台库」以及该往哪传
```

> 该服务上还有 `collection/search_and_generate`（检索+生成带依据的回答）、`service/rerank`、
> `chat/completions`，以及 `doc/add`、`point/add`、`collection/create` 等**写入类**接口——
> 也就是说，以后可以把平台「📚 知识库」上传的资料**同步进火山知识库**（当前未实现，留作后续）。
> 接口清单与字段以官方 SDK `volcengine/viking_knowledgebase`（v1.0.228）为准。

### 对话记录保存在哪里（切换页面不丢）

- **切换页面 / 刷新页面 → 保留**：对话存在浏览器 `sessionStorage`（键 `agent_chat_messages`）里，
  从「AI 智能助理」跳到教案 / 学生管理等页面再回来，可以接着上次的上下文继续问，不用重新描述需求。
- **关闭浏览器标签页 → 清空**：用的是 sessionStorage（标签页级生命周期），换个新标签页是干净对话。
- **切换登录用户 → 清空**：存档里额外记了这份对话的归属（键 `agent_chat_owner` = 用户 id）。
  进入页面时先调 `/api/auth/me` 拿当前用户，发现与归属不一致就清掉上一位用户的对话，
  避免同一台电脑换人登录后看到别人的提问（含附件名）；取不到当前用户（接口异常）时保守处理：
  只恢复展示、不清空。恢复完成前不显示旧记录，也不会把欢迎语回写覆盖存档。
- 「🗑️ 清空对话」按钮可随时手动清空；附件里的图片 dataURL 不写入存储，避免撑爆浏览器配额。
- 实现：`src/lib/chat/session.ts`（纯函数 + `StorageLike` 注入，便于测试）配合首页 `src/app/page.tsx`；
  逻辑测试 `npm run test:chat-session`（24 条断言，覆盖「切换页面保留 / 换用户清空 / 关标签页清空 / 脏数据兼容」）。

#### 该往哪个库传？（两个库的分工）

| 文件类型 | 传哪里 | 之后发生什么 |
|---|---|---|
| txt / md / csv / tsv / json / xlsx / docx… | **平台知识库**（面板上方） | 抽出纯文本存进业务库 `knowledge_documents`，问答时与课程/量表/教案等一起检索 |
| **PDF（有文字层）** | **平台知识库** 也可以（服务端用 `pdf-parse` 抽文字）；扫描件/图片型 PDF 请传火山库 | 抽成纯文本入库；抽不到文字时会明确提示「可能是扫描件」 |
| **扫描件 / 图片型 PDF / PPT / 旧版 .doc** | **火山知识库**（🌋 区块） | 由火山侧解析、切片（实测那份 PDF 被切成 17 片），问答走直连检索取原文切片 |

> PDF 现在是**支持**的：`extractTextFromBuffer()` 对 PDF 走 `pdf-parse`（纯 JS）抽取文字。
> 抽取为空（扫描件 / 图片型 PDF）时接口返回 400 并说明「可能是扫描件，请传火山知识库」，**不会写入空文档**。
> 若你看到 `{"total":0,"limit":100,"offset":0,"items":[],"categories":[…]}`，那就是平台知识库列表为空 ——
> 说明还没有任何资料成功入库（`npm run kb:doctor` 第 [6] 段会同时列出两个库的实际情况）。

### 在智能助理页面看/管火山知识库的文档（列表 + 上传）

「📚 知识库」面板底部新增「🌋 火山知识库（方舟）」区块：**列出知识库里的文档**、**上传新文档**、看切片预览、删除。

```bash
GET    /api/knowledge/viking               # 文档列表（doc/list）
GET    /api/knowledge/viking?docId=x       # 某个文档的切片预览（point/list，本地按 doc_id 过滤）
POST   /api/knowledge/viking               # 上传（multipart，字段 file）
DELETE /api/knowledge/viking?docId=x       # 删除（doc/delete，异步生效）
```

**关于「官方 Node SDK」的实测结论**：npm 上火山引擎的官方包是 `@volcengine/openapi`（通用 OpenAPI 客户端 + AK/SK V4 签名）
与 `@volcengine/sdk-core`，以及按产品生成的 swagger 客户端（`@volcengine/ark`、`@volcengine/kms`…）；
实测 `@volcengine/openapi@1.36.2` 包内**没有知识库（Viking KnowledgeBase）的服务定义**，npm 上也没有对应客户端——
知识库只有**官方 Python SDK**（`volcengine/viking_knowledgebase`）。所以这里直接调用知识库服务的 HTTP 接口
（与 Python SDK 封的是同一批 `/api/knowledge/*`），鉴权用控制台「知识库 → API Key」（`Authorization: Bearer`，实测可用）；
Python SDK 用的 AK/SK V4 签名（service = `air`）以后若要切换，签名逻辑可直接复用 `@volcengine/openapi` 的 SignerV4。

⚠️ 中间件必须放行这个中转目录：`src/middleware.ts` 里把 `/generated/` 整目录加入 `PUBLIC_STATIC_PREFIXES`
（并把 `md / markdown / csv / tsv / json / xml / ya?ml / pptx?` 补进 `STATIC_FILE`）。
之前白名单只认 pdf/docx/txt/html 等，`/generated/xxx.md` 会被 307 重定向到登录页 ——
知识库服务抓这个地址只会抓到登录页，解析必然失败（实测：`.pdf` 200、`.md`/`.csv` 307）。

**上传为什么要先落到公网地址**：API Key 身份下 `add_type="tos_fe"`（控制台拖文件那种）会返回
`not support tos_fe for user:xxxx`（无权限），唯一可用的是 `add_type="url"` —— **由知识库服务按 URL 自己去抓取文件**。
所以上传流程是：文件 → 临时写到 `public/generated/`（部署后即 `/generated/xxx`，公网可访问）→
调用 `doc/add { add_type:'url', doc_id, doc_name, doc_type, url }` → 知识库侧异步抓取、解析、切片。
面板里上传前必须勾选确认（**文件内容会外发给火山知识库**，含儿童个人信息的材料请谨慎）；失败时临时文件会被清掉。

> 实测（真实知识库 `WLJ`）：列表拿到 `康复训练档案_王小明_1787056050266.pdf`；
> 按 URL 上传 `cli-probe-robots.txt` → 6 秒后出现在列表；删除后回到 1 份。
> `point/list` 实测**不按 `doc_id` 过滤**（返回整个集合的切片），所以切片预览在本地按 `point_id` 前缀过滤。

### 智能助理查不到知识库里的资料？先看这三条

**链路**：`/api/chat` → 模型判断要不要查资料 → 调用工具 `search_knowledge_base` →
工具同时查「平台知识库表 `knowledge_documents` + 教案 / 训练计划 / 课程 / 量表模板 / 课堂记录」与「火山方舟托管智能体知识库」→
把命中结果以 JSON 交给模型组织回答。所以「问不出来」只有三种可能：资料不在库里、检索没命中、命中被截断。

1. **资料到底在不在库里**（最常见）：以「📚 知识库」面板里能不能看到为准，它读的就是数据库。
   ```sql
   select count(*), max("createdAt") from knowledge_documents;
   ```
   ⚠️ **保存这个动作本身也要连数据库**：服务器连不上数据库时（就是上面那条排障里的情况），上传会直接报错、面板顶部会显示红字，并不会「假装保存成功」。
   另外注意方舟控制台的知识库和平台知识库是两套：方舟那边的资料只能看见，不能通过平台页面写入。
2. **检索逻辑的坑（已修）**：原来把「整句提问」当成了必须命中的强检索词，等于要求资料里原样出现这句话。
   实测（同一份《王小明 感统训练记录》资料在库里）：`王小明` 能查到，而
   `王小明最近训练得怎么样` / `王小明的训练情况` / `我们机构的课程体系包括哪些课程` **全部返回 0 条**。
   现在改成：中文长句拆成有信息量的 2-gram 参与匹配（丢掉「构的」「的课」这类跨词噪声），
   整句只参与打分（命中说明原话出现过，排最前），并要求**至少命中 2 个不同的词**才算相关（查询里有英文/数字串如 ABC 时放宽为 1 个，避免误伤）。
   回归测试：`npm run test:kb-search`（8 条断言，含「整句提问必须命中」与「无关问题必须 0 条」两个方向）。
3. **命中结果被截断（已修）**：`knowledge_documents` 是最后一张被查的表，原来按表顺序拼接再 `slice(limit*2)`，
   库里资料很容易被前面几张表的命中挤掉。现在每张表都带命中权重，**全局按分数排序**后再截断。

> 方舟托管智能体那条路要额外知道两点：它返回的是「生成好的回答」而不是原文片段，而且**慢**（实测 10–56 秒），
> 会拖住整轮对话；可以用 `ARK_AGENT_TIMEOUT_MS`（默认 110000，范围 5s–180s）压时间去兜底。

## 创建管理员账号

三种方式，任选其一：

### 方式一：直接跑脚本（推荐，不用注册流程）

```bash
# 本地开发：数据库连接串已经在 .env.local（线上库）里，脚本会自动读取，直接跑
npm run create-admin -- --name 张三 --phone 13800000000 --password 'Wlj@2024abc'

# 阿里云服务器上执行：用服务器的环境变量（或命令行临时指定）
DATABASE_URL='postgresql://<user>:<password>@<线上主机>:5432/<database>' \
  npm run create-admin -- --name 张三 --phone 13800000000
```

- 不传 `--name/--phone` 会进入交互式问答（密码输入不回显）；不传 `--password` 会自动生成随机密码并强制首次改密
- 该手机号已存在时默认**不做任何修改**，只提示；要覆盖就加 `--update`（重置密码 + 提升为管理员 + 启用账号）
- 执行完会打印账号、密码和**恢复码**（只显示一次），随后用手机号 + 密码在首页登录
- 脚本自己会建表（`users` / `password_reset_logs`），空库也能直接用；本地运行时自动读 `.env.local` 里的 `DATABASE_URL`（命令行/服务器环境变量优先）
- 其他参数：`--role admin|teacher|therapist`、`--force-change`、`--help`

### 方式二：让第一个注册的人自动成为管理员

新部署且 `users` 表为空时，**第一个注册的用户自动获得管理员角色**，之后的注册者只能是教师/治疗师。

### 方式三：由现有管理员在「用户管理」里指定

管理员打开 `/users`，把某个账号的角色下拉改成「管理员」即可。

## 数据库：只使用线上库

- 本项目**只有一个数据库**：阿里云服务器（`www.weilaijia20210101.com` → `8.148.240.144`）上的 PostgreSQL，
  连接串放在环境变量 `DATABASE_URL` 里（`postgresql://postgres:****@8.148.240.144:5432/postgres`）。
- **不要在本地新建任何数据库**，本地开发也直连线上库。
  代码里已经去掉 localhost 兜底：没有 `DATABASE_URL` 时接口会直接报错，而不是悄悄连到本地库
  （见 `src/lib/api/db.ts`、`server/index.js`）。
- 表由代码幂等创建（`CREATE TABLE IF NOT EXISTS`），不需要手工建表，项目里也不存在任何本地数据库文件。

## 部署与运行（阿里云人工操作）

部署方式是**在阿里云服务器上人工操作**（没有 CI/CD，全部手动执行）：
SSH 上去 `git pull` → `npm install` → `npm run build` → 重启服务，数据库也是这台服务器上的 PostgreSQL。

线上就是「Nginx + Next.js + PostgreSQL」一条链路，**所有接口都在同一个域名下**：

```
浏览器 / 小程序  →  https://www.weilaijia20210101.com/api/*  →  Nginx(443)  →  Next.js(3001)  →  PostgreSQL
```

- 前端所有请求（**包括登录 `/api/auth/login`**）都用相对路径 `/api/...`，与 `/api/health`、`/api/teachers`
  等接口**同一 origin**，所以没有跨域，也没有第二个 API 域名。
- 服务器上需要（人工）配置的环境变量：`DATABASE_URL`（这台服务器上的 PostgreSQL）、`AUTH_SECRET`（登录会话密钥）。
- 更新线上代码（人工执行）：

```bash
ssh <你的阿里云服务器>
cd <项目目录>
git pull
npm install
npm run build
# 然后重启进程（按你机器上的实际方式：pm2 restart / systemctl restart / 手动重启）
npm run start          # next start -p 3001，由 Nginx 反向代理
```

### 部署后一键验收

```bash
npm run deploy:verify                    # 在服务器上跑（默认用 www.weilaijia20210101.com 探测公网目录，可 --base 覆盖）
```
逐条检查并给出 PASS/WARN/FAIL：环境变量（DATABASE_URL / KB_API_KEY / KB_COLLECTION_NAME / PUBLIC_BASE_URL）、
数据库与关键表、火山知识库四连（ping → collection/list → doc/list → search_knowledge）、
`/generated/` 的公网可访问性（火山知识库抓取上传文件的前提）、平台知识库条数。
只读为主，会写一个临时文件并立即删除。任一项 FAIL 时退出码为 1。

实测输出（当前环境）：
```
✅ DATABASE_URL / KB_API_KEY / KB_COLLECTION_NAME
✅ 数据库连接成功（13ms）；8 张表都在
✅ 火山知识库 ping / collection/list → WLJ(1 篇) / doc/list → 1 份 / search_knowledge("王小明") → 3 条切片
⚠️ /generated/ 公网拉取 404（开发机跑属正常，服务器上跑才有意义）
⚠️ knowledge_documents → 0 条（还没成功上传过）
结论：PASS 9 ｜ WARN 3 ｜ FAIL 0
```

部署后确认「登录接口与其它接口同源」：

```bash
curl https://www.weilaijia20210101.com/api/health
curl -X POST https://www.weilaijia20210101.com/api/auth/login \
  -H 'Content-Type: application/json' -d '{"phone":"13800000000","password":"你的密码"}'
```

## 排障：登录报 `read ECONNRESET` / 服务反复重启

现象：登录接口返回 `500 {"error":"read ECONNRESET"}`，同时 `pm2 list` 里 wlj 的 ↺（重启次数）一直涨（线上出现过 **704 次**）。

### 为什么一个数据库抖动会让整个服务重启

根因在 `src/lib/api/db.ts` 的 pg 连接池漏了 `'error'` 监听，而 Node 的 EventEmitter 在没有 `'error'` 监听器时会把异常**直接抛成未捕获异常** → 进程退出 → pm2/systemd 判定崩溃并重启：

1. **空闲连接被重置**：pg-pool 会 `pool.emit('error')` → 没人监听 → 进程退出；
2. **查询进行中的连接被重置**（本次的登录场景）：pg-pool 在把 client 交给查询前执行了 `client.removeListener('error', idleListener)`
   （`node_modules/pg-pool/index.js` 的 `_acquireClient`），此时 socket 报错会 `client.emit('error')` → 同样没人监听 → 进程退出。

所以链路是「数据库/中间设备重置连接 → 用户看到 500（还带着驱动原始报错）→ 服务重启一次」，重启次数就会越滚越多。
回归测试：`npm run test:db-resilience`（16 条断言）——故意掐断自己的一条连接，断言「修复前进程必死、修复后进程存活且连接池自动恢复」；
  另外实测「SIGKILL / 优雅关闭之后，数据库侧不会留下任何连接」。

### 已经做的加固

| 位置 | 改动 |
|---|---|
| `src/lib/api/db.ts` | 连接池改成 **globalThis 单例**（Next 会把该文件内联进 4 个路由 bundle，原来一个进程可能建 4 个池）；`pool.on('error')` + `pool.on('connect')` 给**每个 client 常驻** error 监听；连接池限制参数补齐：`connectionTimeoutMillis=10s`（原来没设，实测请求挂 20s+ 不返回）、`idleTimeoutMillis=10s`、`maxLifetimeSeconds=1800`（到点换新连接，避免沿用被中间设备悄悄失效的长连接）、`keepAlive`；连接在 `pg_stat_activity` 里显示为 `application_name=wlj-next-<pid>`；可用 `PG_POOL_MAX / PG_CONNECT_TIMEOUT_MS / PG_IDLE_TIMEOUT_MS / PG_MAX_LIFETIME_SEC / PG_STATEMENT_TIMEOUT_MS / PG_APP_NAME` 覆盖。启动时会打一行 `✅ PostgreSQL 连接池已创建：max=… idleTimeoutMillis=… connectionTimeoutMillis=…`，服务器上 `pm2 logs wlj` 就能确认参数真的生效；**多实例（pm2 cluster）时注意「实例数 × PG_POOL_MAX」要小于数据库 `max_connections`（线上是 100）** |
| `src/lib/api/db.ts` | 新增 **优雅关闭**：收到 `SIGTERM`/`SIGINT` 先 `closeDb()`（`pool.end()`，最多等 3 秒）再退出，重启/部署时不让数据库继续挂着没人用的后端进程；设 `WLJ_NO_GRACEFUL_SHUTDOWN=1` 可关掉该行为。（`next start` 自己也注册了 SIGTERM 处理，可能先于我们退出，但连接由内核释放，结果一样） |
| `db.ts` | 新增 `isTransientDbError()` / `withDbRetry()`：ECONNRESET、57P01/57P03（数据库重启中）等瞬时错误自动重试一次 |
| `src/app/api/auth/login/route.ts` | 登录的数据库操作走 `withDbRetry`；瞬时错误返回「数据库连接被重置，请稍后重试」+ 错误码（503），不再把 `read ECONNRESET` 这种驱动原文甩给用户 |
| `src/lib/auth/store.ts` | `ensureAuthSchema` 每个连接池只跑一次（原来**每个认证请求**都跑 16 条 DDL，其中 `ALTER TABLE` 会拿 ACCESS EXCLUSIVE 锁，白拖慢登录） |
| `src/app/api/health/route.ts` | 改成**强制动态 + 真的跑 `SELECT 1`**。原来它是被 Next 静态缓存的（响应头 `x-nextjs-cache: HIT`），**数据库已经连不上它还返回 `{"status":"ok"}`**（`scripts/setup-pg.sh` 就是靠它判断"数据库正常"的，等于一直失明）。现在返回 `pid / uptimeSec / pool / dbLatencyMs`，失败时 503 + `error.code`（IP、连接串已打码） |
| `src/instrumentation.ts` + `next.config.js` | 全局兜底：`uncaughtException` / `unhandledRejection` 只记录日志、不让进程退出（想恢复「一有未捕获异常就退出」设 `WLJ_STRICT_CRASH=1`） |
| `server/index.js` | 老 express 入口（`npm run server` / `dev:full`）同样加池监听；数据库初始化失败改为指数退避重试，**不再 `process.exit(1)`**（原来这也是一个重启风暴来源） |

### 顺带排除的两个猜测（都做了实测）

有人怀疑是「连接池缺参数 + 进程频繁重启没销毁旧池 → 数据库主动重置残留的半开连接」。这个说法**和实测不符**：

1. **数据库根本没有"主动清理空闲连接"的机制**：线上 `idle_session_timeout = 0`、`tcp_keepalives_idle = 7200`（2 小时），PostgreSQL 只会在**自己重启 / 后端被 OOM 杀掉 / 被 `pg_terminate_backend`** 时才断开连接；而故障期间 `pg_postmaster_start_time()` 一直连续（没有重启）。
2. **应用连接压根没到数据库**：故障时对着登录接口连打 3 次请求、同时 24 秒采样 `pg_stat_activity`，**一条来自服务器的连接都没有出现**（只有排查用的连接）。
   连接在到达 PostgreSQL 之前就被网络路径（安全组 / 防火墙 / NAT 回环）丢包或 RST 了——否则 Postgres 至少会先接受它，再按 `pg_hba` 给出正常报错，而不是 `read ECONNRESET`。
3. **进程死掉不会残留连接**：进程无论怎么死（连 `SIGKILL`），内核都会关掉它的全部 socket，`PostgreSQL` 立刻回收对应后端进程——不需要应用"销毁旧连接池"。
   `npm run test:db-resilience` 第 4 组就是实测这个：子进程连上后数据库里是 1 条连接，`SIGKILL` 之后 1.5 秒内变回 0；优雅关闭（`SIGTERM` → `closeDb()`）同样立刻归零。

所以「池参数」该补（已补），但 **RST 的来源是服务器 → 数据库这段网络，不是 PostgreSQL 在重置连接**，别在数据库侧找原因。

### 上线后怎么确认修好了

```bash
curl -s https://www.weilaijia20210101.com/api/health     # 应返回 pid / uptimeSec / pool / dbLatencyMs
pm2 list                                                 # ↺ 计数不再增长；restart 后 pid 不再频繁变化
```

```sql
-- 数据库侧看应用连接：修复后一定带 wlj-next- 前缀
select application_name, client_addr, state, count(*), max(now() - state_change) as 空闲时长
  from pg_stat_activity group by 1, 2, 3 order by 4 desc;
```

### 如果健康检查还是报错：去服务器上按顺序跑这几条

```bash
cd <项目目录>
echo "${DATABASE_URL:0:30}..."                 # 只确认开头，别把密码贴到聊天/工单里
psql "$DATABASE_URL" -c 'select 1'             # ① 决定性的：这一条能区分「应用 env 问题」还是「服务器→数据库链路问题」
#   这里也 ECONNRESET / 超时 → 服务器到数据库这一段有问题：安全组 / 防火墙 / 出方向规则 / 数据库在重启
#   这里正常            → 是应用进程自己的环境变量或进程问题：拿它和 pm2 环境里的 DATABASE_URL 对比
journalctl -u postgresql --since '-2 hours' | tail -60      # ② 数据库是否被重启 / 报了 OOM
sudo tail -100 /var/log/postgresql/postgresql-14-main.log
sudo dmesg -T | grep -iE 'oom|killed process' | tail -20
df -h; free -m                                              # ③ 磁盘满 / 内存不足（都会让 Postgres 掉线重启）
sudo ss -tanp | grep -E '3001|5432' | head -20              # ④ 连接是否堆积在 CLOSE_WAIT
sudo iptables -S | head -40; sudo ufw status                # ⑤ 有没有 REJECT/DROP 掉 5432 的规则
pm2 logs wlj --lines 150 --nostream                         # ⑥ 崩溃栈与 [db] 日志
```

> 本次线上故障的实测结论（供参考）：**开发机能直连 `8.148.240.144:5432`，但服务器上的应用连不上**。
> 登录接口那套 SQL（`ensureAuthSchema` 的 16 条 DDL + 查用户）在开发机上完整复刻一遍 ~300ms 全部通过、
> 期间 Postgres 也没有重启 —— 说明**数据库本身是好的，问题在「服务器 → 数据库」这一段**，
> 优先查 ①②⑤（安全组 / 防火墙 / 服务器上那份 `DATABASE_URL`）。

## 本地开发

```bash
# 安装依赖
npm install

# 直接跑 Next.js：页面与 API Routes 同源（端口 3000）
npm run dev
# 打开 http://localhost:3000 ，登录接口就是 http://localhost:3000/api/auth/login

# 需要单独跑 Express 版后端时（可选，端口 3001）
node server/index.js
```

- 本地同样是**用线上数据库、不建本地库**：本地开发的环境变量就写在 `.env.local`，其中
  `DATABASE_URL="postgresql://postgres:****@8.148.240.144:5432/postgres"` 直接指向线上库
  （完整密码只在 `.env.local` 里、不要提交）；Next.js 的 dev/build 与 `scripts/create-admin.js` 等脚本都会读它。
- 因为接口都用相对路径 `/api`，本地和线上的接口 origin 始终等于「你打开页面的那个域名」，
  登录接口和其它接口永远保持一致。

## 环境变量

| 变量 | 说明 |
|---|---|
| `DATABASE_URL` | **必填**，线上 PostgreSQL 连接串（唯一数据源；不配置接口直接报错）。也可用 `POSTGRES_URL` |
| `AUTH_SECRET` | **线上必填**，登录会话签名密钥（≥16 位随机字符串） |
| `REGISTER_CODE` | 可选。配置后注册需要填邀请码（不配置=开放注册） |
| `ARK_API_KEY` / `ARK_BASE_URL` / `ARK_MODEL_ENDPOINT` | 大模型（火山方舟，唯一入口；已移除 DeepSeek 等外部服务） |
| `KB_API_KEY` | 可选（推荐）。火山知识库 API Key → 直连检索知识库原文切片，详见 `src/lib/agent/README.md` |
| `ARK_AGENT_ID` / `ARK_ENVIRONMENT_ID` / `ARK_VAULT_ID` | 可选。方舟托管智能体 → 检索知识库（兜底路径，慢），详见 `src/lib/agent/README.md` |
| `PORT` | Express 版后端端口（默认 3001）；Next.js 端口由 `npm run dev` / `npm run start` 决定 |
| `PGSSLMODE` | 可选，设为 `disable` 时关闭数据库 SSL（默认开启） |

> 本地开发写在 `.env.local`（已被 git 忽略）；线上写在阿里云服务器的环境变量里。
