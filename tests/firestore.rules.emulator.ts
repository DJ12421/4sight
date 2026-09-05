import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';

test('Firestore isolates owners and denies all client mutation paths', async () => {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  if (!host || !/^(127\.0\.0\.1|localhost):\d+$/.test(host)) throw new Error('Start the local emulator first; this test must never contact a real database.');
  const [hostname, port] = host.split(':');
  const env = await initializeTestEnvironment({ projectId: 'demo-foresight', firestore: { host: hostname, port: Number(port), rules: await readFile('firestore.rules', 'utf8') } });
  try {
    await env.withSecurityRulesDisabled(async context => {
      for (const path of ['users/alice/decisions/one', 'users/alice/interactions/old', 'users/alice/insights/latest', 'users/alice/usage/current']) await setDoc(doc(context.firestore(), path), { title: 'Private' });
    });
    const alice = env.authenticatedContext('alice').firestore();
    const bob = env.authenticatedContext('bob').firestore();
    const guest = env.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(alice, 'users/alice/decisions/one')));
    await assertSucceeds(getDocs(collection(alice, 'users/alice/decisions')));
    await assertSucceeds(getDoc(doc(alice, 'users/alice/interactions/old')));
    await assertSucceeds(getDoc(doc(alice, 'users/alice/insights/latest')));
    await assertFails(getDoc(doc(bob, 'users/alice/decisions/one')));
    await assertFails(getDocs(collection(bob, 'users/alice/decisions')));
    await assertFails(getDoc(doc(guest, 'users/alice/decisions/one')));
    for (const path of ['users/alice/decisions/one', 'users/alice/interactions/old', 'users/alice/insights/latest', 'users/alice/usage/current', 'unmatched/path']) await assertFails(setDoc(doc(alice, path), { changed: true }));
    await assertFails(getDoc(doc(alice, 'users/alice/usage/current')));
  } finally { await env.cleanup(); }
});
