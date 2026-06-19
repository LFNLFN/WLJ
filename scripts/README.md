# 数据同步工具

## 配置 PostgreSQL（仅需执行一次）

### 在 Railway 网页控制台操作：

**步骤 1:** 打开 https://railway.app/project，用 GitHub 登录

**步骤 2:** 点击项目名称（不是 "New project"，而是你部署 wlj 的那个项目）

**步骤 3:** 点击页面顶部的 "New" 按钮 → "Database" → "Add PostgreSQL"

**步骤 4:** 等待 PostgreSQL 创建完成（约 1 分钟）

**步骤 5:** 在 Railway 项目页面，找到 "Variables" 选项卡
   - 确认有一个 `DATABASE_URL` 变量（Railway 会自动设置）

**步骤 6:** 触发重新部署：
   - 在 "Deployments" 选项卡中
   - 找到最近的部署记录
   - 点击 "Redeploy" 按钮
   - 或者在 GitHub 推送一次新的提交

**步骤 7:** 部署完成后验证：
```bash
curl https://wlj-production.up.railway.app/api/health
```
返回 `{"status":"ok","db":"postgresql",...}` 表示成功 ✅

**步骤 8:** 同步现有数据：
```bash
node scripts/sync-to-remote.js
```

## 日常使用命令

```bash
# 本地开发（使用 SQLite）
npm run dev

# 修改数据后同步到线上
npm run sync:remote

# 初始化预设量表模板到线上
npm run sync:scales

# 检查 PostgreSQL 配置状态
npm run setup:pg
```
