import { SPREADS, TOPICS } from './engine.js';

const CACHE_KEY = 'stellar-tarot-ai-v1';
const CACHE_LIMIT = 50;
const REQUEST_TIMEOUT_MS = 90_000;
const MESSAGES = Object.freeze({
  NOT_CONFIGURED: 'AI 解读正在准备中，请稍后再来。你仍可查看下方的牌意解读。',
  INVALID_ENDPOINT: 'AI 服务地址配置有误，请联系网站维护者。',
  INVALID_READING: '这份牌阵信息不完整，请重新抽牌后再试。',
  INVALID_REQUEST: '这份牌阵暂时无法提交，请重新打开解读后再试。',
  BODY_TOO_LARGE: '提交的内容过长，请缩短问题后再试。',
  UNSUPPORTED_MEDIA_TYPE: '暂时无法提交解读，请刷新页面后再试。',
  FORBIDDEN_ORIGIN: '当前页面尚未连接 AI 服务，请联系网站维护者。',
  RATE_LIMITED: '今天的 AI 解读请求较多，请稍后再试。',
  AI_TIMEOUT: 'AI 思考的时间有点长，请稍后重试。',
  AI_UNAVAILABLE: 'AI 服务暂时不可用，请稍后重试。',
  INVALID_AI_RESPONSE: 'AI 返回的内容不完整，请重试一次。',
  INVALID_RESPONSE: 'AI 返回的内容不完整，请重试一次。',
  NETWORK_ERROR: '暂时无法连接 AI 服务，请检查网络后重试。',
  CANCELLED: '已取消本次 AI 解读。',
});

export class AIClientError extends Error {
  constructor(code) {
    super(MESSAGES[code] || MESSAGES.AI_UNAVAILABLE);
    this.name = 'AIClientError';
    this.code = Object.hasOwn(MESSAGES, code) ? code : 'AI_UNAVAILABLE';
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function identity(reading) {
  if (!isObject(reading)) throw new AIClientError('INVALID_READING');
  const { spreadId, topicId, question, cards } = reading;
  const spread = SPREADS.find((item) => item.id === spreadId);
  if (!spread || !TOPICS.some((item) => item.id === topicId)
    || typeof question !== 'string' || question.length > 200
    || !Array.isArray(cards) || cards.length !== spread.count) {
    throw new AIClientError('INVALID_READING');
  }
  const seen = new Set();
  const draws = cards.map((card) => {
    if (!isObject(card) || typeof card.cardId !== 'string'
      || !/^[A-Za-z0-9_-]{1,100}$/.test(card.cardId)
      || typeof card.reversed !== 'boolean' || seen.has(card.cardId)) {
      throw new AIClientError('INVALID_READING');
    }
    seen.add(card.cardId);
    return { cardId: card.cardId, reversed: card.reversed };
  });
  return { spreadId, topicId, question, cards: draws };
}

/** Questions and card order belong to the identity; share IDs and timestamps do not. */
export function readingFingerprint(reading) {
  const safe = identity(reading);
  return JSON.stringify([
    safe.spreadId, safe.topicId, safe.question,
    safe.cards.map(({ cardId, reversed }) => [cardId, reversed]),
  ]);
}

function readingForRequest(reading) {
  const safe = identity(reading);
  if (typeof reading.id !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(reading.id)
    || !validTimestamp(reading.createdAt)) {
    throw new AIClientError('INVALID_READING');
  }
  return { id: reading.id, createdAt: reading.createdAt, ...safe };
}

function validTimestamp(value) {
  if (typeof value !== 'string' || value.length > 32) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function boundedText(value, maximum) {
  if (typeof value !== 'string' || value.length > maximum || !value.trim()) {
    throw new AIClientError('INVALID_RESPONSE');
  }
  const safe = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  if (!safe) throw new AIClientError('INVALID_RESPONSE');
  return safe;
}

/** Treat model output and persisted output as untrusted; return only supported fields. */
function validateResult(result, reading) {
  if (!isObject(result) || !isObject(result.analysis) || !validTimestamp(result.generatedAt)) {
    throw new AIClientError('INVALID_RESPONSE');
  }
  const value = result.analysis;
  if (!Array.isArray(value.cardInsights) || value.cardInsights.length !== reading.cards.length
    || !Array.isArray(value.actions) || value.actions.length !== 3) {
    throw new AIClientError('INVALID_RESPONSE');
  }
  const cardInsights = value.cardInsights.map((insight, index) => {
    if (!isObject(insight) || insight.cardId !== reading.cards[index].cardId) {
      throw new AIClientError('INVALID_RESPONSE');
    }
    return { cardId: insight.cardId, interpretation: boundedText(insight.interpretation, 2400) };
  });
  return {
    analysis: {
      title: boundedText(value.title, 120),
      overview: boundedText(value.overview, 2400),
      cardInsights,
      synthesis: boundedText(value.synthesis, 4000),
      actions: value.actions.map((action) => boundedText(action, 600)),
      reflection: boundedText(value.reflection, 1200),
      closing: boundedText(value.closing, 1000),
    },
    model: boundedText(result.model, 120),
    generatedAt: result.generatedAt,
  };
}

function endpointBase(endpoint) {
  if (endpoint === undefined || endpoint === null || endpoint === '') return '';
  if (typeof endpoint !== 'string') throw new AIClientError('INVALID_ENDPOINT');
  try {
    const url = new URL(endpoint);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local))
      || url.username || url.password || url.search || url.hash) {
      throw new Error('Invalid endpoint');
    }
    return url.href.replace(/\/+$/, '');
  } catch {
    throw new AIClientError('INVALID_ENDPOINT');
  }
}

function safeStorage(provided) {
  try { return provided === undefined ? globalThis.localStorage : provided; } catch { return null; }
}

function cachedIdentity(fingerprint) {
  const parts = JSON.parse(fingerprint);
  if (!Array.isArray(parts) || parts.length !== 4 || !Array.isArray(parts[3])) return null;
  const reading = identity({
    spreadId: parts[0], topicId: parts[1], question: parts[2],
    cards: parts[3].map((card) => ({ cardId: card[0], reversed: card[1] })),
  });
  return readingFingerprint(reading) === fingerprint ? reading : null;
}

function readCache(storage) {
  try {
    const raw = storage?.getItem(CACHE_KEY);
    if (!raw || raw.length > 2_000_000) return [];
    const parsed = JSON.parse(raw);
    if (parsed?.version !== 1 || !Array.isArray(parsed.entries)) return [];
    const entries = [];
    const seen = new Set();
    for (const entry of parsed.entries.slice(0, CACHE_LIMIT)) {
      try {
        if (!isObject(entry) || typeof entry.fingerprint !== 'string' || entry.fingerprint.length > 1600
          || seen.has(entry.fingerprint)) continue;
        const reading = cachedIdentity(entry.fingerprint);
        if (!reading) continue;
        entries.push({ fingerprint: entry.fingerprint, result: validateResult(entry.result, reading) });
        seen.add(entry.fingerprint);
      } catch { /* A corrupt entry does not invalidate the remaining local results. */ }
    }
    return entries;
  } catch { return []; }
}

function saveCache(storage, entries) {
  try { storage?.setItem(CACHE_KEY, JSON.stringify({ version: 1, entries: entries.slice(0, CACHE_LIMIT) })); } catch {
    // Private browsing and full storage must not discard a freshly generated interpretation.
  }
}

function serverError(status, body) {
  const code = body?.error?.code;
  if (Object.hasOwn(MESSAGES, code)) return new AIClientError(code);
  if (status === 429) return new AIClientError('RATE_LIMITED');
  if (status === 504) return new AIClientError('AI_TIMEOUT');
  if (status === 400 || status === 413 || status === 415) return new AIClientError('INVALID_REQUEST');
  return new AIClientError('AI_UNAVAILABLE');
}

export function createAIClient({ endpoint = '', fetchImpl = globalThis.fetch, storage } = {}) {
  const localStorage = safeStorage(storage);
  // Keep this instance usable when persistence is blocked or runs out of space.
  let memoryCache = readCache(localStorage);
  const pendingRequests = new Set();
  // Resolve errors when called, so a bad deployment setting cannot break local tarot readings.
  function base() {
    const value = endpointBase(endpoint);
    if (!value) throw new AIClientError('NOT_CONFIGURED');
    return value;
  }

  async function fetchJSON(path, options = {}, externalSignal) {
    const url = `${base()}${path}`;
    if (externalSignal?.aborted) throw new AIClientError('CANCELLED');
    const controller = new AbortController();
    let timedOut = false;
    let abortListener;
    const cancellation = new Promise((_, reject) => {
      abortListener = () => reject(new AIClientError(timedOut ? 'AI_TIMEOUT' : 'CANCELLED'));
      controller.signal.addEventListener('abort', abortListener, { once: true });
    });
    const cancel = () => controller.abort();
    externalSignal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, REQUEST_TIMEOUT_MS);
    try {
      return await Promise.race([cancellation, (async () => {
        const response = await fetchImpl(url, {
          ...options,
          signal: controller.signal,
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
          cache: 'no-store',
          redirect: 'error',
        });
        let body;
        try { body = await response.json(); } catch {
          throw response.ok ? new AIClientError('INVALID_RESPONSE') : serverError(response.status);
        }
        if (!response.ok) throw serverError(response.status, body);
        return body;
      })()]);
    } catch (error) {
      if (error instanceof AIClientError) throw error;
      if (controller.signal.aborted) throw new AIClientError(timedOut ? 'AI_TIMEOUT' : 'CANCELLED');
      throw new AIClientError('NETWORK_ERROR');
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', cancel);
      controller.signal.removeEventListener('abort', abortListener);
    }
  }

  return {
    getCached(reading) {
      try {
        const fingerprint = readingFingerprint(reading);
        const result = memoryCache.find((entry) => entry.fingerprint === fingerprint)?.result;
        return result ? validateResult(result, reading) : null;
      } catch { return null; }
    },
    async request(reading, { signal } = {}) {
      base();
      const safe = readingForRequest(reading);
      const fingerprint = readingFingerprint(safe);
      const pending = { fingerprint, invalidated: false };
      pendingRequests.add(pending);
      try {
        const result = validateResult(await fetchJSON('/api/interpret', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reading: safe }),
        }, signal), safe);
        if (pending.invalidated || signal?.aborted) throw new AIClientError('CANCELLED');
        memoryCache = [
          { fingerprint, result: validateResult(result, safe) },
          ...memoryCache.filter((entry) => entry.fingerprint !== fingerprint),
        ].slice(0, CACHE_LIMIT);
        saveCache(localStorage, memoryCache);
        return result;
      } finally {
        pendingRequests.delete(pending);
      }
    },
    clear(reading) {
      try {
        const fingerprint = readingFingerprint(reading);
        for (const pending of pendingRequests) {
          if (pending.fingerprint === fingerprint) pending.invalidated = true;
        }
        memoryCache = memoryCache.filter((entry) => entry.fingerprint !== fingerprint);
        saveCache(localStorage, memoryCache);
      } catch { /* Invalid readings do not affect other cached results. */ }
    },
    clearAll() {
      for (const pending of pendingRequests) pending.invalidated = true;
      memoryCache = [];
      try { localStorage?.removeItem(CACHE_KEY); } catch { /* Storage may be disabled. */ }
    },
    async health() {
      const value = await fetchJSON('/api/health', { method: 'GET' });
      if (!isObject(value) || typeof value.ready !== 'boolean') throw new AIClientError('INVALID_RESPONSE');
      return { ready: value.ready, provider: boundedText(value.provider, 120), model: boundedText(value.model, 120) };
    },
  };
}

export function analysisToText(result) {
  const { analysis, model, generatedAt } = result;
  return [
    '星间 · AI 深度解读', analysis.title, '',
    analysis.overview, '',
    ...analysis.cardInsights.flatMap((insight, index) => [`第 ${index + 1} 张牌`, insight.interpretation, '']),
    '牌阵的关联', analysis.synthesis, '',
    '可以尝试的行动', ...analysis.actions.map((action, index) => `${index + 1}. ${action}`), '',
    '留给自己的问题', analysis.reflection, '', analysis.closing, '',
    `由 AI 生成 · ${model}`, `生成时间：${generatedAt}`,
    '塔罗与 AI 解读仅供娱乐和自我探索，不代表事实或确定的预测。',
  ].join('\n');
}
