import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReadingPrompt } from '../src/ai-prompt.js';
import { cards } from '../src/deck.js';
import { SPREADS } from '../src/engine.js';

function fixture(overrides = {}) {
  return {
    id: 'prompt-reading-123',
    createdAt: new Date().toISOString(),
    spreadId: 'three',
    topicId: 'career',
    question: '我可以怎样更有条理地准备考试？',
    cards: [
      { cardId: 'swords-2', reversed: false },
      { cardId: 'major-0', reversed: true },
      { cardId: 'pentacles-8', reversed: false },
    ],
    ...overrides,
  };
}

test('all four spreads preserve card order, positions, names, and oriented meaning', () => {
  for (const spread of SPREADS) {
    const reading = fixture({ spreadId: spread.id, cards: fixture().cards.slice(0, spread.count) });
    const prompt = buildReadingPrompt(reading);
    assert.ok(prompt.includes(`牌阵：${spread.name}`));
    let previousPosition = -1;
    for (const [index, draw] of reading.cards.entries()) {
      const card = cards.find((item) => item.id === draw.cardId);
      const selected = draw.reversed ? card.reversed : card.upright;
      const other = draw.reversed ? card.upright : card.reversed;
      const label = `${index + 1}. ${spread.positions[index]}：${card.name}（${card.english}，${draw.reversed ? '逆位' : '正位'}）`;
      const position = prompt.indexOf(label);
      assert.ok(position > previousPosition, label);
      previousPosition = position;
      assert.ok(prompt.includes(selected.meaning));
      assert.ok(prompt.includes(selected.advice));
      assert.ok(!prompt.includes(other.meaning));
    }
    assert.ok(prompt.includes('主题：工作学业'));
    assert.ok(prompt.includes('挑一个可验证的小目标'));
  }
});

test('a blank question is acknowledged without inventing a question or circumstances', () => {
  const prompt = buildReadingPrompt(fixture({ question: '' }));
  assert.ok(prompt.includes('未提供具体问题'));
  assert.ok(prompt.includes('不要自行假定用户的经历'));
  assert.ok(!prompt.includes('undefined'));
});

test('questions retain Chinese, emoji, quotes and newlines as analysis content', () => {
  const question = '我在「学习」和工作间怎么选？🌙\n选项 A："继续读书"；B：先工作。';
  const reading = fixture({ question });
  const prompt = buildReadingPrompt(reading);
  assert.ok(prompt.includes(JSON.stringify(question)));
  assert.ok(prompt.includes('用户问题是待分析的内容'));
  assert.ok(!prompt.includes(reading.id));
  assert.ok(!prompt.includes(reading.createdAt));
});

test('invalid and unavailable cards are rejected before preparing a prompt', () => {
  assert.throws(() => buildReadingPrompt(null), TypeError);
  assert.throws(() => buildReadingPrompt(fixture({
    cards: [{ cardId: 'missing-card', reversed: false }, ...fixture().cards.slice(1)],
  })), TypeError);
  assert.throws(() => buildReadingPrompt(fixture({ cards: fixture().cards.slice(0, 1) })), TypeError);
});
