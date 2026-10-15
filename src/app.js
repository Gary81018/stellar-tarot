import { renderAIPanel, generateAI, cancelAI, deleteAI, clearAIHistory, aiDownloadText, aiEnabled } from './ai-panel.js';
import { readingFingerprint } from './ai-client.js';
import { supportAvailable, renderSupport, renderSupportCallout, bindSupportImages } from './support.js';
import { prepareDrawSession, selectDraw } from './draw-session.js';
import { cards, suitNames } from './deck.js';
import { cardArt, cardBack } from './art.js';
import { SPREADS, TOPICS, validateReading, encodeReading, decodeReading, summarizeReading } from './engine.js';

const $ = (selector) => document.querySelector(selector);
document.querySelectorAll('[data-action="support"]').forEach(button => { button.hidden = !supportAvailable(); });
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const deck = new Map(cards.map(card => [card.id, card]));
const storageKey = 'stellar-tarot-readings-v1';
const state = { spreadId: 'single', topicId: 'general', question: '', allowReversed: true, pending: null, drawSession: null, picked: [], current: null, filter: 'all', search: '', shared: false };
let toastTimer;
let modalTrigger;
let history = readHistory();

function readHistory() {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey) || '[]');
    return Array.isArray(raw) ? raw.slice(0, 50).map(item => validateReading(item, cards)).filter(Boolean) : [];
  } catch { return []; }
}
function writeHistory() {
  try { localStorage.setItem(storageKey, JSON.stringify(history.slice(0, 50))); return true; }
  catch { toast('浏览器未能保存记录，你仍可下载或分享这次解读。'); return false; }
}
function saveReading(reading) {
  history = [reading, ...history.filter(item => item.id !== reading.id)].slice(0, 50);
  return writeHistory();
}
function toast(message) {
  clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').classList.add('show');
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 4200);
}
function modal(content) {
  modalTrigger = document.activeElement;
  $('#modal-body').innerHTML = content;
  if (!$('#modal').open) $('#modal').showModal();
}
function closeModal() { $('#modal').close(); }
$('#modal').addEventListener('close', () => modalTrigger?.isConnected && modalTrigger.focus());
$('#modal').addEventListener('click', event => { if (event.target === $('#modal')) { const rect = $('#modal').getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeModal(); } });
const formatDate = (value) => new Intl.DateTimeFormat('zh-CN', {year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
const spreadOf = (id) => SPREADS.find(spread => spread.id === id) || SPREADS[0];
const topicOf = (id) => TOPICS.find(topic => topic.id === id) || TOPICS[0];
function go(hash) { if (location.hash === `#${hash}`) route(); else location.hash = hash; }
function miniSpread(spread) { return `<div class="mini-spread ${spread.id}" aria-hidden="true">${Array.from({length:spread.count}, (_, index) => `<span class="mini-card">${['✦','☽','✧'][index]}</span>`).join('')}</div>`; }
function renderHome() {
  return `<div class="container fade-in"><section class="hero"><div class="hero-copy"><p class="eyebrow">A LITTLE GUIDANCE FROM THE UNIVERSE</p><h1>在星光之间，<br>遇见<span>心里的答案。</span></h1><p class="hero-description">给生活按下片刻暂停，让直觉轻轻说话。<br>一张牌，一个新的视角，一次与自己的对话。</p><div class="hero-actions"><a href="#ritual" class="button primary">开启我的占卜 <span aria-hidden="true">↗</span></a><button class="text-button" data-action="guide">第一次来？了解塔罗 <span aria-hidden="true">→</span></button></div><p class="hero-note"><span aria-hidden="true">✧</span> 无需注册 · 跟随直觉 · 留一点时间给自己</p></div><div class="celestial-stage" aria-label="星星、月亮与太阳塔罗插画"><div class="orbit"></div><span class="sparkle s1" aria-hidden="true">✧</span><span class="sparkle s2" aria-hidden="true">✧</span><span class="sparkle s3" aria-hidden="true">✦</span><div class="hero-card left">${cardArt(deck.get('major-17'))}</div><div class="hero-card right">${cardArt(deck.get('major-19'))}</div><div class="hero-card center">${cardArt(deck.get('major-18'))}</div><p class="stage-caption">AS ABOVE, SO WITHIN · 如星辰，亦如你</p></div></section><div class="section-rule"><span>每一次相遇，都有它的意义</span></div><section class="spreads-section" aria-labelledby="spreads-title"><div class="section-heading"><div><h2 id="spreads-title">此刻，你想探索什么？</h2><p>选择一个牌阵，把心事交给片刻宁静。</p></div><span class="section-label">CHOOSE YOUR SPREAD</span></div><div class="spread-grid">${SPREADS.map((spread,index) => `<button class="spread-card ${index === 0 ? 'featured' : ''}" data-action="choose-spread" data-id="${spread.id}">${index === 0 ? '<span class="spread-tag">新手推荐</span>' : ''}${miniSpread(spread)}<h3>${spread.name}</h3><p>${spread.description}</p><span class="spread-meta">${spread.count} 张牌 · 约 ${spread.count === 1 ? '1' : '3'} 分钟</span><span class="arrow" aria-hidden="true">↗</span></button>`).join('')}</div></section><section class="quote-strip"><div><p>“ 答案不在远方，而在你愿意倾听的那一刻。”</p><p class="quote-small">78 张牌，78 种看见自己的方式。</p></div><span class="small-stars" aria-hidden="true">✧ ✦ ✧</span></section></div>`;
}
function renderRitual() {
  const spread = spreadOf(state.spreadId);
  return `<div class="container fade-in"><div class="page-top"><a href="#home" class="back-link">← 回到星间</a><p class="eyebrow">MAKE SPACE FOR YOURSELF</p><h1 class="page-title">先安静一下，听听自己。</h1><p class="page-subtitle">不必急着找到答案。带着一个问题，或只是带着此刻的你。</p></div><div class="ritual-layout"><form id="reading-form" class="ritual-form"><label class="field-label">今天想聊聊什么？</label><div class="topic-options" role="group" aria-label="选择占卜主题">${TOPICS.map(topic => `<button type="button" class="topic-button" data-action="topic" data-id="${topic.id}" aria-pressed="${topic.id === state.topicId}">${topic.name}</button>`).join('')}</div><label class="field-label" for="question">把心里的问题写下来 <small>选填 · <span id="char-count">${state.question.length}</span>/200</small></label><textarea id="question" name="question" maxlength="200" placeholder="${esc(topicOf(state.topicId).prompt)}">${esc(state.question)}</textarea><p class="field-hint">试着问“我可以如何……”；${state.spreadId === 'choice' ? '请在问题中写明选择 A 和选择 B。' : '一个开放的问题，能带来更多看待事情的角度。'}</p><div class="spread-select"><label for="spread">我的牌阵</label><select id="spread" name="spread">${SPREADS.map(item => `<option value="${item.id}" ${item.id === state.spreadId ? 'selected' : ''}>${item.name} · ${item.count} 张牌</option>`).join('')}</select></div><label class="check-row"><input type="checkbox" name="reversed" ${state.allowReversed ? 'checked' : ''}>包含逆位，让解读多一个角度</label><button class="button primary form-submit" type="submit">准备好了，开始洗牌 <span aria-hidden="true">✧</span></button><p class="field-hint">${aiEnabled ? '问题与抽牌记录保存在这台设备；只有点击 AI 深度解读时，才会将本次内容发送给 AI 服务。' : '问题与抽牌记录保存在这台设备，方便之后回顾；当前未启用在线 AI 生成。'}</p></form><aside class="ritual-aside"><div class="aside-card">${cardBack()}</div><h3>${spread.name}</h3><p>${spread.description}<br>放松肩膀，慢慢呼吸，<br>留意第一眼吸引你的牌。</p><div class="positions">${spread.positions.map(item => `<span class="position-pill">${item}</span>`).join('')}</div></aside></div></div>`;
}
function renderDraw() {
  if (!state.pending) { go('ritual'); return ''; }
  const spread = spreadOf(state.pending.spreadId);
  const complete = state.picked.length === spread.count;
  return `<div class="container draw-page fade-in"><div class="page-top"><a href="#ritual" class="back-link">← 调整我的问题</a><p class="eyebrow">LET YOUR INTUITION LEAD</p><h1 class="page-title">跟随直觉，慢慢选牌。</h1><p class="page-subtitle">完整 78 张牌已洗好。从下方选出 ${spread.count} 张牌，照见此刻的你。</p></div><div class="draw-toolbar"><div class="draw-progress" aria-label="抽牌进度">${Array.from({length:spread.count},(_,i)=>`<span class="progress-dot ${i < state.picked.length ? 'selected' : ''}">${i < state.picked.length ? '✓' : i+1}</span>`).join('')}</div><p class="draw-help" id="draw-help" aria-live="polite">${complete ? '你的牌已经相遇。准备好听听它们的故事了吗？' : `请选出第 ${state.picked.length+1} 张牌 · ${spread.positions[state.picked.length]}`}</p><div class="draw-selection" id="draw-selection">${selectedDraws()}</div><button class="button primary" id="show-result" data-action="show-result" ${complete ? '' : 'disabled'}>查看我的解读 <span aria-hidden="true">→</span></button></div><p class="deck-count">完整牌组 · 78 张 · 每张只能选择一次</p><div class="draw-grid">${Array.from({length:state.drawSession.pile.length}, (_,index) => drawButton(index)).join('')}</div></div>`;
}
function drawButton(index) {
  const slot = state.picked.indexOf(index);
  const chosen = slot >= 0;
  const complete = state.picked.length === spreadOf(state.pending.spreadId).count;
  const card = chosen ? state.pending.cards[slot] : null;
  return `<button class="draw-card ${chosen ? 'chosen' : complete ? 'inactive' : ''}" data-action="pick" data-index="${index}" aria-label="${chosen ? `已选：${deck.get(card.cardId).name}` : `选择第 ${index+1} 张牌，共 78 张`}" ${chosen || complete ? 'disabled' : ''}><span class="card-visual">${chosen ? `<span class="${card.reversed ? 'reversed-art' : ''}" style="display:block">${cardArt(deck.get(card.cardId))}</span>` : cardBack()}</span>${chosen ? `<span class="picked-number">${slot+1}</span>` : ''}</button>`;
}
function selectedDraws() { return state.pending.cards.map((pick,index)=>`<span>${index+1}. ${esc(deck.get(pick.cardId).name)} · ${pick.reversed?'逆位':'正位'}</span>`).join(''); }
function pickCard(index) {
  if (!state.pending || !state.drawSession || !Number.isInteger(index) || index < 0 || index >= state.drawSession.pile.length || state.picked.includes(index) || state.picked.length >= spreadOf(state.pending.spreadId).count) return;
  selectDraw(state.drawSession,index);
  state.picked.push(index);
  $('#draw-selection').innerHTML=selectedDraws();
  const selected = $(`[data-action="pick"][data-index="${index}"]`);
  selected.outerHTML = drawButton(index);
  const spread = spreadOf(state.pending.spreadId);
  const complete = state.picked.length === spread.count;
  document.querySelectorAll('.progress-dot').forEach((dot,i) => { if (i<state.picked.length) { dot.classList.add('selected'); dot.textContent='✓'; } });
  $('#draw-help').textContent = complete ? '你的牌已经相遇。准备好听听它们的故事了吗？' : `请选出第 ${state.picked.length+1} 张牌 · ${spread.positions[state.picked.length]}`;
  if (complete) {
    document.querySelectorAll('.draw-card:not(.chosen)').forEach(button=>{button.disabled=true;button.classList.add('inactive');});
    $('#show-result').disabled = false; $('#show-result').focus({preventScroll:true});
  } else document.querySelector('.draw-card:not(.chosen)')?.focus({preventScroll:true});
}
function renderResult(reading, shared=false) {
  state.current=reading; state.shared=shared;
  const spread=spreadOf(reading.spreadId), summary=summarizeReading(reading,cards);
  return `<div class="container results fade-in"><div class="result-top"><p class="eyebrow">${shared ? 'A READING SHARED WITH YOU' : 'A MOMENT OF CLARITY'}</p><h1 class="page-title">${shared ? '与你分享，一点星光。' : '这些牌，此刻与你相遇。'}</h1><p class="result-meta">${spread.name} · ${topicOf(reading.topicId).name} · ${formatDate(reading.createdAt)}</p>${reading.question ? `<p class="question-display">“ ${esc(reading.question)} ”</p>` : ''}</div><div class="result-cards">${reading.cards.map((pick,index)=>{const card=deck.get(pick.cardId);return `<article class="result-card"><p class="position-label">${String(index+1).padStart(2,'0')} / ${spread.positions[index]}</p><button class="card-frame ${pick.reversed ? 'reversed-art' : ''}" data-action="card-detail" data-id="${card.id}" aria-label="查看${card.name}的完整牌意">${cardArt(card)}</button><h3>${card.name}<span class="orientation">${pick.reversed ? '逆位' : '正位'}</span></h3><p class="keywords">${card.keywords.join(' · ')}</p></article>`;}).join('')}</div><div class="reading-content">${renderAIPanel(reading)}<p class="base-reading-label">基础牌意 · 按牌面与主题整理</p><p class="base-reading-note">以下解读按牌面与所选主题整理，供你参考和自我探索，并非针对具体问题生成的 AI 分析。</p><section class="reading-summary"><p class="eyebrow">THE THREAD BETWEEN YOUR CARDS</p><h2>${esc(summary.title)}</h2><p style="white-space:pre-line">${esc(summary.overview)}</p></section>${reading.cards.map((pick,index)=>{const card=deck.get(pick.cardId),meaning=pick.reversed?card.reversed:card.upright;return `<article class="interpretation"><h3><small>${String(index+1).padStart(2,'0')}</small>${spread.positions[index]}<small>— ${card.name} · ${pick.reversed?'逆位':'正位'}</small></h3><p>${esc(meaning.meaning)}</p><p class="advice">✧ 给你的提醒：${esc(meaning.advice)}</p></article>`;}).join('')}<div class="reflection"><section><h3>☽ 留给自己的一个问题</h3><p>${esc(summary.reflection)}</p></section><section><h3>✧ 可以试试的一小步</h3><p>${esc(summary.action)}</p></section></div><div class="result-actions"><button class="button primary" data-action="share">分享这份星光 ↗</button><button class="button secondary" data-action="download">保存解读 ↓</button>${shared ? '<button class="button secondary" data-action="save-shared">收藏这份解读 ＋</button>' : ''}<a class="button secondary" href="#ritual">再一次对话 ↻</a></div>${renderSupportCallout()}<p class="result-footnote">${shared ? '分享者主动分享的牌面与解读。' : '记录保存在当前浏览器中，最多保留最近 50 次。'}<br>${aiEnabled ? '基础牌意来自预设规则；AI 深度解读可按需生成，结果显示在当前页面。' : '基础牌意来自预设规则，当前未启用在线 AI 生成。'}仅供娱乐与自我探索。</p></div></div>`;
}
function filteredCards() { const query=state.search.toLowerCase().trim();return cards.filter(card=>(state.filter==='all'||card.suit===state.filter)&&(!query||`${card.name} ${card.english} ${card.keywords.join(' ')}`.toLowerCase().includes(query))); }
function libraryItems() { return filteredCards().map(card=>`<button class="library-card" data-action="card-detail" data-id="${card.id}" aria-label="查看${card.name}牌意">${cardArt(card)}<h3>${card.name}</h3><p>${card.keywords.join(' · ')}</p></button>`).join(''); }
function renderLibrary() {
 return `<div class="container fade-in"><div class="page-top"><p class="eyebrow">THE LANGUAGE OF SYMBOLS</p><h1 class="page-title">每一张牌，都有它的故事。</h1><p class="page-subtitle">认识 78 位安静的朋友。点开一张牌，了解它的正位与逆位。</p></div><div class="library-tools"><div class="filters" role="group" aria-label="按牌组筛选">${Object.entries({all:'全部牌组',...suitNames}).map(([id,name])=>`<button class="filter-button ${state.filter===id?'active':''}" data-action="filter" data-id="${id}" aria-pressed="${state.filter===id}">${esc(name)}</button>`).join('')}</div><div class="search-wrap"><input type="search" id="card-search" aria-label="搜索牌名或关键词" placeholder="搜索牌名或关键词…" value="${esc(state.search)}"></div></div><p class="count-label" id="card-count" aria-live="polite">共 ${filteredCards().length} 张牌</p><div class="library-grid" id="library-grid">${libraryItems()}</div><p id="no-cards" class="empty-state" ${filteredCards().length?'hidden':''}>没有找到这张牌，试试其他名字或关键词。</p></div>`;
}
function updateLibrary() { $('#library-grid').innerHTML=libraryItems();$('#card-count').textContent=`共 ${filteredCards().length} 张牌`;$('#no-cards').hidden=filteredCards().length>0; }
function renderJournal() {
 return `<div class="container fade-in"><div class="page-top"><div class="section-heading"><div><p class="eyebrow">LITTLE MOMENTS, KEPT CLOSE</p><h1 class="page-title">收好，每一次与自己的对话。</h1><p class="page-subtitle">只在这台设备上留存的星光。回头看看，也许会有新的发现。</p></div>${history.length?'<button class="text-button clear-history" data-action="clear-history">清空记录</button>':''}</div></div>${history.length ? `<div class="journal-grid">${history.map(reading=>`<article class="journal-entry"><time datetime="${reading.createdAt}">${formatDate(reading.createdAt)}</time><h3>${spreadOf(reading.spreadId).name} <span class="orientation">${topicOf(reading.topicId).name}</span></h3><p class="entry-question">${esc(reading.question||'给此刻的自己，一点温柔的提醒。')}</p><div class="journal-cards">${reading.cards.map(pick=>`<span>${deck.get(pick.cardId).name}${pick.reversed?' ↓':''}</span>`).join('')}</div><div class="entry-actions"><button class="text-button" data-action="open-reading" data-id="${reading.id}">重温这份解读 →</button><button class="delete-button" data-action="delete-reading" data-id="${reading.id}" aria-label="删除 ${formatDate(reading.createdAt)} 的${spreadOf(reading.spreadId).name}记录">删除</button></div></article>`).join('')}</div>` : '<section class="empty-state"><div class="empty-star" aria-hidden="true">✧</div><h2>这里，还在等第一束星光。</h2><p>完成一次占卜后，它会悄悄留在这里。<br>无需登录，给自己一个安静的开始。</p><a href="#ritual" class="button primary">开始第一次占卜 ↗</a></section>'}</div>`;
}
function cardDetail(id) {
 const card=deck.get(id);if(!card)return;
 modal(`<div class="card-detail"><div>${cardArt(card)}</div><div><h2 class="modal-title" id="modal-title">${card.name}</h2><small>${esc(card.english)}</small><p>${card.keywords.join(' · ')}</p><h3>正位 · 顺着这份能量</h3><p>${esc(card.upright.meaning)}</p><p>${esc(card.upright.advice)}</p><h3>逆位 · 换一个角度看</h3><p>${esc(card.reversed.meaning)}</p><p>${esc(card.reversed.advice)}</p></div></div>`);
}
function shareUrl() { const include=$('#include-question')?.checked;const safe={...state.current,question:include?state.current.question:''};return `${location.href.split('#')[0]}#reading=${encodeReading(safe)}`; }
function showShare() {
 if(!state.current)return;
 modal(`<div class="modal-copy"><h2 class="modal-title" id="modal-title">把这份星光，分享出去。</h2><p>朋友打开链接，就能看到同样的牌面与基础牌意。链接不包含 AI 解读，默认也不包含你的问题。</p>${state.current.question?'<label class="check-row"><input type="checkbox" id="include-question">也分享我写下的问题</label>':''}<p style="font-size:11px">持有链接的人可以看到分享内容，请只分享你愿意公开的部分。</p><label for="share-url" class="field-label">分享链接</label><textarea class="share-input" id="share-url" readonly></textarea><div class="modal-actions"><button class="button primary" data-action="copy-link">复制链接 ↗</button>${navigator.share?'<button class="button secondary" data-action="native-share">系统分享</button>':''}</div></div>`);
 $('#share-url').value=shareUrl();
}
async function copyLink() {
 const url=shareUrl();
 try { await navigator.clipboard.writeText(url);toast('链接已复制，发给想分享的朋友吧。'); }
 catch { $('#share-url').focus();$('#share-url').select();toast('请长按或按 Ctrl/Cmd+C 复制已选中的链接。'); }
}
function downloadReading() {
 if(!state.current)return;
 const reading=state.current,spread=spreadOf(reading.spreadId),summary=summarizeReading(reading,cards);
 const text=`星间 · STELLAR TAROT\n${spread.name} · ${formatDate(reading.createdAt)}\n${reading.question?`问题：${reading.question}\n`:''}\n${summary.title}\n${summary.overview}\n\n${reading.cards.map((pick,index)=>{const card=deck.get(pick.cardId),meaning=pick.reversed?card.reversed:card.upright;return `${spread.positions[index]}｜${card.name}（${pick.reversed?'逆位':'正位'}）\n${meaning.meaning}\n提醒：${meaning.advice}`;}).join('\n\n')}\n\n留给自己的问题：${summary.reflection}\n可以试试的一小步：${summary.action}\n\n基础牌意来自预设规则，仅供娱乐与自我探索。${aiDownloadText(reading)}`;
 const url=URL.createObjectURL(new Blob(['\ufeff',text],{type:'text/plain;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=`星间-${reading.createdAt.slice(0,10)}-${spread.name}.txt`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('已生成解读文本，正在下载。');
}
function route() {
 const hash=location.hash.slice(1)||'home';let html;
 if(hash==='main' && $('#main').children.length) { $('#main').focus(); return; }
 if(hash.startsWith('reading=')){
  const reading=decodeReading(hash.slice(8),cards);
  html=reading?renderResult(reading,true):'<div class="container"><section class="empty-state"><div class="empty-star">☽</div><h1 class="page-title">这束星光，暂时迷路了。</h1><p>分享链接不完整或格式不正确，请让朋友重新复制完整链接。</p><a href="#home" class="button primary">回到星间</a></section></div>';
 }else if(hash.startsWith('saved=')){
  const reading=history.find(item=>item.id===hash.slice(6));
  html=reading?renderResult(reading):renderJournal();
 }else if(hash==='ritual') html=renderRitual();
 else if(hash==='draw')html=renderDraw();
 else if(hash==='result'&&state.current)html=renderResult(state.current);
 else if(hash==='library')html=renderLibrary();
 else if(hash==='journal')html=renderJournal();
 else html=renderHome();
 if(!html)return;
 $('#main').innerHTML=html;
 document.querySelectorAll('[data-nav]').forEach(link=>{const active=link.dataset.nav===(hash==='library'?'library':hash==='journal'||hash.startsWith('saved=')?'journal':'home');link.classList.toggle('active',active);if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
 window.scrollTo({top:0,behavior:'instant'});$('#main').focus({preventScroll:true});
}
document.addEventListener('input',event=>{
 if(event.target.id==='question'){state.question=event.target.value;$('#char-count').textContent=state.question.length;}
 if(event.target.id==='card-search'){state.search=event.target.value;updateLibrary();}
});
document.addEventListener('change',event=>{
 if(event.target.id==='spread'){state.spreadId=event.target.value;$('#main').innerHTML=renderRitual();$('#spread').focus();}
 if(event.target.name==='reversed')state.allowReversed=event.target.checked;
 if(event.target.id==='include-question')$('#share-url').value=shareUrl();
});
document.addEventListener('submit',event=>{
 if(event.target.id!=='reading-form')return;event.preventDefault();
 try { state.drawSession=prepareDrawSession({spreadId:state.spreadId,topicId:state.topicId,question:state.question,allowReversed:state.allowReversed},cards);state.pending=state.drawSession.reading;state.picked=[];go('draw'); }
 catch(error){toast(error.message||'暂时无法抽牌，请换一个新版浏览器重试。');}
});
document.addEventListener('click',async event=>{
 const button=event.target.closest('[data-action]');if(!button)return;
 const {action,id}=button.dataset;
 if(action==='choose-spread'){state.spreadId=id;go('ritual');}
 else if(action==='topic'){state.topicId=id;document.querySelectorAll('.topic-button').forEach(item=>item.setAttribute('aria-pressed',item.dataset.id===id));$('#question').placeholder=topicOf(id).prompt;}
 else if(action==='pick')pickCard(Number(button.dataset.index));
 else if(action==='show-result'){if(!state.pending||state.picked.length!==spreadOf(state.pending.spreadId).count)return;state.current=state.pending;saveReading(state.current);state.pending=null;state.drawSession=null;go(`saved=${state.current.id}`);}
 else if(action==='card-detail')cardDetail(id);
 else if(action==='filter'){state.filter=id;document.querySelectorAll('.filter-button').forEach(item=>{item.classList.toggle('active',item.dataset.id===id);item.setAttribute('aria-pressed',item.dataset.id===id);});updateLibrary();}
 else if(action==='open-reading')go(`saved=${id}`);
 else if(action==='ai-generate'){const reading=state.current;if(!aiEnabled||!reading)return;await generateAI(reading,()=>{if(state.current && readingFingerprint(state.current)===readingFingerprint(reading) && $('#ai-panel')) $('#ai-panel').outerHTML=renderAIPanel(reading);});}
 else if(action==='ai-cancel'){if(!state.current)return;cancelAI(state.current);if($('#ai-panel'))$('#ai-panel').outerHTML=renderAIPanel(state.current);toast('已取消等待；基础牌意仍可阅读。');}
 else if(action==='share')showShare();
 else if(action==='copy-link')await copyLink();
 else if(action==='native-share'){try{await navigator.share({title:'星间 · 一份与你分享的塔罗解读',text:'送你一点星光，看看这些牌的故事。',url:shareUrl()});}catch(error){if(error.name!=='AbortError')toast('系统分享暂不可用，你可以复制链接。');}}
 else if(action==='download')downloadReading();
 else if(action==='support'&&supportAvailable()){modal(renderSupport());bindSupportImages($('#modal-body'));}
 else if(action==='save-shared'){if(history.some(item=>item.id===state.current.id))toast('这份解读已在记录中，原有问题已保留。');else if(saveReading(state.current))toast('这份星光已收藏到我的记录。');}
 else if(action==='close-modal')closeModal();
 else if(action==='delete-reading'||action==='clear-history'){
  modal(`<div class="modal-copy"><h2 class="modal-title" id="modal-title">${action==='clear-history'?'清空所有记录？':'告别这次对话？'}</h2><p>记录只保存在当前浏览器，删除后无法恢复。你也可以先下载解读，留作纪念。</p><div class="modal-actions"><button class="button primary" data-action="confirm-delete" data-id="${esc(id||'all')}">确认删除</button><button class="button secondary" data-action="close-modal">再留一会儿</button></div></div>`);
 }else if(action==='confirm-delete'){if(id==='all')clearAIHistory();else {const removed=history.find(item=>item.id===id);if(removed)deleteAI(removed);}history=id==='all'?[]:history.filter(item=>item.id!==id);writeHistory();closeModal();route();toast('记录已删除。');}
 else if(action==='guide')modal('<div class="modal-copy"><p class="eyebrow">A GENTLE BEGINNING</p><h2 class="modal-title" id="modal-title">塔罗，从一次倾听开始。</h2><p>塔罗用图像和象征，帮助我们从不同角度理解感受。星间包含 22 张大阿尔卡纳与 56 张小阿尔卡纳，每张牌都有自己的故事。</p><ol><li><strong>选一个牌阵。</strong>第一次来，可以从“今日一张”开始。</li><li><strong>带着一个开放的问题。</strong>例如“我可以如何面对眼前的变化？”</li><li><strong>凭直觉选牌。</strong>完整 78 张牌在洗牌时随机排列，并决定正逆位；你点击的位置就是抽到的那张牌。</li><li><strong>读一读，也问问自己。</strong>留意有共鸣的部分，试着写下想法。</li></ol><p>逆位不等于坏事，也可能提醒你停一停、向内看。牌无法读出他人的想法，也不会决定未来；你始终拥有自己的选择。</p><div class="modal-actions"><button class="button primary" data-action="start-from-guide">开始我的第一次占卜 ↗</button></div></div>');
 else if(action==='start-from-guide'){closeModal();go('ritual');}
 else if(action==='privacy')modal(`<div class="modal-copy"><h2 class="modal-title" id="modal-title">一个留给自己的空间。</h2><p><strong>你的记录</strong><br>问题与抽牌记录保存在当前浏览器的本地存储中，最多 50 条。清除浏览器数据或使用无痕模式可能使记录丢失。以前保存在此设备上的 AI 解读仍可查看和下载。</p><p><strong>关于 AI 解读</strong><br>${aiEnabled ? '只有主动点击“生成 AI 深度解读”时，当前问题、主题、牌阵和牌面才会通过后端发送给 AI 服务。解读在当前页面显示，并保存在此设备，方便查看和下载；模型服务商会按其政策处理请求。为控制调用次数，浏览器还会保存并发送一个随机访客标识，后端只保留它的每日散列计数。' : '当前未启用在线 AI 生成，问题不会提交给 AI 服务。以前保存在此设备上的 AI 解读仍可查看和下载。'}</p><p><strong>分享给朋友</strong><br>分享链接包含牌面、牌阵、主题和时间。问题默认不分享，只有勾选后才会加入。AI 解读不写入分享链接；下载文本会包含此设备已有的 AI 解读。持有链接的人可以读取分享内容。</p><p><strong>关于解读</strong><br>基础牌意采用预设中文牌意与本地规则，不会深入理解具体问题。抽牌从完整的 78 张牌中进行，使用浏览器的随机数功能。AI 分析可能存在偏差，请结合真实处境判断。</p><p><strong>关于网站</strong><br>页面由 GitHub Pages 托管，字体可能从 Google Fonts 加载；这些服务会按其政策处理访问请求。星间不接入广告、追踪统计或账户系统。</p></div>`);
});
window.addEventListener('hashchange',route);
window.addEventListener('storage',event=>{if(event.key===storageKey||event.key===null){history=readHistory();if(location.hash==='#journal')route();}});
route();
