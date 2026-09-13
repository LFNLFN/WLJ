# 运维 / 数据脚本

## 数据库：只使用线上库

本项目**只有一个数据库**：阿里云服务器（`www.weilaijia20210101.com` → `8.148.240.144`）上的 PostgreSQL（人工部署维护）。

- **不要在本地新建任何数据库**，本地开发也直连线上库。
- 连接串统一放在 `DATABASE_URL`：
  - 本地开发：写进项目根目录的 `.env.local`（已被 git 忽略）
  - 线上：写进阿里云服务器的环境变量（systemd / PM2 / shell profile，人工配置）
- 不配置 `DATABASE_URL` 时接口会直接报错，不会回退到本地库（见 `src/lib/api/db.ts`、`server/index.js`）。
- 表由代码幂等创建（`CREATE TABLE IF NOT EXISTS`），不需要手工建表，项目里也不存在任何本地数据库文件。

## 接口地址（登录接口与其它接口同源）

所有接口都在同一个域名下，脚本默认使用线上地址，也可以用 `API_URL` 覆盖：

```bash
API_URL=https://www.weilaijia20210101.com/api node scripts/init-tml-scales.js
```

- 健康检查：`https://www.weilaijia20210101.com/api/health`
- 登录：`https://www.weilaijia20210101.com/api/auth/login`（和 `/api/teachers` 等接口同一 origin）

## 常用命令

```bash
# 本地开发（Next.js，页面与 API 同源，端口 3000）
npm run dev

# 构建 + 线上运行（Next.js，端口 3001，由 Nginx 反向代理）
npm run build && npm run start

# 初始化预设量表模板到线上数据库
npm run sync:scales

# 创建/重置管理员账号（本地会自动读 .env.local 里的 DATABASE_URL）
npm run create-admin -- --name 张三 --phone 13800000000

# 检查线上接口与数据库状态
node scripts/setup-postgresql.js
bash scripts/setup-pg.sh
```

## 脚本清单

| 脚本 | 作用 |
|---|---|
| `init-scales-remote.js` | 初始化预设量表模板到线上（`npm run sync:scales`） |
| `init-scales.js` / `init-tml-scales.js` | 初始化量表模板（含小程序 TML 量表） |
| `create-admin.js` | 创建/重置管理员账号，顺带生成一次性恢复码；本地自动读 `.env.local` |
| `setup-postgresql.js` / `setup-pg.sh` | 检查线上接口与数据库状态 |

> 注意：量表和模板类接口在登录功能上线后需要登录态；这类一次性初始化建议在部署登录版本之前执行，
> 或临时使用管理员账号的会话 Cookie 调用。
