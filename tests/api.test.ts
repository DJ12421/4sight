import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AddressInfo } from 'node:net';
import { Firestore } from 'firebase-admin/firestore';
import { createApp } from '../server/app';
import { sampleDecisions } from '../src/sample';

// Minimal transactional store for ownership/routing failures; real rule checks are separate.
function memoryStore() {
  const records = new Map<string, unknown>();
  const doc = (path: string) => ({ path, get: async () => ({ exists: records.has(path), data: () => records.get(path) }) });
  const collection = (path: string) => ({ get: async () => ({ docs: [...records.entries()].filter(([key]) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes('/')).map(([key, value]) => ({ id: key.slice(path.length + 1), data: () => value })) }) });
  type Ref = ReturnType<typeof doc>;
  const db = { doc, collection, recursiveDelete: async (ref: Ref) => { for (const key of records.keys()) if (key === ref.path || key.startsWith(`${ref.path}/`)) records.delete(key); }, runTransaction: async (fn: (tx: unknown) => unknown) => {
    const writes: (() => void)[] = [];
    const result = await fn({ get: (ref: Ref) => ref.get(), getAll: (...refs: Ref[]) => Promise.all(refs.map(r => r.get())), set: (ref: Ref, value: unknown) => writes.push(() => records.set(ref.path, structuredClone(value))), delete: (ref: Ref) => writes.push(() => records.delete(ref.path)) });
    writes.forEach(write => write()); return result;
  } };
  return { records, db: db as unknown as Firestore };
}
test('API rejects missing/invalid auth, scopes reads/writes, and enforces usage limits', async () => {
  const store = memoryStore();
  store.records.set('users/bob/decisions/private', sampleDecisions[1]);
  let generations = 0;
  const app = createApp({ db: () => store.db, verifyToken: async token => { if (token !== 'alice-token') throw new Error('invalid'); return { uid: 'alice' }; }, generate: async () => { generations++; return { reply: 'What matters most to you?', model: 'test-only' }; } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = (path: string, body: unknown, token = 'alice-token', method = 'POST') => fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  try {
    assert.equal((await call('/api/ai', {}, '')).status, 401);
    assert.equal((await call('/api/ai', {}, 'bad-token')).status, 401);
    assert.equal((await call('/api/ai', { action: 'patterns', sourceIds: ['private'] })).status, 404);
    assert.equal(generations, 0);
    const draft = { ...sampleDecisions[1], sourceIds: [] };
    const op = { operation: 'draft', revision: 0, mutationId: 'save-1', userId: 'bob', draft };
    assert.equal((await call('/api/decisions/new', op, 'alice-token', 'PUT')).status, 200);
    assert.equal((await call('/api/decisions/new', op, 'alice-token', 'PUT')).status, 200);
    assert.ok(store.records.has('users/alice/decisions/new'));
    assert.equal(store.records.has('users/bob/decisions/new'), false);
    assert.equal((store.records.get('users/alice/decisions/new') as { revision: number }).revision, 1);
    for (let i = 0; i < 5; i++) assert.equal((await call('/api/ai', { action: 'chat', draft, sourceIds: [], message: 'Help me decide.' })).status, 200);
    assert.equal((await call('/api/ai', { action: 'chat', draft, sourceIds: [], message: 'Again.' })).status, 429);
    assert.equal(generations, 5);
    assert.equal((await call('/api/reflect', {})).status, 410);
  } finally { await new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); }); }
});
test('provider errors do not disclose internal details', async () => {
  const store = memoryStore();
  const app = createApp({ db: () => store.db, verifyToken: async () => ({ uid: 'alice' }), generate: async () => { throw new Error('secret-provider-diagnostic'); } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/ai`, { method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'chat', draft: { ...sampleDecisions[1], sourceIds: [] }, sourceIds: [], message: 'Help.' }) });
    assert.equal(response.status, 502);
    assert.equal((await response.text()).includes('secret-provider-diagnostic'), false);
  } finally { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); }
});
test('journal entries are owner-scoped and support Gemini follow-up turns', async () => {
  const store = memoryStore();
  const app = createApp({ db: () => store.db, verifyToken: async () => ({ uid: 'alice' }), generate: async () => ({ reply: 'What would you like to understand better?', model: 'test-only' }) });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`, url = `${base}/api/journal`;
  const call = (body: unknown, endpoint = url, method = 'POST') => fetch(endpoint, { method, headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  try {
    assert.equal((await call({ id: 'page-one', title: 'A difficult week', entry: 'I kept avoiding one conversation.', mode: 'reflect', tags: ['Career', 'confidence'] })).status, 200);
    assert.ok(store.records.has('users/alice/interactions/page-one'));
    assert.equal(store.records.has('users/bob/interactions/page-one'), false);
    const response = await call({ id: 'page-one', message: 'I think I am worried about disappointing them.' });
    assert.equal(response.status, 200);
    const saved = await response.json() as { turns: unknown[] };
    assert.equal(saved.turns.length, 2);
    assert.equal((await call({ tags: ['Updated'] }, `${url}/page-one/tags`, 'PUT')).status, 200);
    const exported = await call(undefined, `${base}/api/export`, 'GET');
    assert.equal(exported.status, 200);
    assert.deepEqual(((await exported.json()) as { journal: { tags: string[] }[] }).journal[0].tags, ['updated']);
    assert.equal((await call(undefined, `${url}/page-one`, 'DELETE')).status, 200);
    assert.equal(store.records.has('users/alice/interactions/page-one'), false);
    store.records.set('users/alice/interactions/another', { title: 'Private' });
    store.records.set('users/bob/interactions/kept', { title: 'Someone else' });
    assert.equal((await call(undefined, `${base}/api/account-data`, 'DELETE')).status, 200);
    assert.equal([...store.records.keys()].some(key => key.startsWith('users/alice/')), false);
    assert.equal(store.records.has('users/bob/interactions/kept'), true);
  } finally { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); }
});
