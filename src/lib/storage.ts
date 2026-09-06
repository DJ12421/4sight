import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { Decision, PatternReport } from '../domain';
import { JournalInteraction } from '../types';

export async function syncDecisionToFirestore(uid: string, decision: Decision): Promise<void> {
  if (!uid || !decision.id) return;
  try {
    await setDoc(doc(db, 'users', uid, 'decisions', decision.id), decision);
  } catch (err) {
    console.warn('Could not sync decision to Firestore:', err);
  }
}

export async function deleteDecisionFromFirestore(uid: string, decisionId: string): Promise<void> {
  if (!uid || !decisionId) return;
  try {
    await deleteDoc(doc(db, 'users', uid, 'decisions', decisionId));
  } catch (err) {
    console.warn('Could not delete decision from Firestore:', err);
  }
}

export async function syncJournalToFirestore(uid: string, entry: JournalInteraction): Promise<void> {
  if (!uid || !entry.id) return;
  try {
    await setDoc(doc(db, 'users', uid, 'interactions', entry.id), entry);
  } catch (err) {
    console.warn('Could not sync journal entry to Firestore:', err);
  }
}

export async function deleteJournalFromFirestore(uid: string, entryId: string): Promise<void> {
  if (!uid || !entryId) return;
  try {
    await deleteDoc(doc(db, 'users', uid, 'interactions', entryId));
  } catch (err) {
    console.warn('Could not delete journal entry from Firestore:', err);
  }
}

export async function syncReportToFirestore(uid: string, report: PatternReport): Promise<void> {
  if (!uid) return;
  try {
    await setDoc(doc(db, 'users', uid, 'insights', 'latest'), report);
  } catch (err) {
    console.warn('Could not sync pattern report to Firestore:', err);
  }
}
