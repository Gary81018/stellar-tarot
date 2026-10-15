import { SPREADS, createReading, drawCards } from './engine.js';

/** A full shuffled deck whose face-down positions stay fixed while the user picks. */
export function prepareDrawSession(options = {}, deck) {
  // Reuse the engine's metadata validation and secure shuffle instead of a second RNG.
  const reading = createReading(options, deck);
  const pile = drawCards(deck, deck.length, options.allowReversed ?? true);
  reading.cards = [];
  return { reading, pile };
}

/** Append the actual clicked card. An incomplete reading must not be saved or shared. */
export function selectDraw(session, index) {
  const spread = SPREADS.find((item) => item.id === session?.reading?.spreadId);
  if (!spread || !Array.isArray(session?.pile) || !Array.isArray(session?.reading?.cards)) {
    throw new TypeError('抽牌会话无效，请重新洗牌。');
  }
  if (!Number.isInteger(index) || index < 0 || index >= session.pile.length) {
    throw new RangeError('请选择牌组中的一张牌。');
  }
  if (session.reading.cards.length >= spread.count) {
    throw new RangeError('这个牌阵已经抽齐。');
  }
  const draw = session.pile[index];
  if (session.reading.cards.some((card) => card.cardId === draw.cardId)) {
    throw new RangeError('这张牌已经选过了。');
  }
  const selected = { cardId: draw.cardId, reversed: draw.reversed };
  session.reading.cards.push(selected);
  return selected;
}
