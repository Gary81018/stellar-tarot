# 星间 · STELLAR TAROT

一个可以分享给朋友的中文塔罗空间。奶油纸色、原创星象插画和温柔的中文牌意，适配手机与电脑。

**在线体验：https://Gary81018.github.io/stellar-tarot/**

## 功能

- 完整 78 张牌：22 张大阿尔卡纳与 56 张小阿尔卡纳，全部为原创 SVG 插画。
- 四种牌阵：今日一张、时间之流、关系之镜、岔路之间。
- 综合指引、感情关系、工作学业、自我成长四个主题，可输入自己的问题。
- 可选择正逆位；完整展示 78 张牌背，使用 Web Crypto 洗牌，点击的位置对应最终牌面，无法重复选择。
- 基础中文牌意按牌面与主题在本地生成，明确标注为预设解读。
- 页内一键 AI 深度解读：围绕具体问题、实际牌位和正逆位生成分析，不跳转到其他聊天网站，不显示模型品牌。
- API 密钥只保存在 Render 后端，网页通过独立接口提交本次牌阵，不包含维护者的密钥。
- 最近 50 次抽牌记录保存在当前浏览器，可重读、删除、下载文本；AI 解读生成后在本设备缓存，旧缓存仍可查看和导出。
- 通过链接分享同一组牌；默认隐藏问题，勾选后才会包含问题。AI 分析不写入分享链接，下载文本可包含 AI 分析。
- 可搜索、筛选的完整牌组图鉴。
- 页脚“请星间喝杯茶”展示微信与支付宝原始收款码，支持查看和保存原图，自愿支持、金额随心。

## 本地运行

需要 Node.js 22 或更新版本及 Python 3；无 npm 依赖，无需 npm install。

```sh
node --test tests/*.test.js
python3 -m unittest discover -s tests -p 'test_tarot_*.py' -v
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
- `src/draw-session.js`：完整牌组洗牌与选牌会话。
- `src/ai-prompt.js`：旧版本地提问辅助模块，当前页面不使用。
- `src/ai-panel.js`：页内生成、加载、取消、错误提示和解读展示。
- `src/ai-client.js`：AI 请求、超时、响应验证、缓存和导出。
- `src/config.js`：公开后端地址；为空时不显示生成入口。
- `server/render/`：现用 Python 服务端、独立 SQLite 配额、标准牌意及部署说明。
- `scripts/export-server-data.mjs`：从前端规范牌库导出服务端标准数据。
- `server/interpret.js`、`server/sites/`：旧部署参考，不供当前页面调用。
- `styles.css`：响应式样式及减少动态效果支持。
- `tests/engine.test.js`：随机数、去重、数据边界、分享及真实牌组整合测试。
- `.github/workflows/deploy.yml`：自动测试和 GitHub Pages 发布。

## 当前 AI 状态

AI 后端复用 ONE 在 Render 的现有实例，通过 `https://one-human-interview.onrender.com/tarot` 下的独立接口提供服务，不经过 `chatgpt.site`。只有用户点击生成按钮才提交问题和牌阵；不会后台自动生成或自动重试。实际启用地址以 `src/config.js` 为准，空地址表示暂未启用。

每个浏览器有随机访问标识，尽力限制每分钟 3 次、每天 20 次；它不是身份认证。全站每天 100 次由独立持久化数据库强制限制，UTC+8 零点重置，失败请求也计数；同时最多处理 2 次 AI 请求。后端不保存问题和解读，API Key 不进入静态构建。部署细节见 `server/render/README.md`。

## 数据与使用说明

本应用无需注册。问题与记录保存在当前浏览器；主动生成 AI 解读时，本次问题、主题和牌面会经 Render 后端发送给模型服务商。清空浏览器数据可能丢失本地记录。链接分享使用 URL fragment 存放牌面数据，持有链接的人可读取分享内容。分享不会自动发布到社交平台。

页面托管服务为 GitHub Pages；中文字体尝试加载 Google Fonts，无法加载时使用设备字体。不包含广告或统计追踪。

解读仅供娱乐、自我探索与对话启发，不分析问题中描述的现实事实，不预测必然发生的事件。重大决定请依据现实信息和适当的专业意见。
