# 未来家儿童能力发展中心 - 课程管理系统

## 部署方式

### 方式一：Railway 部署（前后端一体化，推荐）

1. Fork 或推送此仓库到 GitHub
2. 在 [Railway.app](https://railway.app) 创建新项目，选择此仓库
3. Railway 会自动识别 `railway.json` 配置并部署
4. 部署完成后 Railway 会生成一个 `*.railway.app` 域名

### 方式二：Zeabur 部署（国内访问更佳）

1. Fork 或推送此仓库到 GitHub
2. 在 [Zeabur.com](https://zeabur.com) 创建新项目，导入此仓库
3. 选择部署方式，设置启动命令为 `node server/index.js`

### 方式三：国内云服务器部署

1. 准备一台服务器（阿里云/腾讯云等）
2. 安装 Node.js 18+
3. 克隆代码：
   ```bash
   git clone <你的仓库地址>
   cd wlj
   npm install
   npm run build
   node server/index.js
   ```
4. 使用 PM2 或 Nginx 做反向代理

### 方式四：Vercel + 后端分离（需额外配置）

- 前端部署到 Vercel
- 后端部署到 Railway
- 需配置 API 地址，并注意跨域问题

## 本地开发

```bash
# 安装依赖
npm install

# 启动后端
node server/index.js

# 新终端启动前端
npx next dev
```

## 环境变量

- `PORT` - 服务端口（默认 3001）
- `DB_PATH` - SQLite 数据库路径
