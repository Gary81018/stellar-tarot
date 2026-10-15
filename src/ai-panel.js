import { createAIClient, analysisToText } from './ai-client.js';
import { buildReadingPrompt, DEEPSEEK_CHAT_URL } from './ai-prompt.js';
import { cards } from './deck.js';
import { SPREADS } from './engine.js';
// Cache access only. This panel never sends an API request.
const client = createAIClient();
const deck = new Map(cards.map(card => [card.id,card]));
const escape = value => String(value ?? '').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const paragraph = value => `<p>${escape(value).replace(/\n/g,'<br>')}</p>`;

function renderSavedAnalysis(reading) {
  const result = client.getCached(reading);
  if (!result) return '';
  const spread = SPREADS.find(item=>item.id===reading.spreadId);
    const analysis=result.analysis;
    return `<div class="ai-analysis"><p class="ai-result-label">DEEPSEEK · 已保存在此设备的解读</p><h3>${escape(analysis.title)}</h3>${paragraph(analysis.overview)}<div class="ai-card-insights">${analysis.cardInsights.map((item,index)=>`<section><h4><span>${String(index+1).padStart(2,'0')}</span>${escape(spread.positions[index])}<small>${escape(deck.get(item.cardId).name)} · ${reading.cards[index].reversed?'逆位':'正位'}</small></h4>${paragraph(item.interpretation)}</section>`).join('')}</div><section class="ai-synthesis"><h4>把这些线索放在一起</h4>${paragraph(analysis.synthesis)}</section><section class="ai-actions"><h4>接下来，可以试试这三件小事</h4><ol>${analysis.actions.map(action=>`<li>${escape(action)}</li>`).join('')}</ol></section><div class="ai-reflection"><span aria-hidden="true">☽</span><div><h4>留给你的一次思考</h4>${paragraph(analysis.reflection)}</div></div>${paragraph(analysis.closing)}<p class="ai-generated">AI 生成 · ${escape(result.model)} · 可下载保存这次解读<br>分析可能有偏差，请结合真实处境判断。</p></div>`;
}

export function renderAIPanel(reading) {
  const prompt = buildReadingPrompt(reading);
  const saved = renderSavedAnalysis(reading);
  return `<section class="ai-panel" id="ai-panel" aria-labelledby="ai-panel-title">
    <div class="ai-panel-heading"><div><p class="eyebrow">TAKE YOUR QUESTION A LITTLE FURTHER</p><h2 id="ai-panel-title">让 AI 读懂你的问题 <span class="ai-badge">前往 DeepSeek</span></h2></div><span class="ai-heading-star" aria-hidden="true">✧</span></div>
    <p class="ai-description">${reading.question ? '你的问题、牌阵和每张牌的正逆位，已经整理成一份完整提问。复制到 DeepSeek，让它围绕你的处境展开分析。' : '这次没有填写具体问题，提问将围绕所选主题与牌面展开。你也可以在 DeepSeek 粘贴后补充自己的处境，让解读更贴近你。'}</p>
    <ol class="ai-handoff-steps"><li><span>1</span>复制完整提问</li><li><span>2</span>打开 DeepSeek</li><li><span>3</span>粘贴并发送</li></ol>
    <div class="ai-handoff-actions"><button class="button primary" data-action="ai-copy-prompt">复制完整提问 <span aria-hidden="true">⧉</span></button><a class="button secondary" href="${DEEPSEEK_CHAT_URL}" target="_blank" rel="noopener noreferrer">打开 DeepSeek <span aria-hidden="true">↗</span><span class="sr-only">（新窗口）</span></a></div>
    <p class="ai-copy-status" id="ai-copy-status" role="status" aria-live="polite"></p>
    <details class="ai-prompt-preview" id="ai-prompt-preview"><summary>查看提问 / 手动复制</summary><label class="field-label" for="ai-prompt-text">将下面的完整内容粘贴到 DeepSeek 对话框</label><textarea id="ai-prompt-text" readonly rows="9" spellcheck="false">${escape(prompt)}</textarea><p>也可以粘贴到你常用的 AI 应用中，无需重新抽牌。</p></details>
    <p class="ai-consent">AI 解读会显示在 DeepSeek 中，可能需要登录 DeepSeek 账号。提问在本页生成；只有你在对方页面粘贴并发送后，才会提交问题和牌面。</p>
    ${saved ? `<details class="ai-saved-analysis" open><summary>查看以前保存的 AI 解读</summary>${saved}</details>` : ''}
  </section>`;
}

export function deleteAI(reading) {client.clear(reading);}
export function clearAIHistory() {client.clearAll();}
export function aiDownloadText(reading) {const result=client.getCached(reading);return result?`\n\n──────── 已保存的 AI 深度解读 ────────\n${analysisToText(result)}`:'';}
