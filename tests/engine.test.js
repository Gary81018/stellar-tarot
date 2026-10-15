import test from 'node:test';
import assert from 'node:assert/strict';
import { SPREADS, TOPICS, drawCards, createReading, validateReading, encodeReading, decodeReading, summarizeReading } from '../src/engine.js';
import { cards as realDeck } from '../src/deck.js';

const deck = Array.from({ length: 78 }, (_, index) => ({
  id: `card-${index}`,
  name: `测试牌${index}`,
  keywords: [`线索${index}`, '耐心'],
  upright: { meaning: '可以留意正在出现的机会。', advice: '记录今天最想尝试的小事。' },
  reversed: { meaning: '可以给尚未理清的感受一些空间。', advice: '先停下来整理自己的需要。' },
}));

function fixture(overrides = {}) {
  return {
    id: 'test-reading-123',
    createdAt: new Date().toISOString(),
    spreadId: 'three',
    topicId: 'general',
    question: '我该如何理解眼前的选择？🌙',
    cards: [
      { cardId: 'card-0', reversed: false },
      { cardId: 'card-1', reversed: true },
      { cardId: 'card-2', reversed: false },
    ],
    ...overrides,
  };
}

test('every spread can be created with exactly its declared unique cards', () => {
  const original = structuredClone(deck);
  for (const spread of SPREADS) {
    for (const topic of TOPICS) {
      const reading = createReading({ spreadId: spread.id, topicId: topic.id, question: topic.prompt }, deck);
      assert.equal(reading.cards.length, spread.count);
      assert.equal(new Set(reading.cards.map((card) => card.cardId)).size, spread.count);
      assert.deepEqual(validateReading(reading, deck), reading);
    }
  }
  assert.deepEqual(deck, original);
});

test('full-deck draws never duplicate cards, and disabling reversals is honored', () => {
  for (let iteration = 0; iteration < 20; iteration += 1) {
    const result = drawCards(deck, deck.length, false);
    assert.equal(new Set(result.map((card) => card.cardId)).size, 78);
    assert.ok(result.every((card) => card.reversed === false));
  }
});

test('rejection sampling discards biased uint32 tail values before selecting a card', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  const sequence = [0xffffffff, 2]; // 2^32 - 1 is outside the unbiased range for n = 3.
  let calls = 0;
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: { getRandomValues(buffer) { buffer[0] = sequence[calls++]; return buffer; } },
  });
  try {
    assert.deepEqual(drawCards(deck.slice(0, 3), 1, false), [{ cardId: 'card-2', reversed: false }]);
    assert.equal(calls, 2);
  } finally {
    Object.defineProperty(globalThis, 'crypto', descriptor);
  }
});

test('draw validation rejects malformed decks, counts, and settings', () => {
  for (const badDeck of [null, [], [{}], [{ id: 'same' }, { id: 'same' }]]) {
    assert.throws(() => drawCards(badDeck, 1), TypeError);
  }
  for (const count of [0, -1, 0.5, 79, NaN, '3']) {
    assert.throws(() => drawCards(deck, count), RangeError);
  }
  assert.throws(() => drawCards(deck, 1, 'false'), TypeError);
});

test('new readings bound and sanitize question text, and reject unknown selections', () => {
  const reading = createReading({ spreadId: 'single', question: `\u0000  ${'月'.repeat(300)}  ` }, deck);
  assert.equal(reading.question.length, 200);
  assert.equal(reading.question, '月'.repeat(200));
  const emojiBoundary = createReading({ spreadId: 'single', question: `${'月'.repeat(199)}🌙` }, deck);
  assert.equal(emojiBoundary.question, '月'.repeat(199));
  assert.deepEqual(decodeReading(encodeReading(emojiBoundary), deck), emojiBoundary);
  assert.throws(() => createReading({ spreadId: 'unknown' }, deck), RangeError);
  assert.throws(() => createReading({ topicId: 'unknown' }, deck), RangeError);
  assert.throws(() => createReading({ question: {} }, deck), TypeError);
});

test('validation returns a new allowlisted object rather than trusting stored fields', () => {
  const source = fixture({ extra: 'not trusted' });
  source.cards[0].injected = true;
  const sanitized = validateReading(source, deck);
  assert.ok(sanitized);
  assert.equal('extra' in sanitized, false);
  assert.equal('injected' in sanitized.cards[0], false);
  assert.notEqual(source, sanitized);
  assert.notEqual(source.cards, sanitized.cards);
});

test('validation rejects malformed, future, duplicated, and unavailable reading data', () => {
  const invalid = [
    null, [], {},
    fixture({ id: '' }), fixture({ id: '<script>alert(1)</script>' }),
    fixture({ question: 'x'.repeat(201) }), fixture({ question: null }),
    fixture({ spreadId: 'missing' }), fixture({ topicId: 'missing' }),
    fixture({ createdAt: 'not a date' }),
    fixture({ createdAt: '2026-02-30T00:00:00.000Z' }),
    fixture({ createdAt: '1999-01-01T00:00:00.000Z' }),
    fixture({ createdAt: new Date(Date.now() + 3 * 86400000).toISOString() }),
    fixture({ cards: [{ cardId: 'card-0', reversed: false }] }),
    fixture({ cards: [ { cardId: 'card-0', reversed: false }, { cardId: 'card-0', reversed: true }, { cardId: 'card-2', reversed: false } ] }),
    fixture({ cards: [ { cardId: 'missing', reversed: false }, { cardId: 'card-1', reversed: true }, { cardId: 'card-2', reversed: false } ] }),
    fixture({ cards: [ { cardId: 'card-0', reversed: 'false' }, { cardId: 'card-1', reversed: true }, { cardId: 'card-2', reversed: false } ] }),
  ];
  for (const value of invalid) assert.equal(validateReading(value, deck), null);
});

test('share encoding round-trips Chinese, emoji, line breaks, and the complete question', () => {
  const reading = fixture({ question: '给未来的我：你好 🌙\nA & B / 是新的开始吗？' });
  const encoded = encodeReading(reading);
  assert.match(encoded, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeReading(encoded, deck), reading);
});

test('share decoding fails closed for oversized, corrupted, or invalid UTF-8 payloads', () => {
  for (const encoded of [null, '', 'a', '!!!', 'a'.repeat(8193), '_w', 'e30', encodeReading(fixture({ topicId: 'bad' }))]) {
    assert.equal(decodeReading(encoded, deck), null);
  }
  assert.throws(() => encodeReading({ text: 'x'.repeat(9000) }), RangeError);
});

test('local summaries reflect spread, topic, orientation, and actual card content', () => {
  const summary = summarizeReading(fixture({ topicId: 'love' }), deck);
  assert.match(summary.title, /感情关系/);
  assert.match(summary.overview, /过去的影响/);
  assert.match(summary.overview, /测试牌1（逆位）/);
  assert.match(summary.overview, /尚未理清的感受/);
  assert.match(summary.overview, /并不代表坏事一定发生/);
  assert.match(summary.reflection, /沟通确认/);
  assert.match(summary.action, /尊重边界/);
  assert.throws(() => summarizeReading({}, deck), TypeError);
});

test('every production card round-trips through sharing and supplies its oriented interpretation', () => {
  for (const card of realDeck) {
    for (const reversed of [false, true]) {
      const reading = fixture({ spreadId: 'single', cards: [{ cardId: card.id, reversed }] });
      assert.deepEqual(decodeReading(encodeReading(reading), realDeck), reading);
      const summary = summarizeReading(reading, realDeck);
      const meaning = reversed ? card.reversed : card.upright;
      assert.ok(summary.overview.includes(card.name), card.id);
      assert.ok(summary.overview.includes(meaning.meaning), card.id);
      assert.ok(summary.action.includes(meaning.advice), card.id);
      assert.ok(!Object.values(summary).some((text) => /undefined|\[object Object\]/.test(text)), card.id);
    }
  }
});
