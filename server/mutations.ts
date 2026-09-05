import { Decision, InputError, identifier, object, parseBrief, parseCommitment, parseDraft, parseReview } from '../src/domain';

export class ConflictError extends Error {}
export function mutateDecision(id: string, previous: Decision | null, value: unknown, now: string): Decision {
  const body = object(value), mutationId = identifier(body.mutationId);
  // A lost acknowledgement can safely repeat the exact operation.
  if (previous?.lastMutationId === mutationId) return previous;
  if (!Number.isInteger(body.revision) || body.revision !== (previous?.revision ?? 0)) throw new ConflictError('This decision changed elsewhere. Reopen the saved version before continuing. Your draft is still here.');
  if (body.operation === 'draft') {
    if (previous?.commitment) throw new ConflictError('The original decision is already committed. Add an outcome review instead.');
    const draft = parseDraft(body.draft);
    return { ...draft, id, commitment: null, reviews: [], revision: (previous?.revision ?? 0) + 1,
      lastMutationId: mutationId, createdAt: previous?.createdAt || now, updatedAt: now, sample: previous?.sample ?? false };
  }
  if (!previous) throw new InputError('Save the decision brief first.');
  const next = { ...previous, revision: previous.revision + 1, lastMutationId: mutationId, updatedAt: now };
  if (body.operation === 'commit') {
    if (previous.commitment) throw new ConflictError('This commitment is already recorded.');
    const brief = parseBrief(previous.brief, true);
    if (new Set(brief.options).size < 2) throw new InputError('Record at least two distinct options before committing.');
    const commitment = parseCommitment(body.commitment);
    if (!previous.brief.options.includes(commitment.option)) throw new InputError('Choose an option from the saved brief.');
    return { ...next, commitment: { ...commitment, committedAt: now } };
  }
  if (body.operation === 'review') {
    if (!previous.commitment) throw new InputError('Record a commitment before reviewing it.');
    if (previous.reviews.length >= 20) throw new InputError('This decision has reached its 20-review limit. Start a new decision to continue.');
    const review = parseReview(body.review);
    if (previous.reviews.some(r => r.id === review.id)) throw new ConflictError('This review has already been saved.');
    return { ...next, reviews: [...previous.reviews, { ...review, createdAt: now }] };
  }
  throw new InputError('Unknown decision operation.');
}
