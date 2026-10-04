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

## 已有工具

- `search_knowledge_base(query)`：检索内部知识库。**默认走库内检索**（课程 / 量表 / 课堂记录 / 教案 / 训练计划），
  不依赖外部凭证；若配置了方舟知识库接入方式则额外合并其结果，未配置或调用失败会自动降级并给出 `notice`
  - 方式一（推荐）`ARK_AGENT_ID` + `ARK_ENVIRONMENT_ID` + `ARK_VAULT_ID`：方舟「托管智能体 (Managed Agents)」。
    知识库以 Skill（`viking-knowledge-search`）挂在智能体上，是方舟**唯一**能真正检索知识库的路径：
    `POST /sessions/{id}/events` 发问题 → 轮询 `GET /sessions/{id}/events` 取 `agent.message`。
    每次检索会新建一个干净会话（绑定 vault 里的 Viking 凭证）并在结束后删除；也可用 `ARK_SESSION_ID` 复用固定会话
  - 方式二 `ARK_BOT_ID`：方舟「应用(Bot)」，走 `POST /api/v3/bots/chat/completions`
  - 方式三 `ARK_KB_ENDPOINT`：自建 / 兼容的检索接口，请求体 `{ knowledge_base_id, query, top_k }`
  - ⚠️ 方舟开放接口**没有**独立的「知识库 chunk 检索」路径，`POST /api/v3/knowledge/search` 返回 404，不要再用它
  - ⚠️ 托管智能体依赖会话绑定的 vault 凭证；凭证无效时 Skill 会返回 `authentication_error / invalid api key`，
    此时工具仍返回回答，但会附带 `notice` 说明该回答不基于知识库
- `query_database(action, params)`：查询业务库（`stats` 或表名；支持 `id` / `search` / `limit` / `offset`）
- `generate_file(type, filename, content)`：生成 Excel/Word 并返回下载地址

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

## 功能测试

```bash
npm run test:agent-tools                 # 单元 + 真实库/真实知识库冒烟测试

node scripts/ark-agent-ask.js --list                            # 列出方舟智能体 / 会话
node scripts/ark-agent-ask.js "公司差旅住宿报销标准是多少？"      # 直接和智能体对话
node scripts/check-ark-kb.js <候选ID>                            # 自检某个 ID 是不是绑了知识库的入口

node scripts/push-agent-prompt.js --dry-run                      # 查看将推送到方舟的 system prompt 差异
node scripts/push-agent-prompt.js --name 名称 --description 描述  # 推送（自动备份到 .ark-backup/）
```

智能体的 system prompt 源文本在 `wlj-system-prompt.md`（面向未来家儿童康复业务），纳入版本管理；
推送前会自动把线上配置备份到 `.ark-backup/`（已 gitignore）。

测试覆盖：工具注册、参数校验、Excel/Word 生成与落盘、路径穿越防护、
数据库查询（真实库）、知识库异常兜底。

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `ARK_API_KEY` / `ARK_BASE_URL` / `ARK_MODEL_ENDPOINT` | 火山方舟（可选）。`ARK_API_KEY` 形如 `ark-<uuid>-<后缀>` 或纯 UUID；非法或缺失时知识库自动降级为库内检索 |
| `ARK_AGENT_ID` / `ARK_ENVIRONMENT_ID` / `ARK_VAULT_ID` | 方舟「托管智能体」接入（推荐）。三者配齐即每次检索新建并销毁会话；vault 内需放有效的 Viking 知识库 Key |
| `ARK_SESSION_ID` | 可选，复用固定会话（不配 environment+vault 时生效）。注意会话历史会参与上下文，建议单独用一个检索专用会话 |
| `ARK_AGENT_TIMEOUT_MS` | 可选，单次托管智能体检索的最长等待，默认 110000。带 thinking 时单轮 15~60s，需要多轮检索的问题可能 60~120s |
| `ARK_BOT_ID` | 火山方舟**应用(Bot)** ID（`bot-xxxx`），该应用需在控制台绑定知识库。配置后知识库走 `/bots/chat/completions` |
| `ARK_KNOWLEDGE_BASE_ID` | 方舟知识库 ID（`kb-xxxx`）。**不能**直接被检索，只能被智能体/应用引用 |
| `ARK_KB_ENDPOINT` | 可选，自建 / 兼容的知识库检索接口地址（默认**不再**指向方舟 `/knowledge/search`，该路径不存在） |
| `DATABASE_URL` 等 | 业务数据库（见 `src/lib/api/db.ts`） |
