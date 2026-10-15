# 星间 · STELLAR TAROT

一个可以分享给朋友的中文塔罗空间。奶油纸色、原创星象插画和温柔的中文牌意，适配手机与电脑。

**在线体验：https://Gary81018.github.io/stellar-tarot/**

## 功能

- 完整 78 张牌：22 张大阿尔卡纳与 56 张小阿尔卡纳，全部为原创 SVG 插画。
- 四种牌阵：今日一张、时间之流、关系之镜、岔路之间。
- 综合指引、感情关系、工作学业、自我成长四个主题，可输入自己的问题。
- 可选择正逆位；使用 Web Crypto 随机无放回抽牌。
- 预设牌意与本地规则组合的中文解读，不需要 API Key，也不调用 AI 服务。
- 最近 50 次记录保存在当前浏览器，可重读、删除、下载文本。
- 通过链接分享同一组牌；默认隐藏问题，勾选后才会包含问题。
- 可搜索、筛选的完整牌组图鉴。

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
- `styles.css`：响应式样式及减少动态效果支持。
- `tests/engine.test.js`：随机数、去重、数据边界、分享及真实牌组整合测试。
- `.github/workflows/deploy.yml`：自动测试和 GitHub Pages 发布。

## 数据与使用说明

本应用没有后台账户或数据库。问题与记录只保存在当前浏览器；清空浏览器数据可能丢失记录。链接分享使用 URL fragment 存放牌面数据，持有链接的人可读取分享内容。分享不会自动发布到社交平台。

页面托管服务为 GitHub Pages；中文字体尝试加载 Google Fonts，无法加载时使用设备字体。不包含广告或统计追踪。

解读仅供娱乐、自我探索与对话启发，不分析问题中描述的现实事实，不预测必然发生的事件。重大决定请依据现实信息和适当的专业意见。
