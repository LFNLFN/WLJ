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

部署后确认「登录接口与其它接口同源」：

```bash
curl https://www.weilaijia20210101.com/api/health
curl -X POST https://www.weilaijia20210101.com/api/auth/login \
  -H 'Content-Type: application/json' -d '{"phone":"13800000000","password":"你的密码"}'
```

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
| `AI_API_KEY` / `AI_BASE_URL` / `AI_MODEL` | AI 相关功能（默认 DeepSeek） |
| `PORT` | Express 版后端端口（默认 3001）；Next.js 端口由 `npm run dev` / `npm run start` 决定 |
| `PGSSLMODE` | 可选，设为 `disable` 时关闭数据库 SSL（默认开启） |

> 本地开发写在 `.env.local`（已被 git 忽略）；线上写在阿里云服务器的环境变量里。
