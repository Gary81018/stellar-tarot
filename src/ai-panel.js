import { createAIClient, analysisToText } from './ai-client.js';
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
    return `<div class="ai-analysis"><p class="ai-result-label">AI · 已保存在此设备的解读</p><h3>${escape(analysis.title)}</h3>${paragraph(analysis.overview)}<div class="ai-card-insights">${analysis.cardInsights.map((item,index)=>`<section><h4><span>${String(index+1).padStart(2,'0')}</span>${escape(spread.positions[index])}<small>${escape(deck.get(item.cardId).name)} · ${reading.cards[index].reversed?'逆位':'正位'}</small></h4>${paragraph(item.interpretation)}</section>`).join('')}</div><section class="ai-synthesis"><h4>把这些线索放在一起</h4>${paragraph(analysis.synthesis)}</section><section class="ai-actions"><h4>接下来，可以试试这三件小事</h4><ol>${analysis.actions.map(action=>`<li>${escape(action)}</li>`).join('')}</ol></section><div class="ai-reflection"><span aria-hidden="true">☽</span><div><h4>留给你的一次思考</h4>${paragraph(analysis.reflection)}</div></div>${paragraph(analysis.closing)}<p class="ai-generated">AI 生成 · 可下载保存这次解读<br>分析可能有偏差，请结合真实处境判断。</p></div>`;
}

export function renderAIPanel(reading) {
  const saved = renderSavedAnalysis(reading);
  if (!saved) return '';
  return `<section class="ai-panel" id="ai-panel" aria-labelledby="ai-panel-title"><div class="ai-panel-heading"><div><p class="eyebrow">A READING YOU KEPT</p><h2 id="ai-panel-title">已保存的 AI 解读</h2></div><span class="ai-heading-star" aria-hidden="true">✧</span></div>${saved}</section>`;
}

export function deleteAI(reading) {client.clear(reading);}
export function clearAIHistory() {client.clearAll();}
export function aiDownloadText(reading) {const result=client.getCached(reading);return result?`\n\n──────── 已保存的 AI 深度解读 ────────\n${analysisToText(result)}`:'';}
