# 星间 AI · Render 集成

本目录提供标准库 Python 后端，部署到现有 ONE 服务的独立 `/tarot/api/*` 路径。网页仍由 GitHub Pages 托管，分析结果直接在原页面显示。

## 部署文件

把 `tarot_api.py`、`tarot_quota.py`、`tarot_data.json` 放入 ONE 仓库的 `backend/`。`tarot_data.json` 由 `node scripts/export-server-data.mjs` 从实际 78 张牌和 4 种牌阵导出，不接受前端伪造的牌意。

ONE 的 `Handler` 仅在 `/tarot/api/health`、`/tarot/api/interpret` 两个精确路径调用 `handle_tarot_http(self)`；其他路由继续原有登录、CSRF 和同源检查。模块延迟加载，塔罗配置或配额故障不阻止 ONE 启动。无需改变 Dockerfile、Python 依赖或 Render 健康检查地址。

## 独立环境变量

| 名称 | 值 / 说明 |
| --- | --- |
| `TAROT_DEEPSEEK_API_KEY` | 仅在 Render 服务端保存，不能提交 GitHub或前端。 |
| `TAROT_DEEPSEEK_MODEL` | `deepseek-flash`，由服务端配置。 |
| `TAROT_ALLOWED_ORIGIN` | `https://gary81018.github.io` |
| `TAROT_QUOTA_DB` | `/var/data/one/tarot/quota.sqlite3`，位于已有持久盘。 |
| `TAROT_RATE_LIMIT_SALT` | 至少 32 字符的独立随机密钥。 |
| `TAROT_DAILY_REQUEST_LIMIT` | `100`，全站每日上限。 |

密钥、盐或绝对数据库路径缺失时，接口不调用模型；数据库失败也不降级为无限调用。ONE 的账户、访谈库、模型配置不参与塔罗处理。

## 限额与数据

- 每个浏览器随机标识每分钟 3 次、每日 20 次；这只是尽力防误点，清除存储可重置，不是身份认证。
- 全站每日默认 100 次是持久化硬限制；三项配额由 SQLite 事务原子占用，UTC+8 零点重置，失败的模型请求也计数。
- 最多同时处理 2 次塔罗模型请求，繁忙立即返回；不排队挤占 ONE 的访谈锁。
- 数据库只保存每日 HMAC 标识、计数和到期时间，不保存问题、解读或原始访客标识。
- 请求正文最多 8 KiB，模型输出最多 128 KiB，上游总等待最多 75 秒；不跟随模型端重定向，不自动重试。
- CORS 仅放行精确的 GitHub Pages 来源及 `Content-Type`、`X-Tarot-Visitor-Id`。CORS 不是访问认证，全站限额独立生效。
- 两个应用仍共享实例的内存、CPU、磁盘和重启周期。复用不新增实例月租，但模型调用及超出平台包含额度的用量仍按原套餐计费。

## 验证和切换

```sh
python3 -m unittest discover -s tests -p 'test_tarot_*.py' -v
node --test tests/*.test.js
```

先部署后端并检查健康、跨域预检及一次合成问题的真实解读；再将前端 `AI_ENDPOINT` 设置为 `https://one-human-interview.onrender.com/tarot` 并发布。接口未验证前保留空地址。前端不显示提供商或模型名称，也不跳转第三方聊天网站。

回退时先清空前端 `AI_ENDPOINT`；随后可移除服务端塔罗密钥停用模型调用，不必调整 ONE 的配置和数据库。
