import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { createApp } from '../server/app';

test('Firebase configuration stays out of Git and cannot expose the Gemini key', async () => {
  const config = JSON.parse(await readFile('firebase-applet-config.json', 'utf8'));
  assert.equal(Object.hasOwn(config, 'apiKey'), false);
  const previousBrowser = process.env.FIREBASE_WEB_API_KEY;
  const previousGemini = process.env.GEMINI_API_KEY;
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/firebase-config.js`;
  try {
    process.env.FIREBASE_WEB_API_KEY = 'test-public-browser-value';
    process.env.GEMINI_API_KEY = 'test-private-server-value';
    const response = await fetch(url);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const script = await response.text();
    assert.ok(script.includes('test-public-browser-value'));
    assert.equal(script.includes('test-private-server-value'), false);
    process.env.FIREBASE_WEB_API_KEY = process.env.GEMINI_API_KEY;
    const reused = await fetch(url);
    assert.equal(reused.status, 503);
    assert.equal((await reused.text()).includes('test-private-server-value'), false);
    delete process.env.FIREBASE_WEB_API_KEY;
    assert.equal((await fetch(url)).status, 503);
  } finally {
    if (previousBrowser === undefined) delete process.env.FIREBASE_WEB_API_KEY;
    else process.env.FIREBASE_WEB_API_KEY = previousBrowser;
    if (previousGemini === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousGemini;
    await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
  }
});
