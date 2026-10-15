import test from 'node:test';
import assert from 'node:assert/strict';
import { cards as deck } from '../src/deck.js';
import { SPREADS, validateReading, encodeReading, decodeReading } from '../src/engine.js';
import { prepareDrawSession, selectDraw } from '../src/draw-session.js';

test('a session offers all 78 unique cards without preselecting or mutating the deck', () => {
  const original = structuredClone(deck);
  const session = prepareDrawSession({ question: '  我该如何安排学习？  ', topicId: 'career' }, deck);
  assert.equal(session.pile.length, 78);
  assert.equal(new Set(session.pile.map((draw) => draw.cardId)).size, 78);
  assert.deepEqual(new Set(session.pile.map((draw) => draw.cardId)), new Set(deck.map((card) => card.id)));
  assert.ok(session.pile.every((draw) => typeof draw.reversed === 'boolean'));
  assert.deepEqual(session.reading.cards, []);
  assert.equal(session.reading.question, '我该如何安排学习？');
  assert.equal(session.reading.topicId, 'career');
  assert.equal(validateReading(session.reading, deck), null);
  assert.deepEqual(deck, original);
});

test('clicked positions, including the last card, become the final cards in selection order', () => {
  const session = prepareDrawSession({ spreadId: 'three' }, deck);
  const pileBefore = structuredClone(session.pile);
  const indices = [77, 0, 38];
  for (const [slot, index] of indices.entries()) {
    assert.deepEqual(selectDraw(session, index), pileBefore[index]);
    assert.deepEqual(session.reading.cards[slot], pileBefore[index]);
    assert.notEqual(session.reading.cards[slot], session.pile[index]);
    if (slot < indices.length - 1) assert.equal(validateReading(session.reading, deck), null);
  }
  assert.deepEqual(session.pile, pileBefore);
  assert.deepEqual(session.reading.cards, indices.map((index) => pileBefore[index]));
  assert.deepEqual(validateReading(session.reading, deck), session.reading);
  assert.deepEqual(decodeReading(encodeReading(session.reading), deck), session.reading);
});

test('every spread completes with its declared count using a custom deck length', () => {
  const smallDeck = deck.slice(0, 5);
  for (const spread of SPREADS) {
    const session = prepareDrawSession({ spreadId: spread.id, allowReversed: false }, smallDeck);
    assert.equal(session.pile.length, smallDeck.length);
    assert.ok(session.pile.every((draw) => draw.reversed === false));
    for (let index = 0; index < spread.count; index += 1) selectDraw(session, smallDeck.length - 1 - index);
    assert.equal(session.reading.cards.length, spread.count);
    assert.deepEqual(validateReading(session.reading, smallDeck), session.reading);
  }
});

test('enabled reversals are assigned during the shuffle and preserved when selected', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: {
      randomUUID: () => 'test-reading-reversed',
      getRandomValues(buffer) { buffer.fill(1); return buffer; },
    },
  });
  try {
    const session = prepareDrawSession({ spreadId: 'single', allowReversed: true }, deck);
    assert.ok(session.pile.every((draw) => draw.reversed === true));
    selectDraw(session, 77);
    assert.equal(session.reading.cards[0].reversed, true);
    assert.deepEqual(validateReading(session.reading, deck), session.reading);
  } finally {
    Object.defineProperty(globalThis, 'crypto', descriptor);
  }
});

test('invalid, duplicate and excess selections leave the reading unchanged', () => {
  const session = prepareDrawSession({ spreadId: 'three' }, deck);
  for (const index of [-1, 78, 0.5, NaN, '0']) assert.throws(() => selectDraw(session, index), RangeError);
  assert.deepEqual(session.reading.cards, []);
  selectDraw(session, 77);
  const oneCard = structuredClone(session.reading.cards);
  assert.throws(() => selectDraw(session, 77), RangeError);
  assert.deepEqual(session.reading.cards, oneCard);
  selectDraw(session, 1);
  selectDraw(session, 2);
  const completed = structuredClone(session.reading.cards);
  assert.throws(() => selectDraw(session, 3), RangeError);
  assert.deepEqual(session.reading.cards, completed);
  assert.throws(() => selectDraw(null, 0), TypeError);
});
