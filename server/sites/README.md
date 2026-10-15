# 星间 AI 后端部署说明

核心 Fetch API 处理器位于 `../interpret.js`，从项目 `src/deck.js` 与 `src/engine.js` 重建标准牌意，不接受浏览器提供的模型、接口地址、提示词或牌意。

生产后端：`https://stellar-tarot-ai-gary.spunky-vale-0782.chatgpt.site`

当前使用 Sites 的 Vinext/Cloudflare Workers 模板，完整托管项目保存在本机同级 `starot-ai` 目录及 Sites 私有源码仓库。本目录保留部署适配器、D1 表结构与建表迁移，便于维护。

## 路由接入

把 `handler.ts` 放入托管项目 `lib/handler.ts`，核心处理器放 `server/interpret.js`，牌组与引擎放 `src/`。`handler.ts` 中导入路径以该布局为准。

两个 Vinext 路由：

```ts
// app/api/interpret/route.ts
import { handleRequest } from '../../../lib/handler';
export const dynamic = 'force-dynamic';
export const POST = handleRequest;
export const OPTIONS = handleRequest;
```

```ts
// app/api/health/route.ts
import { handleRequest } from '../../../lib/handler';
export const dynamic = 'force-dynamic';
export const GET = handleRequest;
export const OPTIONS = handleRequest;
```

在 Sites 的 `.openai/hosting.json` 中设置 `d1: "DB"`，应用 `0000_ai_quota.sql` 对应的迁移。迁移只能应用一次，不在请求处理时建表。

## 服务端环境变量

| 名称 | 说明 |
| --- | --- |
| `DEEPSEEK_API_KEY` | 必填，加密密钥。不能放入前端、GitHub 或构建变量。 |
| `RATE_LIMIT_SALT` | 必填，随机加密密钥，用于匿名化访问来源。 |
| `DEEPSEEK_MODEL` | 默认 `deepseek-flash`，仅服务端可更改。 |
| `ALLOWED_ORIGIN` | `https://gary81018.github.io`，精确校验。 |
| `DAILY_REQUEST_LIMIT` | 全站每日最大请求数，当前 100，上限 1000。 |

密钥通过 Sites 运行时环境变量设置，变更后部署保存的版本生效。生产前端只包含 `src/config.js` 中的公开后端地址。公开网页不能保管模型密钥，CORS 也不是身份认证；服务端强制执行持久化配额。

## 配额与数据

- 每个匿名来源每分钟 3 次、每日 20 次；全站每日 100 次（可配置）。每日按新加坡时区重置。
- 配额在上游调用前原子占用；失败请求也计数，避免通过失败重试绕过限制。
- 后端只保存过期后清理的匿名计数；不存储问题、解读文本或原始 IP。
- 请求上限 8 KB，解读上游等待 75 秒；客户端等待 90 秒。
- 只有点击“生成 AI 深度解读”才发送当次问题与牌阵。取消等待不保证已到达 DeepSeek 的请求停止计费。
- AI 输出按固定 JSON 结构验证并转义显示，错误响应不回传密钥、原始提示词或上游错误详情。
- 本地缓存最多 50 次；分享链接不包含 AI 输出，避免从分析文本间接泄露未勾选分享的问题。

官方接口：[DeepSeek API 文档](https://api-docs.deepseek.com/)。
