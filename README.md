# 星间 · STELLAR TAROT

一个可以分享给朋友的中文塔罗空间。奶油纸色、原创星象插画和温柔的中文牌意，适配手机与电脑。

**在线体验：https://Gary81018.github.io/stellar-tarot/**

## 功能

- 完整 78 张牌：22 张大阿尔卡纳与 56 张小阿尔卡纳，全部为原创 SVG 插画。
- 四种牌阵：今日一张、时间之流、关系之镜、岔路之间。
- 综合指引、感情关系、工作学业、自我成长四个主题，可输入自己的问题。
- 可选择正逆位；使用 Web Crypto 随机无放回抽牌。
- 基础中文牌意始终可读；可选 DeepSeek AI 深度解读，结合问题、主题、牌位与正逆位提供逐牌分析、综合联系和三项行动建议。
- 模型密钥仅在服务端加密保存；朋友无需配置自己的密钥。
- 最近 50 次抽牌与 AI 解读缓存保存在当前浏览器，可重读、删除、下载文本。
- 通过链接分享同一组牌；默认隐藏问题，勾选后才会包含问题。AI 分析不写入分享链接，下载文本可包含 AI 分析。
- 可搜索、筛选的完整牌组图鉴。
- 页脚“请星间喝杯茶”展示微信与支付宝原始收款码，支持查看和保存原图，自愿支持、金额随心。

## 本地运行

需要 Node.js 22 或更新版本及 Python 3；无 npm 依赖，无需 npm install。

```sh
node --test tests/*.test.js
node scripts/build.mjs
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

打开 http://127.0.0.1:4173 。也可以使用 `npm test`、`npm run build`、`npm run dev`。

## GitHub Pages

仓库 Settings → Pages → Source 选择 **GitHub Actions**。
推送至 `main` 后，工作流会运行测试、构建 `dist/` 并自动发布。
全部站内资源采用相对路径，兼容 GitHub Pages 项目子路径。

## 文件结构

- `src/deck.js`：78 张牌及独立正逆位中文释义。
- `src/art.js`：原创 SVG 牌面与牌背。
- `src/engine.js`：随机抽牌、牌阵、数据校验、分享编码和规则摘要。
- `src/app.js`：页面路由、互动、记录与分享。
- `src/ai-panel.js`：AI 解读界面、加载、取消与独立结果区域。
- `src/ai-client.js`：AI 请求、超时、响应验证、缓存和导出。
- `src/config.js`：公开 AI 后端地址，不包含密钥。
- `server/interpret.js`：DeepSeek 服务端处理器与提示词。
- `server/sites/`：部署适配器、持久化配额与配置说明。
- `styles.css`：响应式样式及减少动态效果支持。
- `tests/engine.test.js`：随机数、去重、数据边界、分享及真实牌组整合测试。
- `.github/workflows/deploy.yml`：自动测试和 GitHub Pages 发布。

## AI 服务维护

前端仍部署在 GitHub Pages；AI 接口部署在 Sites/Cloudflare Workers。详见 [服务端部署说明](server/sites/README.md)。服务端配置 `DEEPSEEK_API_KEY`、`RATE_LIMIT_SALT` 和公开前端来源。用户主动生成解读时会使用站点维护者的 DeepSeek API 额度。

全站默认每日 100 次，每个匿名来源每天 20 次、每分钟 3 次，按新加坡时区重置。密钥或配额存储缺失时停止 AI 调用，不影响基础牌意。

## 数据与使用说明

本应用无需注册。问题与记录默认只保存在当前浏览器；选择 AI 解读时，当次问题和牌阵会通过后端发送至 DeepSeek。后端仅保存匿名限流计数，不保存问题或 AI 解读。清空浏览器数据可能丢失本地记录。链接分享使用 URL fragment 存放牌面数据，持有链接的人可读取分享内容。分享不会自动发布到社交平台。

页面托管服务为 GitHub Pages；中文字体尝试加载 Google Fonts，无法加载时使用设备字体。不包含广告或统计追踪。

解读仅供娱乐、自我探索与对话启发，不分析问题中描述的现实事实，不预测必然发生的事件。重大决定请依据现实信息和适当的专业意见。
