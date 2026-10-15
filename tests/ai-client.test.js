import test from 'node:test';
import assert from 'node:assert/strict';
import { AIClientError, createAIClient, readingFingerprint, analysisToText } from '../src/ai-client.js';

const ENDPOINT = 'https://tarot.example.test';
const CACHE_KEY = 'stellar-tarot-ai-v1';
const VISITOR_KEY = 'stellar-tarot-ai-visitor-v1';
const VISITOR_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function fixture(overrides = {}) {
  return {
    id: 'test-reading-123',
    createdAt: '2026-10-15T08:00:00.000Z',
    spreadId: 'three',
    topicId: 'general',
    question: '如何向朋友表达自己的想法？',
    cards: [
      { cardId: 'major-0', reversed: false },
      { cardId: 'major-1', reversed: true },
      { cardId: 'major-2', reversed: false },
    ],
    ...overrides,
  };
}

function resultFor(reading = fixture()) {
  return {
    analysis: {
      title: '从自己的感受开始沟通',
      overview: '这些牌提供了三个观察关系的角度。',
      cardInsights: reading.cards.map(({ cardId }, index) => ({ cardId, interpretation: `第 ${index + 1} 张牌可以提示你整理自己的需要。` })),
      synthesis: '把已有的经验与眼前的事实放在一起观察。',
      actions: ['写下一个具体感受。', '约定合适的沟通时间。', '询问对方的真实想法。'],
      reflection: '有哪些期待还没有被说出来？',
      closing: '把选择留在自己手里。',
    },
    model: 'deepseek-chat',
    generatedAt: '2026-10-15T08:01:00.000Z',
  };
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

function success(result) {
  return { ok: true, status: 200, json: async () => result };
}

function expectCode(code) {
  return (error) => error instanceof AIClientError && error.code === code;
}

test('fingerprints preserve question, topic, spread, card orientation and position, but ignore IDs and timestamps', () => {
  const reading = fixture();
  const key = readingFingerprint(reading);
  assert.equal(key, readingFingerprint({ ...reading, id: 'a-new-reading', createdAt: 'later', extra: true }));
  assert.equal(key, readingFingerprint({ cards: reading.cards, question: reading.question, topicId: reading.topicId, spreadId: reading.spreadId }));
  const changes = [
    { question: '' }, { question: '另一个问题' }, { topicId: 'love' }, { spreadId: 'relationship' },
    { cards: reading.cards.toReversed() },
    { cards: reading.cards.map((card, index) => index === 0 ? { ...card, reversed: true } : card) },
  ];
  for (const change of changes) assert.notEqual(readingFingerprint(fixture(change)), key);
  for (const value of [null, {}, fixture({ question: null }), fixture({ cards: [] }), fixture({ cards: [reading.cards[0], reading.cards[0], reading.cards[2]] })]) {
    assert.throws(() => readingFingerprint(value), expectCode('INVALID_READING'));
  }
});

test('requests use the trusted server endpoint and an allowlisted payload without API credentials', async () => {
  let captured;
  const reading = fixture({ apiKey: 'must-not-leave-browser', model: 'untrusted-model' });
  reading.cards[0].secret = 'also-private';
  const result = resultFor(reading);
  result.secret = 'not-a-result-field';
  result.analysis.cardInsights[0].html = '<script>untrusted</script>';
  const client = createAIClient({ endpoint: `${ENDPOINT}/`, storage: memoryStorage(), fetchImpl: async (url, options) => {
    captured = { url, options };
    return success(result);
  } });
  const actual = await client.request(reading);
  assert.equal(captured.url, `${ENDPOINT}/api/interpret`);
  assert.deepEqual(JSON.parse(captured.options.body), { reading: fixture() });
  assert.equal(captured.options.headers['Content-Type'], 'application/json');
  assert.match(captured.options.headers['X-Tarot-Visitor-Id'], VISITOR_ID_PATTERN);
  assert.deepEqual(Object.keys(captured.options.headers).sort(), ['Content-Type', 'X-Tarot-Visitor-Id']);
  assert.equal(captured.options.method, 'POST');
  assert.equal(captured.options.credentials, 'omit');
  assert.equal(captured.options.referrerPolicy, 'no-referrer');
  assert.equal(captured.options.redirect, 'error');
  assert.equal(captured.options.cache, 'no-store');
  assert.ok(captured.options.signal instanceof AbortSignal);
  assert.deepEqual(actual, resultFor());
});

test('visitor IDs are created only by explicit interpretation requests and persist independently of cached readings', async () => {
  const storage = memoryStorage();
  const requests = [];
  const options = { endpoint: ENDPOINT, storage, fetchImpl: async (url, request) => {
    requests.push({ url, request });
    return success(url.endsWith('/api/health')
      ? { ready: true, provider: 'AI', model: 'test-model' } : resultFor());
  } };
  const first = createAIClient(options);
  first.getCached(fixture());
  assert.equal(requests.length, 0);
  assert.equal(storage.getItem(VISITOR_KEY), null);
  await first.health();
  assert.equal(requests[0].request.headers?.['X-Tarot-Visitor-Id'], undefined);
  assert.equal(storage.getItem(VISITOR_KEY), null);
  await first.request(fixture());
  const id = requests[1].request.headers['X-Tarot-Visitor-Id'];
  assert.match(id, VISITOR_ID_PATTERN);
  assert.equal(storage.getItem(VISITOR_KEY), id);
  await first.request(fixture({ question: '换一个不相关的问题' }));
  first.clearAll();
  assert.equal(storage.getItem(VISITOR_KEY), id);
  await createAIClient(options).request(fixture());
  assert.deepEqual(requests.slice(1).map(({ request }) => request.headers['X-Tarot-Visitor-Id']), [id, id, id]);
  assert.equal(JSON.parse(requests[1].request.body).visitorId, undefined);
});

test('valid stored visitor IDs are reused and malformed values cannot enter HTTP headers', async () => {
  const valid = '9d3e75f7-1d72-4b50-b7ce-e2817e51b145';
  for (const existing of [valid, '', 'user@example.com', 'bad\r\nInjected: value', valid.toUpperCase()]) {
    const storage = memoryStorage();
    storage.setItem(VISITOR_KEY, existing);
    let headers;
    const client = createAIClient({ endpoint: ENDPOINT, storage, fetchImpl: async (_, request) => {
      headers = request.headers;
      return success(resultFor());
    } });
    await client.request(fixture());
    const id = headers['X-Tarot-Visitor-Id'];
    assert.match(id, VISITOR_ID_PATTERN);
    assert.equal(storage.getItem(VISITOR_KEY), id);
    if (existing === valid) assert.equal(id, valid);
    else assert.notEqual(id, existing);
  }
});

test('blocked, full, or absent storage keeps the random visitor ID stable within the page session', async () => {
  for (const storage of [
    null,
    { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } },
    { getItem() { return null; }, setItem() { throw new Error('quota exceeded'); } },
  ]) {
    const ids = [];
    const options = { endpoint: ENDPOINT, storage, fetchImpl: async (_, request) => {
      ids.push(request.headers['X-Tarot-Visitor-Id']);
      return success(resultFor());
    } };
    const first = createAIClient(options);
    await first.request(fixture());
    await first.request(fixture());
    await createAIClient(options).request(fixture());
    assert.match(ids[0], VISITOR_ID_PATTERN);
    assert.deepEqual(ids, [ids[0], ids[0], ids[0]]);
  }
});

test('a question-free share never reuses the original private interpretation, even when its ID matches', async () => {
  const storage = memoryStorage();
  const client = createAIClient({ endpoint: ENDPOINT, storage, fetchImpl: async () => success(resultFor()) });
  await client.request(fixture());
  assert.deepEqual(client.getCached(fixture()), resultFor());
  assert.deepEqual(createAIClient({ endpoint: ENDPOINT, storage }).getCached(fixture()), resultFor());
  assert.deepEqual(client.getCached(fixture({ id: 'new-reading-id' })), resultFor());
  assert.equal(client.getCached(fixture({ question: '' })), null);
  const parsed = JSON.parse(storage.getItem(CACHE_KEY));
  assert.deepEqual(Object.keys(parsed.entries[0]).sort(), ['fingerprint', 'result']);
  assert.equal(client.getCached(null), null);
});

test('requests are deliberate and are never automatically retried or silently reused', async () => {
  let calls = 0;
  const client = createAIClient({ endpoint: ENDPOINT, storage: memoryStorage(), fetchImpl: async () => {
    calls += 1;
    return success(resultFor());
  } });
  await client.request(fixture());
  await client.request(fixture());
  assert.equal(calls, 2);
  client.getCached(fixture());
  assert.equal(calls, 2);
});

test('cache retains only the most recent 50 distinct interpretations and removes only requested data', async () => {
  const storage = memoryStorage();
  storage.setItem('stellar-tarot-history', 'keep-history');
  const client = createAIClient({ endpoint: ENDPOINT, storage, fetchImpl: async () => success(resultFor()) });
  for (let index = 0; index < 52; index += 1) await client.request(fixture({ question: `问题 ${index}` }));
  assert.equal(JSON.parse(storage.getItem(CACHE_KEY)).entries.length, 50);
  assert.equal(client.getCached(fixture({ question: '问题 0' })), null);
  assert.ok(client.getCached(fixture({ question: '问题 2' })));
  await client.request(fixture({ question: '问题 2' }));
  await client.request(fixture({ question: '问题 52' }));
  assert.ok(client.getCached(fixture({ question: '问题 2' })));
  assert.equal(client.getCached(fixture({ question: '问题 3' })), null);
  client.clear(fixture({ question: '问题 2' }));
  assert.equal(client.getCached(fixture({ question: '问题 2' })), null);
  assert.ok(client.getCached(fixture({ question: '问题 52' })));
  client.clearAll();
  assert.equal(storage.getItem(CACHE_KEY), null);
  assert.equal(storage.getItem('stellar-tarot-history'), 'keep-history');
});

test('unavailable or full localStorage never discards a fresh successful result', async () => {
  const storage = {
    getItem() { throw new Error('disabled'); },
    setItem() { throw new Error('quota'); },
    removeItem() { throw new Error('disabled'); },
  };
  const client = createAIClient({ endpoint: ENDPOINT, storage, fetchImpl: async () => success(resultFor()) });
  assert.deepEqual(await client.request(fixture()), resultFor());
  assert.deepEqual(client.getCached(fixture()), resultFor());
  assert.equal(client.getCached(fixture({ question: '' })), null);
  assert.doesNotThrow(() => client.clear(fixture()));
  assert.equal(client.getCached(fixture()), null);
  await client.request(fixture());
  assert.doesNotThrow(() => client.clearAll());
  assert.equal(client.getCached(fixture()), null);
});

test('in-memory results are bounded and isolated from callers when localStorage is unavailable', async () => {
  const client = createAIClient({ endpoint: ENDPOINT, storage: null, fetchImpl: async () => success(resultFor()) });
  for (let index = 0; index < 51; index += 1) await client.request(fixture({ question: `问题 ${index}` }));
  assert.equal(client.getCached(fixture({ question: '问题 0' })), null);
  assert.ok(client.getCached(fixture({ question: '问题 1' })));
  const result = await client.request(fixture());
  result.analysis.actions.length = 0;
  assert.deepEqual(client.getCached(fixture()), resultFor());
  const cached = client.getCached(fixture());
  cached.analysis.actions.length = 0;
  assert.deepEqual(client.getCached(fixture()), resultFor());
});

test('another tab clearing all results cannot be undone by this tab generating a new interpretation', async () => {
  const storage = memoryStorage();
  const options = { endpoint: ENDPOINT, storage, fetchImpl: async () => success(resultFor()) };
  const firstTab = createAIClient(options);
  await firstTab.request(fixture());
  const secondTab = createAIClient(options);
  secondTab.clearAll();
  await firstTab.request(fixture({ question: '另一个新问题' }));
  assert.equal(firstTab.getCached(fixture()), null);
  assert.equal(createAIClient(options).getCached(fixture()), null);
  assert.ok(createAIClient(options).getCached(fixture({ question: '另一个新问题' })));
});

test('cross-tab cache reads and single deletions preserve unrelated results without restoring deleted data', async () => {
  const storage = memoryStorage();
  const options = { endpoint: ENDPOINT, storage, fetchImpl: async () => success(resultFor()) };
  const firstTab = createAIClient(options);
  const secondTab = createAIClient(options);
  await firstTab.request(fixture());
  assert.deepEqual(secondTab.getCached(fixture()), resultFor());
  await secondTab.request(fixture({ question: '保留这个问题' }));
  assert.ok(firstTab.getCached(fixture({ question: '保留这个问题' })));
  secondTab.clear(fixture());
  assert.equal(firstTab.getCached(fixture()), null);
  assert.ok(firstTab.getCached(fixture({ question: '保留这个问题' })));
  await firstTab.request(fixture({ question: '新问题' }));
  assert.equal(createAIClient(options).getCached(fixture()), null);
  assert.ok(createAIClient(options).getCached(fixture({ question: '保留这个问题' })));
});

test('a response finishing after an observable deletion in another tab cannot restore the result', async () => {
  for (const clearAll of [false, true]) {
    const storage = memoryStorage();
    let finish;
    let pendingMode = false;
    const options = { endpoint: ENDPOINT, storage, fetchImpl: async () => pendingMode
      ? new Promise((resolve) => { finish = resolve; }) : success(resultFor()) };
    const firstTab = createAIClient(options);
    await firstTab.request(fixture());
    const secondTab = createAIClient(options);
    pendingMode = true;
    const pending = firstTab.request(fixture());
    if (clearAll) secondTab.clearAll();
    else secondTab.clear(fixture());
    finish(success(resultFor()));
    await assert.rejects(pending, expectCode('CANCELLED'));
    assert.equal(firstTab.getCached(fixture()), null);
    assert.equal(createAIClient(options).getCached(fixture()), null);
  }
});

test('cache synchronization preserves fresh in-memory results when storage is readable but writes fail', async () => {
  const underlying = memoryStorage();
  const options = { endpoint: ENDPOINT, fetchImpl: async () => success(resultFor()) };
  await createAIClient({ ...options, storage: underlying }).request(fixture());
  const storage = { ...underlying, setItem() { throw new Error('quota exceeded'); } };
  const client = createAIClient({ ...options, storage });
  const unsaved = fixture({ question: '空间已满时的新问题' });
  await client.request(unsaved);
  assert.deepEqual(client.getCached(unsaved), resultFor());
  assert.ok(client.getCached(fixture()));
  client.clear(fixture());
  assert.equal(client.getCached(fixture()), null);
  assert.deepEqual(client.getCached(unsaved), resultFor());
});

test('results generated while storage reads are blocked survive access being restored', async () => {
  const underlying = memoryStorage();
  let blocked = true;
  const storage = {
    getItem(key) { if (blocked) throw new Error('blocked'); return underlying.getItem(key); },
    setItem(key, value) { if (blocked) throw new Error('blocked'); underlying.setItem(key, value); },
    removeItem(key) { if (blocked) throw new Error('blocked'); underlying.removeItem(key); },
  };
  const client = createAIClient({ endpoint: ENDPOINT, storage, fetchImpl: async () => success(resultFor()) });
  await client.request(fixture());
  blocked = false;
  assert.deepEqual(client.getCached(fixture()), resultFor());
});

test('a throwing browser localStorage getter does not prevent client construction', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
  try {
    assert.doesNotThrow(() => createAIClient({ endpoint: ENDPOINT }));
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  }
});

test('corrupt, mismatched and malicious cached results fail closed', async () => {
  const storage = memoryStorage();
  const reloadClient = () => createAIClient({ endpoint: ENDPOINT, storage, fetchImpl: async () => success(resultFor()) });
  for (const raw of ['{broken', 'null', '{}', '{"version":1,"entries":"wrong"}', 'x'.repeat(2_000_001)]) {
    storage.setItem(CACHE_KEY, raw);
    assert.equal(reloadClient().getCached(fixture()), null);
  }
  await reloadClient().request(fixture());
  const parsed = JSON.parse(storage.getItem(CACHE_KEY));
  parsed.entries[0].result.analysis.cardInsights.reverse();
  storage.setItem(CACHE_KEY, JSON.stringify(parsed));
  const client = reloadClient();
  assert.equal(client.getCached(fixture()), null);
  await client.request(fixture());
  assert.deepEqual(client.getCached(fixture()), resultFor());
});

test('AI response validation enforces exact card positions, bounded text, actions and generation metadata', async () => {
  const mutations = [
    (value) => { delete value.analysis.overview; },
    (value) => { value.analysis.title = 'x'.repeat(121); },
    (value) => { value.analysis.overview = 'x'.repeat(2401); },
    (value) => { value.analysis.synthesis = 'x'.repeat(4001); },
    (value) => { value.analysis.cardInsights.reverse(); },
    (value) => { value.analysis.cardInsights[0].cardId = 'unasked-card'; },
    (value) => { value.analysis.cardInsights[0].interpretation = 'x'.repeat(2401); },
    (value) => { value.analysis.cardInsights.pop(); },
    (value) => { value.analysis.actions.pop(); },
    (value) => { value.analysis.actions[0] = 'x'.repeat(601); },
    (value) => { value.analysis.reflection = 'x'.repeat(1201); },
    (value) => { value.analysis.closing = 'x'.repeat(1001); },
    (value) => { value.analysis.closing = '\u0000'; },
    (value) => { value.generatedAt = 'yesterday'; },
    (value) => { value.model = ''; },
  ];
  for (const mutate of mutations) {
    const result = resultFor();
    mutate(result);
    const storage = memoryStorage();
    const client = createAIClient({ endpoint: ENDPOINT, storage, fetchImpl: async () => success(result) });
    await assert.rejects(client.request(fixture()), expectCode('INVALID_RESPONSE'));
    assert.equal(storage.getItem(CACHE_KEY), null);
  }
});

test('missing or unsafe server addresses never initiate a request or break construction', async () => {
  let calls = 0;
  for (const endpoint of ['', undefined, 'javascript:alert(1)', 'http://remote.example.test', 'https://key:secret@example.test', `${ENDPOINT}?key=secret`, `${ENDPOINT}#secret`]) {
    const client = createAIClient({ endpoint, storage: null, fetchImpl: async () => { calls += 1; } });
    const code = endpoint ? 'INVALID_ENDPOINT' : 'NOT_CONFIGURED';
    await assert.rejects(client.request(fixture()), expectCode(code));
    await assert.rejects(client.health(), expectCode(code));
  }
  assert.equal(calls, 0);
});

test('network and server failures use local safe messages without reflecting arbitrary server data', async () => {
  const scenarios = [
    [429, { error: { code: 'RATE_LIMITED', message: '<script>secret-key</script>' } }, 'RATE_LIMITED'],
    [503, { error: { code: 'NOT_CONFIGURED', message: 'secret-key' } }, 'NOT_CONFIGURED'],
    [502, { error: { code: 'INVALID_AI_RESPONSE', message: 'secret-key' } }, 'INVALID_AI_RESPONSE'],
    [500, { error: { code: '__proto__', message: 'secret-key' } }, 'AI_UNAVAILABLE'],
    [504, null, 'AI_TIMEOUT'],
    [400, null, 'INVALID_REQUEST'],
  ];
  for (const [status, body, code] of scenarios) {
    let calls = 0;
    const client = createAIClient({ endpoint: ENDPOINT, storage: null, fetchImpl: async () => {
      calls += 1;
      return { ok: false, status, json: async () => body };
    } });
    await assert.rejects(client.request(fixture()), (error) => {
      assert.equal(error.code, code);
      assert.doesNotMatch(error.message, /secret-key|script|__proto__/);
      return true;
    });
    assert.equal(calls, 1);
  }
  const network = createAIClient({ endpoint: ENDPOINT, storage: null, fetchImpl: async () => { throw new Error('secret-key'); } });
  await assert.rejects(network.request(fixture()), expectCode('NETWORK_ERROR'));
  for (const ok of [false, true]) {
    const malformed = createAIClient({ endpoint: ENDPOINT, storage: null, fetchImpl: async () => ({ ok, status: ok ? 200 : 502, json: async () => { throw new Error('<html>secret-key</html>'); } }) });
    await assert.rejects(malformed.request(fixture()), expectCode(ok ? 'INVALID_RESPONSE' : 'AI_UNAVAILABLE'));
  }
});

test('cancellation propagates to fetch and never persists a late response', async () => {
  const controller = new AbortController();
  const storage = memoryStorage();
  let fetchSignal;
  let complete;
  const client = createAIClient({ endpoint: ENDPOINT, storage, fetchImpl: async (_, options) => {
    fetchSignal = options.signal;
    return new Promise((resolve) => { complete = resolve; });
  } });
  const pending = client.request(fixture(), { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, expectCode('CANCELLED'));
  assert.equal(fetchSignal.aborted, true);
  complete(success(resultFor()));
  await Promise.resolve();
  assert.equal(client.getCached(fixture()), null);
  let calls = 0;
  const cancelled = createAIClient({ endpoint: ENDPOINT, fetchImpl: async () => { calls += 1; } });
  await assert.rejects(cancelled.request(fixture(), { signal: controller.signal }), expectCode('CANCELLED'));
  assert.equal(calls, 0);
});

test('clearing a reading or all history prevents late responses from restoring deleted interpretations', async () => {
  for (const clearAll of [false, true]) {
    let complete;
    const storage = memoryStorage();
    const client = createAIClient({ endpoint: ENDPOINT, storage, fetchImpl: async () => new Promise((resolve) => { complete = resolve; }) });
    const pending = client.request(fixture());
    if (clearAll) client.clearAll();
    else client.clear(fixture());
    complete(success(resultFor()));
    await assert.rejects(pending, expectCode('CANCELLED'));
    assert.equal(client.getCached(fixture()), null);
    assert.equal(createAIClient({ endpoint: ENDPOINT, storage }).getCached(fixture()), null);
  }
  let complete;
  const client = createAIClient({ endpoint: ENDPOINT, storage: null, fetchImpl: async () => new Promise((resolve) => { complete = resolve; }) });
  const pending = client.request(fixture());
  client.clear(fixture({ question: '另一个解读' }));
  complete(success(resultFor()));
  assert.deepEqual(await pending, resultFor());
  assert.deepEqual(client.getCached(fixture()), resultFor());
});

test('requests time out after 90 seconds and abort the underlying request', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let fetchSignal;
  const client = createAIClient({ endpoint: ENDPOINT, storage: null, fetchImpl: async (_, options) => {
    fetchSignal = options.signal;
    return new Promise(() => {});
  } });
  const pending = client.request(fixture());
  context.mock.timers.tick(89_999);
  assert.equal(fetchSignal.aborted, false);
  context.mock.timers.tick(1);
  await assert.rejects(pending, expectCode('AI_TIMEOUT'));
  assert.equal(fetchSignal.aborted, true);
});

test('health is a no-credential GET and exposes only ready/provider/model fields', async () => {
  let captured;
  const health = { ready: false, provider: 'DeepSeek', model: 'deepseek-chat' };
  const client = createAIClient({ endpoint: 'http://127.0.0.1:3000/', storage: null, fetchImpl: async (url, options) => {
    captured = { url, options };
    return success({ ...health, secret: 'never-expose' });
  } });
  assert.deepEqual(await client.health(), health);
  assert.equal(captured.url, 'http://127.0.0.1:3000/api/health');
  assert.equal(captured.options.method, 'GET');
  assert.equal(captured.options.body, undefined);
  assert.equal(captured.options.credentials, 'omit');
  const malformed = createAIClient({ endpoint: ENDPOINT, storage: null, fetchImpl: async () => success({ ...health, ready: 'false' }) });
  await assert.rejects(malformed.health(), expectCode('INVALID_RESPONSE'));
});

test('download text contains all analysis sections and clear AI attribution', () => {
  const result = resultFor();
  const text = analysisToText(result);
  for (const value of [result.analysis.title, result.analysis.overview, result.analysis.synthesis, ...result.analysis.actions, result.analysis.reflection, result.analysis.closing, result.model, result.generatedAt]) {
    assert.ok(text.includes(value), value);
  }
  for (const insight of result.analysis.cardInsights) assert.ok(text.includes(insight.interpretation));
  assert.match(text, /由 AI 生成/);
  assert.match(text, /不代表事实或确定的预测/);
});
