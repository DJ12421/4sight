import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseAIResult, parseDraft, parseReview } from '../src/domain';
import { sampleDecisions } from '../src/sample';
import { mutateDecision } from '../server/mutations';

const now = '2026-09-05T12:00:00.000Z';
const draft = { ...sampleDecisions[1], sourceIds: [] };
test('decision loop preserves the original commitment and appends outcomes', () => {
  const saved = mutateDecision('one', null, { operation: 'draft', revision: 0, mutationId: 'save-one', draft }, now);
  const committed = mutateDecision('one', saved, { operation: 'commit', revision: 1, mutationId: 'commit-one', commitment: draft.commitment }, now);
  const reviewed = mutateDecision('one', committed, { operation: 'review', revision: 2, mutationId: 'review-one', review: draft.reviews[0] }, now);
  assert.equal(reviewed.reviews.length, 1);
  assert.deepEqual(reviewed.commitment, committed.commitment);
  assert.equal(reviewed.revision, 3);
  assert.equal(saved.sample, false, 'clients cannot mark personal entries as official samples');
  assert.throws(() => mutateDecision('one', reviewed, { operation: 'draft', revision: 3, mutationId: 'rewrite', draft }, now), /already committed/);
});
test('a lost save acknowledgement retries idempotently and stale writes conflict', () => {
  const operation = { operation: 'draft', revision: 0, mutationId: 'same-save', draft };
  const saved = mutateDecision('one', null, operation, now);
  assert.deepEqual(mutateDecision('one', saved, operation, now), saved);
  assert.throws(() => mutateDecision('one', saved, { ...operation, mutationId: 'stale-save' }, now), /changed elsewhere/);
});
test('review retries do not duplicate outcomes', () => {
  const previous = sampleDecisions[1];
  const operation = { operation: 'review', revision: previous.revision, mutationId: 'review-two', review: { ...previous.reviews[0], id: 'second-review' } };
  const saved = mutateDecision(previous.id, previous, operation, now);
  assert.equal(mutateDecision(previous.id, saved, operation, now).reviews.length, 2);
});
test('AI validation rejects malformed output and unsupported evidence', () => {
  assert.throws(() => parseAIResult({ brief: { options: ['one'] } }, 'brief', []));
  assert.throws(() => parseAIResult({ reply: '' }, 'chat', []));
  assert.deepEqual(parseAIResult({ reply: 'Test the weakest assumption.' }, 'challenge', []), { reply: 'Test the weakest assumption.' });
  const observation = { observation: 'A possible pattern', evidence: 'Two recorded outcomes', question: 'What else could explain this?', sourceIds: ['one', 'foreign'] };
  assert.throws(() => parseAIResult({ insights: [observation] }, 'patterns', ['one', 'two']), /unsupported/);
  assert.throws(() => parseAIResult({ insights: [{ ...observation, sourceIds: ['one'] }] }, 'patterns', ['one']), /unsupported/);
  assert.deepEqual(parseAIResult({ insights: [] }, 'patterns', ['one', 'two']), { insights: [] });
  assert.throws(() => parseDraft({ ...draft, sourceIds: ['../other-user'] }), /Invalid ID/);
  assert.throws(() => parseReview({ ...draft.reviews[0], result: ['met'] }), /Choose an outcome/);
});
