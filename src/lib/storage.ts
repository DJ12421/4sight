import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';
import { Decision, PatternReport } from '../domain';
import { sampleDecisions } from '../sample';

/**
 * Strict Undefined-Stripping (Zero-Crash Payload Hygiene):
 * Recursively removes undefined fields so Firestore SDK never rejects the payload.
 */
export function cleanPayload<T>(input: T): T {
  if (input === null || input === undefined) return null as unknown as T;
  return JSON.parse(JSON.stringify(input, (_key, value) => (value === undefined ? null : value)));
}

/**
 * Persists a decision to the user's isolated Firestore collection.
 */
export async function syncDecisionToFirestore(uid: string, decision: Decision): Promise<void> {
  const sanitized = cleanPayload(decision);
  const ref = doc(db, 'users', uid, 'decisions', decision.id);
  await setDoc(ref, sanitized);
}

/**
 * Deletes a decision from the user's isolated Firestore collection.
 */
export async function deleteDecisionFromFirestore(uid: string, decisionId: string): Promise<void> {
  const ref = doc(db, 'users', uid, 'decisions', decisionId);
  await deleteDoc(ref);
}

/**
 * Persists pattern report insights to the user's isolated Firestore collection.
 */
export async function syncInsightToFirestore(uid: string, report: PatternReport): Promise<void> {
  const sanitized = cleanPayload(report);
  const ref = doc(db, 'users', uid, 'insights', 'latest');
  await setDoc(ref, sanitized);
}

/**
 * Seeds sample journey decisions directly to the user's isolated Firestore collection.
 */
export async function syncSampleDecisionsToFirestore(uid: string): Promise<void> {
  for (const sample of sampleDecisions) {
    const ref = doc(db, 'users', uid, 'decisions', sample.id);
    await setDoc(ref, cleanPayload(sample));
  }
}
