/** Local tarot readings: no account, network request, or prediction service. */
export const SPREADS = Object.freeze([
  {
    id: 'single',
    name: '今日一张',
    english: 'DAILY CARD',
    description: '给此刻的自己，一点温柔的提醒。',
    count: 1,
    positions: ['此刻的提醒'],
  },
  {
    id: 'three',
    name: '时间之流',
    english: 'PAST · PRESENT · POSSIBILITY',
    description: '回望来路，看清当下，探索接下来的可能。',
    count: 3,
    positions: ['过去的影响', '当下的状态', '可能的方向'],
  },
  {
    id: 'relationship',
    name: '关系之镜',
    english: 'RELATIONSHIP',
    description: '理解自己的感受，探索互动与沟通。',
    count: 3,
    positions: ['我的感受', '关系的互动', '沟通的启发'],
  },
  {
    id: 'choice',
    name: '岔路之间',
    english: 'TWO PATHS',
    description: '看见两个选项的侧面，把选择权留给自己。',
    count: 3,
    positions: ['选择 A 的启发', '选择 B 的启发', '值得考虑的因素'],
  },
]);

export const TOPICS = Object.freeze([
  {
    id: 'general',
    name: '综合指引',
    prompt: '最近有什么值得我留意？',
    advice: '留意眼前真正能改变的一件小事。',
  },
  {
    id: 'love',
    name: '感情关系',
    prompt: '我可以怎样更好地理解这段关系？',
    advice: '把猜测换成一次真诚、尊重边界的沟通。',
  },
  {
    id: 'career',
    name: '工作学业',
    prompt: '面对眼前的工作或学业，我可以从哪里开始？',
    advice: '挑一个可验证的小目标，行动后再根据反馈调整。',
  },
  {
    id: 'growth',
    name: '自我成长',
    prompt: '我现在最需要理解自己的哪一面？',
    advice: '给自己留一点空间，记录真实感受与当下需要。',
  },
]);

const UINT32_RANGE = 0x100000000;
const MAX_ENCODED_LENGTH = 8192;
const MAX_QUESTION_LENGTH = 200;
const EARLIEST_DATE = Date.UTC(2000, 0, 1);
const FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000;

function secureCrypto() {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('当前浏览器不支持安全随机数，请使用新版浏览器。');
  }
  return globalThis.crypto;
}

// Rejection sampling avoids the bias introduced by taking an arbitrary uint32 modulo n.
function randomBelow(maximum) {
  const limit = UINT32_RANGE - (UINT32_RANGE % maximum);
  const buffer = new Uint32Array(1);
  let value;
  do {
    secureCrypto().getRandomValues(buffer);
    value = buffer[0];
  } while (value >= limit);
  return value % maximum;
}

function deckIds(deck) {
  if (!Array.isArray(deck) || deck.length === 0) {
    throw new TypeError('牌组不能为空。');
  }
  const ids = deck.map((card) => {
    if (!card || typeof card.id !== 'string' || !card.id || card.id.length > 100) {
      throw new TypeError('每张牌需要有效的唯一编号。');
    }
    return card.id;
  });
  if (new Set(ids).size !== ids.length) {
    throw new TypeError('牌组中不能包含重复编号。');
  }
  return ids;
}

/** Draw without replacement; neither the deck nor its cards are mutated. */
export function drawCards(deck, count, allowReversed = true) {
  const ids = deckIds(deck);
  if (!Number.isInteger(count) || count < 1 || count > ids.length) {
    throw new RangeError('抽牌数量必须是牌组范围内的正整数。');
  }
  if (typeof allowReversed !== 'boolean') {
    throw new TypeError('逆位设置必须为布尔值。');
  }
  const cards = [];
  for (let index = 0; index < count; index += 1) {
    const next = index + randomBelow(ids.length - index);
    [ids[index], ids[next]] = [ids[next], ids[index]];
    cards.push({ cardId: ids[index], reversed: allowReversed && randomBelow(2) === 1 });
  }
  return cards;
}

function newId() {
  const source = secureCrypto();
  if (typeof source.randomUUID === 'function') return source.randomUUID();
  const bytes = source.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function cleanQuestion(question) {
  return question.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, MAX_QUESTION_LENGTH)
    .replace(/[\uD800-\uDBFF]$/, ''); // Do not cut an emoji's UTF-16 surrogate pair in half.
}

export function createReading({ spreadId = 'three', topicId = 'general', question = '', allowReversed = true } = {}, deck) {
  const spread = SPREADS.find((item) => item.id === spreadId);
  if (!spread) throw new RangeError('未找到这个牌阵。');
  if (!TOPICS.some((item) => item.id === topicId)) throw new RangeError('未找到这个主题。');
  if (typeof question !== 'string') throw new TypeError('问题需要使用文字。');
  return {
    id: newId(),
    createdAt: new Date().toISOString(),
    spreadId,
    topicId,
    question: cleanQuestion(question),
    cards: drawCards(deck, spread.count, allowReversed),
  };
}

/** All persisted and shared data crosses this boundary before reaching the UI. */
export function validateReading(value, deck) {
  try {
    const validIds = new Set(deckIds(deck));
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const { id, createdAt, spreadId, topicId, question, cards } = value;
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(id)) return null;
    const spread = SPREADS.find((item) => item.id === spreadId);
    if (!spread || !TOPICS.some((item) => item.id === topicId)) return null;
    if (typeof question !== 'string' || question.length > MAX_QUESTION_LENGTH) return null;
    if (typeof createdAt !== 'string' || createdAt.length > 32) return null;
    const date = new Date(createdAt);
    const timestamp = date.getTime();
    if (!Number.isFinite(timestamp) || date.toISOString() !== createdAt) return null;
    if (timestamp < EARLIEST_DATE || timestamp > Date.now() + FUTURE_TOLERANCE_MS) return null;
    if (!Array.isArray(cards) || cards.length !== spread.count) return null;
    const uniqueCards = new Set();
    const sanitizedCards = [];
    for (const card of cards) {
      if (!card || typeof card !== 'object' || Array.isArray(card)) return null;
      if (!validIds.has(card.cardId) || uniqueCards.has(card.cardId) || typeof card.reversed !== 'boolean') return null;
      uniqueCards.add(card.cardId);
      sanitizedCards.push({ cardId: card.cardId, reversed: card.reversed });
    }
    return { id, createdAt, spreadId, topicId, question: cleanQuestion(question), cards: sanitizedCards };
  } catch {
    return null;
  }
}

/** URL-safe UTF-8 payload. A share link deliberately includes its saved question. */
export function encodeReading(reading) {
  const bytes = new TextEncoder().encode(JSON.stringify(reading));
  if (bytes.length > MAX_ENCODED_LENGTH * 0.75) throw new RangeError('解读内容过长，无法生成分享链接。');
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function decodeReading(encoded, deck) {
  try {
    if (typeof encoded !== 'string' || encoded.length === 0 || encoded.length > MAX_ENCODED_LENGTH) return null;
    if (!/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length % 4 === 1) return null;
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return validateReading(JSON.parse(text), deck);
  } catch {
    return null;
  }
}

const REFLECTIONS = {
  general: '哪些感受来自已经发生的事实，哪些只是你的担忧？今天你能主动改变哪一小步？',
  love: '你真正需要的是理解、陪伴，还是更清楚的边界？哪些想法可以通过沟通确认，而不是替对方作答？',
  career: '眼前的困难是信息不足、资源有限，还是目标不够清晰？你可以用什么小行动收集真实反馈？',
  growth: '你正在努力满足谁的期待？如果对自己多一点耐心，你最想照顾的需要是什么？',
};

export function summarizeReading(reading, deck) {
  const safeReading = validateReading(reading, deck);
  if (!safeReading) throw new TypeError('无法解读这份无效的牌阵。');
  const spread = SPREADS.find((item) => item.id === safeReading.spreadId);
  const topic = TOPICS.find((item) => item.id === safeReading.topicId);
  const selected = safeReading.cards.map((draw) => ({
    card: deck.find((card) => card.id === draw.cardId),
    reversed: draw.reversed,
  }));
  const keywords = [...new Set(selected.flatMap(({ card }) => Array.isArray(card.keywords) ? card.keywords.slice(0, 1) : []))];
  const theme = keywords.length ? keywords.map((word) => `「${word}」`).join('、') : '你的感受与选择';
  const observations = selected.map(({ card, reversed }, index) => {
    const meaning = (reversed ? card.reversed : card.upright)?.meaning;
    return `${spread.positions[index]} · ${card.name}${reversed ? '（逆位）' : '（正位）'}：${typeof meaning === 'string' ? meaning : '留意这张牌带给你的联想。'}`;
  });
  const last = selected.at(-1);
  const cardAdvice = (last.reversed ? last.card.reversed : last.card.upright)?.advice;
  const reversedNote = selected.some(({ reversed }) => reversed)
    ? '逆位可以提醒你留意内在感受、阻力或尚待整理的部分，并不代表坏事一定发生。'
    : '把这些意象当作观察自己的角度，让真实经历帮助你判断。';
  return {
    title: `关于${topic.name}，看见${theme}`,
    overview: `这组牌的线索是${theme}。\n\n${observations.join('\n\n')}\n\n${reversedNote}`,
    reflection: `${safeReading.question ? `回到你的问题「${safeReading.question}」：` : ''}${REFLECTIONS[topic.id]}`,
    action: `${typeof cardAdvice === 'string' ? `${cardAdvice} ` : ''}${topic.advice} 选择一个适合自己的小行动，再观察实际的变化。`,
  };
}
