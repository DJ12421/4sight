export interface Turn { role: 'user' | 'model'; text: string }
export interface Brief {
  options: string[];
  priorities: string;
  constraints: string;
  assumptions: string;
  questions: string;
}
export interface Commitment {
  option: string;
  reasoning: string;
  expectedOutcome: string;
  confidence: number;
  experiment: string;
  successCriteria: string;
  reviewDate: string;
  committedAt: string;
}
export interface Review {
  id: string;
  outcome: string;
  lesson: string;
  result: 'met' | 'partly' | 'not-yet';
  analysis: string;
  model: string;
  createdAt: string;
}
export interface Decision {
  id: string;
  title: string;
  dilemma: string;
  brief: Brief;
  turns: Turn[];
  sourceIds: string[];
  journalId?: string;
  commitment: Commitment | null;
  reviews: Review[];
  revision: number;
  lastMutationId: string;
  createdAt: string;
  updatedAt: string;
  sample: boolean;
}
export interface Insight { observation: string; evidence: string; question: string; sourceIds: string[] }
export interface PatternReport {
  insights: Insight[];
  sources: { id: string; revision: number }[];
  model: string;
  createdAt: string;
}
export type AIAction = 'chat' | 'brief' | 'challenge' | 'review' | 'patterns' | 'journal';
export interface AIResult { reply?: string; brief?: Brief; insights?: Insight[]; model: string }
export const emptyBrief = (): Brief => ({ options: ['', ''], priorities: '', constraints: '', assumptions: '', questions: '' });
export function newDecision(): Decision {
  return { id: crypto.randomUUID(), title: '', dilemma: '', brief: emptyBrief(), turns: [], sourceIds: [], commitment: null, reviews: [], revision: 0, lastMutationId: '', createdAt: '', updatedAt: '', sample: false };
}
export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function stage(d: Decision): 'Clarify' | 'Experiment' | 'Reviewed' {
  return d.reviews.length ? 'Reviewed' : d.commitment ? 'Experiment' : 'Clarify';
}
// This exact bounded representation is shown in the context preview and sent to Gemini.
export function evidenceRecord(d: Decision) {
  return { id: d.id, title: d.title, fictional: d.sample, chosenOption: d.commitment?.option ?? '',
    expectation: d.commitment?.expectedOutcome.slice(0, 1000) ?? '',
    experiment: d.commitment?.experiment.slice(0, 1000) ?? '',
    reviews: d.reviews.slice(-3).map(r => ({ outcome: r.outcome.slice(0, 1000), lesson: r.lesson.slice(0, 1000), result: r.result })) };
}
export function sourceVersions(selected: string[], decisions: Decision[]) {
  return selected.map(id => ({ id, revision: decisions.find(d => d.id === id)?.revision ?? -1 }));
}

export class InputError extends Error {}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InputError('Expected an object.');
  return value as Record<string, unknown>;
}
export function text(value: unknown, label: string, max = 4000, required = true): string {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new InputError(`${label} must ${required ? 'contain text and ' : ''}be at most ${max} characters.`);
  return value.trim();
}
export function identifier(value: unknown): string {
  const id = text(value, 'ID', 100);
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new InputError('Invalid ID.');
  return id;
}
export function ids(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 20) throw new InputError('Select at most 20 sources.');
  const result = value.map(identifier);
  if (new Set(result).size !== result.length) throw new InputError('Duplicate sources are not allowed.');
  return result;
}
export function parseBrief(value: unknown, complete = false): Brief {
  const b = object(value);
  if (!Array.isArray(b.options) || b.options.length < 2 || b.options.length > 5) throw new InputError('Provide between two and five options.');
  return { options: b.options.map(v => text(v, 'Option', 300, complete)),
    priorities: text(b.priorities, 'Priorities', 2000, false), constraints: text(b.constraints, 'Constraints', 2000, false),
    assumptions: text(b.assumptions, 'Assumptions', 2000, false), questions: text(b.questions, 'Questions', 2000, false) };
}
export function parseDraft(value: unknown) {
  const d = object(value);
  if (!Array.isArray(d.turns) || d.turns.length > 40) throw new InputError('A decision supports up to 40 conversation turns. Start another decision to continue.');
  const turns: Turn[] = d.turns.map(v => {
    const t = object(v);
    if (t.role !== 'user' && t.role !== 'model') throw new InputError('Invalid conversation role.');
    return { role: t.role, text: text(t.text, 'Message', 6000) };
  });
  return { title: text(d.title, 'Title', 150), dilemma: text(d.dilemma, 'Dilemma', 6000), brief: parseBrief(d.brief), turns, sourceIds: ids(d.sourceIds), ...(d.journalId === undefined ? {} : { journalId: identifier(d.journalId) }) };
}
export function parseCommitment(value: unknown): Omit<Commitment, 'committedAt'> {
  const c = object(value);
  const reviewDate = text(c.reviewDate, 'Review date', 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reviewDate) || !Number.isFinite(Date.parse(reviewDate)) || new Date(reviewDate).toISOString().slice(0, 10) !== reviewDate) throw new InputError('Choose a valid review date.');
  if (!Number.isInteger(c.confidence) || Number(c.confidence) < 0 || Number(c.confidence) > 100) throw new InputError('Confidence must be from 0 to 100.');
  return { option: text(c.option, 'Chosen option', 300), reasoning: text(c.reasoning, 'Reasoning', 2000), expectedOutcome: text(c.expectedOutcome, 'Expected outcome', 2000),
    confidence: Number(c.confidence), experiment: text(c.experiment, 'Experiment', 2000), successCriteria: text(c.successCriteria, 'Success criteria', 2000), reviewDate };
}
export function parseReview(value: unknown): Omit<Review, 'createdAt'> {
  const r = object(value);
  if (r.result !== 'met' && r.result !== 'partly' && r.result !== 'not-yet') throw new InputError('Choose an outcome.');
  return { id: identifier(r.id), outcome: text(r.outcome, 'Outcome', 4000), lesson: text(r.lesson, 'Lesson', 2000),
    result: r.result as Review['result'], analysis: text(r.analysis, 'AI analysis', 6000, false), model: text(r.model, 'Model', 100, false) };
}
export function parseAIResult(value: unknown, action: AIAction, allowed: string[]): Omit<AIResult, 'model'> {
  const r = object(value);
  if (action === 'brief') return { brief: parseBrief(r.brief, true) };
  if (action !== 'patterns') return { reply: text(r.reply, 'AI reply', 6000) };
  if (!Array.isArray(r.insights) || r.insights.length > 5) throw new InputError('Invalid pattern output.');
  return { insights: r.insights.map(v => {
    const i = object(v), sourceIds = ids(i.sourceIds);
    if (sourceIds.length < 2 || sourceIds.some(id => !allowed.includes(id))) throw new InputError('AI returned unsupported evidence references.');
    return { observation: text(i.observation, 'Observation', 2000), evidence: text(i.evidence, 'Evidence', 2000), question: text(i.question, 'Question', 1000), sourceIds };
  }) };
}
