import { createAIClient, readingFingerprint, analysisToText } from './ai-client.js';
import { AI_ENDPOINT } from './config.js';
import { cards } from './deck.js';
import { SPREADS } from './engine.js';
export const aiEnabled = typeof AI_ENDPOINT === 'string' && AI_ENDPOINT.trim().length > 0;
const client = createAIClient({endpoint: aiEnabled ? AI_ENDPOINT.trim() : ''});
const deck = new Map(cards.map(card => [card.id,card]));
const jobs = new Map();
const errors = new Map();
const escape = value => String(value ?? '').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const paragraph = value => `<p>${escape(value).replace(/\n/g,'<br>')}</p>`;

export function renderAIPanel(reading) {
  const key = readingFingerprint(reading);
  const result = client.getCached(reading);
  if (!aiEnabled && !result) return '';
  const loading = aiEnabled && jobs.has(key);
  const error = errors.get(key);
  const spread = SPREADS.find(item=>item.id===reading.spreadId);
  let content;
  if(result) {
    const analysis=result.analysis;
    content=`<div class="ai-analysis"><p class="ai-result-label">${aiEnabled ? 'AI · 为这一次提问而写' : 'AI · 已保存在此设备的解读'}</p><h3>${escape(analysis.title)}</h3>${paragraph(analysis.overview)}<div class="ai-card-insights">${analysis.cardInsights.map((item,index)=>`<section><h4><span>${String(index+1).padStart(2,'0')}</span>${escape(spread.positions[index])}<small>${escape(deck.get(item.cardId).name)} · ${reading.cards[index].reversed?'逆位':'正位'}</small></h4>${paragraph(item.interpretation)}</section>`).join('')}</div><section class="ai-synthesis"><h4>把这些线索放在一起</h4>${paragraph(analysis.synthesis)}</section><section class="ai-actions"><h4>接下来，可以试试这三件小事</h4><ol>${analysis.actions.map(action=>`<li>${escape(action)}</li>`).join('')}</ol></section><div class="ai-reflection"><span aria-hidden="true">☽</span><div><h4>留给你的一次思考</h4>${paragraph(analysis.reflection)}</div></div>${paragraph(analysis.closing)}<p class="ai-generated">AI 生成 · 可下载保存这次解读<br>分析可能有偏差，请结合真实处境判断。</p></div>`;
  } else if(loading) {
    content='<div class="ai-loading" role="status"><span class="ai-orbit" aria-hidden="true">✦</span><div><h3>正在把你的问题，与这些牌连接起来…</h3><p>通常需要几十秒。请稍等，不需要重新抽牌。取消等待不会撤回已经发送的请求。</p></div></div><button class="text-button" data-action="ai-cancel">取消等待</button>';
  } else {
    content=`<p class="ai-description">${reading.question?'让 AI 围绕你写下的问题，解读每张牌与你的处境之间的联系，梳理牌组线索，并给出可以尝试的行动。':'这次没有填写问题。AI 会围绕你选择的主题与牌面展开分析；填写具体问题后，解读会更有针对性。'}</p><div class="ai-features"><span>问题与处境</span><span>逐张牌深入分析</span><span>牌组的联系</span><span>具体行动建议</span></div>${error?`<p class="ai-error" role="alert">${escape(error)}</p>`:''}<button class="button primary" data-action="ai-generate">${error?'重新尝试':'生成 AI 深度解读'} <span aria-hidden="true">✧</span></button><p class="ai-consent">点击后，会将本次问题、主题和抽到的牌发送给 AI 服务，解读会直接显示在这里。<br>无需重新抽牌；基础牌意始终可用。</p>`;
  }
  return `<section class="ai-panel" id="ai-panel" aria-labelledby="ai-panel-title" aria-busy="${loading}"><div class="ai-panel-heading"><div><p class="eyebrow">${aiEnabled ? 'A READING, JUST FOR YOU' : 'A READING YOU KEPT'}</p><h2 id="ai-panel-title">${aiEnabled ? 'AI 深度解读' : '已保存的 AI 解读'}</h2></div><span class="ai-heading-star" aria-hidden="true">✧</span></div>${content}</section>`;
}
export async function generateAI(reading, onUpdate = () => {}) {
  if (!aiEnabled) return;
  const key=readingFingerprint(reading);
  if(jobs.has(key)||client.getCached(reading))return;
  const controller=new AbortController();jobs.set(key,controller);errors.delete(key);onUpdate();
  try { await client.request(reading,{signal:controller.signal}); }
  catch(error) { if(!controller.signal.aborted)errors.set(key,error.code === 'NETWORK_ERROR' ? '未能连接 AI 服务。可能是服务访问受限或连接暂时中断，请稍后再试；基础牌意仍可阅读。' : error.message || 'AI 暂时没有回应，请稍后再试。'); }
  finally { if(jobs.get(key)===controller)jobs.delete(key);onUpdate(); }
}
export function cancelAI(reading) {const key=readingFingerprint(reading);jobs.get(key)?.abort();jobs.delete(key);errors.delete(key);}
export function deleteAI(reading) {cancelAI(reading);client.clear(reading);}
export function clearAIHistory() {for(const controller of jobs.values())controller.abort();jobs.clear();errors.clear();client.clearAll();}
export function aiDownloadText(reading) {const result=client.getCached(reading);return result?`\n\n──────── AI 深度解读 ────────\n${analysisToText({...result,model:''}).replace('由 AI 生成 · \n','由 AI 生成\n')}`:'';}
