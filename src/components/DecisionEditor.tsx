import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from './Markdown';
import { ArrowLeft, ArrowRight, Check, ShieldQuestion, Sparkles } from 'lucide-react';
import { AIResult, Brief, Commitment, Decision, Review, localDate, parseCommitment, parseDraft, parseReview, sourceVersions } from '../domain';
import { request, RequestError } from '../lib/workspace';
import { SourcePicker } from './SourcePicker';

type Props = { initial: Decision; decisions: Decision[]; uid: string; onBack: () => void; onDirty: (value: boolean) => void; onSaved: (d: Decision) => void; onStartNext: (sourceIds: string[]) => void };
export function DecisionEditor({ initial, decisions, uid, onBack, onDirty, onSaved, onStartNext }: Props) {
  const [decision, setDecision] = useState(initial);
  const [phase, setPhase] = useState<'clarify' | 'commit' | 'review'>(initial.commitment ? 'review' : 'clarify');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dirty, setDirty] = useState(false);
  const [commitDirty, setCommitDirty] = useState(false);
  const [reviewDirty, setReviewDirty] = useState(false);
  const unsaved = dirty || commitDirty || reviewDirty;
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 7);
  const [commitment, setCommitment] = useState<Omit<Commitment, 'committedAt'>>({ option: initial.brief.options[0] || '', reasoning: '', expectedOutcome: '', confidence: 60, experiment: '', successCriteria: '', reviewDate: localDate(tomorrow) });
  const blankReview = (): Omit<Review, 'createdAt'> => ({ id: crypto.randomUUID(), outcome: '', lesson: '', result: 'partly', analysis: '', model: '' });
  const [review, setReview] = useState(blankReview);
  const controller = useRef(new AbortController());
  const working = useRef(false);
  const pending = useRef<{ operation: string; body: unknown } | null>(null);
  useEffect(() => {
    controller.current = new AbortController();
    return () => controller.current.abort();
  }, []);
  useEffect(() => { onDirty(unsaved || !!busy || !!message); }, [unsaved, busy, message, onDirty]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (unsaved || busy || message) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved, busy, message]);
  const active = () => !controller.current.signal.aborted;
  const locked = !!busy || !!pending.current;
  function update<K extends keyof Decision>(key: K, value: Decision[K]) { setDecision(d => ({ ...d, [key]: value })); setDirty(true); setNotice(''); }
  function updateBrief<K extends keyof Brief>(key: K, value: Brief[K]) { update('brief', { ...decision.brief, [key]: value }); }
  async function perform(label: string, fn: () => Promise<void>) {
    if (working.current) return;
    working.current = true; setBusy(label); setError(''); setNotice('');
    try { await fn(); } catch (e) { if (active()) { setNotice(''); setError(e instanceof Error ? e.message : 'Something went wrong. Your draft is still here.'); } }
    finally { working.current = false; if (active()) setBusy(''); }
  }
  async function sendPending(): Promise<Decision> {
    const operation = pending.current!;
    let saved: Decision;
    try { saved = await request<Decision>(uid, `/api/decisions/${decision.id}`, operation.body, controller.current.signal, 'PUT'); }
    catch (e) {
      // A definitive validation rejection did not write. Allow correcting the draft.
      // Ambiguous network/server failures retain the exact mutation for retry.
      if (e instanceof RequestError && [400, 404, 413].includes(e.status)) pending.current = null;
      throw e;
    }
    if (!active()) throw new DOMException('Closed.', 'AbortError');
    pending.current = null; setDecision(saved); onSaved(saved); setDirty(false); setNotice('Saved to your journal.');
    if (operation.operation === 'review') { setReview(blankReview()); setReviewDirty(false); }
    if (operation.operation === 'commit') { setPhase('review'); setCommitDirty(false); }
    return saved;
  }
  function downloadDraft() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ decision, commitmentDraft: commitment, reviewDraft: review, unsentMessage: message }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'foresight-unsaved-draft.json'; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function persist(d: Decision, operation = 'draft', extra: Record<string, unknown> = {}) {
    if (!pending.current) pending.current = { operation, body: { operation, revision: d.revision, mutationId: crypto.randomUUID(), sources: decisions.filter(item => d.sourceIds.includes(item.id)), ...(operation === 'draft' ? { draft: parseDraft(d) } : extra) } };
    return sendPending();
  }
  async function ask(action: 'chat' | 'brief' | 'challenge') {
    parseDraft(decision);
    if ((action === 'chat' && decision.turns.length > 38) || (action === 'challenge' && decision.turns.length > 39)) throw new Error('This conversation is full. You can still edit the brief and record your decision.');
    const result = await request<AIResult>(uid, '/api/ai', { action, draft: decision, message: action === 'challenge' ? '' : message, sourceIds: decision.sourceIds, sourceVersions: sourceVersions(decision.sourceIds, decisions), sources: decisions.filter(d => decision.sourceIds.includes(d.id)) }, controller.current.signal);
    if (!active()) return;
    const next: Decision = action === 'brief'
      ? { ...decision, brief: result.brief! }
      : action === 'challenge'
        ? { ...decision, turns: [...decision.turns, { role: 'model', text: result.reply! }] }
        : { ...decision, turns: [...decision.turns, { role: 'user', text: message.trim() }, { role: 'model', text: result.reply! }] };
    setDecision(next); setDirty(true);
    if (action === 'chat') setMessage('');
    await persist(next);
  }
  return <div className="editor-page">
    <button className="text-button back" onClick={onBack}><ArrowLeft size={16} /> All decisions</button>
    <div className="page-heading"><div><p className="eyebrow">{decision.sample ? 'Fictional example in your workspace' : 'Your decision notebook'}</p><h1>{decision.title || 'Make room for a better decision.'}</h1></div><span className="save-state" role="status">{busy || (unsaved || message ? 'Unsaved changes' : decision.revision ? 'Saved' : 'New draft')}</span></div>
    <nav className="journey-tabs" aria-label="Decision stages">
      {(['clarify', 'commit', 'review'] as const).map((p, i) => <button key={p} disabled={!!busy || (p === 'review' && !decision.commitment)} aria-current={phase === p ? 'step' : undefined} onClick={() => setPhase(p)}><span>{i + 1}</span>{p === 'clarify' ? 'Clarify' : p === 'commit' ? 'Commit' : 'Review'}{(p === 'clarify' && decision.commitment || p === 'commit' && decision.commitment) && <Check size={14} />}</button>)}
    </nav>
    {error && <div className="alert" role="alert"><p>{error}</p><div className="button-row">{pending.current && <button onClick={() => perform('Retrying save…', async () => { await sendPending(); })} disabled={!!busy}>Retry the same save</button>}<button className="secondary" onClick={downloadDraft}>Download a copy of my draft</button></div><p className="small">{pending.current ? 'Editing is paused until this save is confirmed. For a conflict, download your writing, go back to all decisions, and reopen the saved version.' : 'Your writing has been kept in this window.'}</p></div>}
    {notice && <p className="success" role="status"><Check size={16} />{notice}</p>}
    {phase === 'clarify' && <div className="editor-grid">
      <section className="paper"><div className="section-heading"><span className="eyebrow">The situation</span><span className="small">In your own words</span></div>
        <fieldset disabled={locked || !!decision.commitment}>
          <label>A name for this decision<input value={decision.title} maxLength={150} onChange={e => update('title', e.target.value)} placeholder="Which project should I build this semester?" /></label>
          <label>What are you weighing?<textarea rows={5} maxLength={6000} value={decision.dilemma} onChange={e => update('dilemma', e.target.value)} placeholder="What are your options, and what makes this difficult?" /></label>
          <SourcePicker decisions={decisions.filter(d => d.id !== decision.id)} selected={decision.sourceIds} onChange={value => update('sourceIds', value)} disabled={locked || !!decision.commitment} />
        </fieldset>
        <div className="conversation" aria-label="Decision conversation">{decision.turns.map((t, i) => <article className={`turn ${t.role}`} key={i}><span className="eyebrow">{t.role === 'user' ? 'You' : 'Gemini · a perspective'}</span><ReactMarkdown>{t.text}</ReactMarkdown></article>)}</div>
        {!decision.commitment && <form onSubmit={e => { e.preventDefault(); void perform('Thinking with you…', () => ask('chat')); }}><label>Talk it through<textarea rows={3} value={message} maxLength={4000} disabled={locked} onChange={e => setMessage(e.target.value)} placeholder="I’m leaning toward… but I’m worried about…" /></label><button disabled={locked || !message.trim() || !decision.title.trim() || !decision.dilemma.trim()}><Sparkles size={16} /> Ask Gemini</button><p className="small muted">Your current brief, conversation, message, and selected past experience are shared with Gemini when you ask.</p></form>}
      </section>
      <section className="paper brief-paper"><div className="section-heading"><div><span className="eyebrow">The decision brief</span><h2>See the tradeoffs.</h2></div></div>
        {!decision.commitment && <button className="secondary full" disabled={locked || !decision.title.trim() || !decision.dilemma.trim()} onClick={() => {
          if (decision.brief.options.some(Boolean) && !window.confirm('Replace this brief with a new Gemini suggestion? Your conversation stays available.')) return;
          void perform('Drafting your brief…', () => ask('brief'));
        }}><Sparkles size={16} /> Draft brief with Gemini</button>}
        {!decision.commitment && <div className="challenge-card"><div className="challenge-icon"><ShieldQuestion size={20} /></div><div><span className="eyebrow">Before you commit</span><h3>Pressure-test your thinking.</h3><p>Ask Gemini for the strongest counterargument, your weakest assumption, and what evidence should change your mind.</p><button type="button" className="secondary" disabled={locked || !decision.title.trim() || !decision.dilemma.trim()} onClick={() => perform('Pressure-testing your thinking…', () => ask('challenge'))}><ShieldQuestion size={16} /> Challenge my thinking</button></div></div>}
        <p className="small muted">{decision.commitment ? 'The brief as it stood when you committed.' : 'Edit every suggestion. You can also fill this in without AI.'}</p>
        <fieldset disabled={locked || !!decision.commitment}>
          {decision.brief.options.map((option, i) => <label key={i}>Option {String.fromCharCode(65 + i)}<input value={option} maxLength={300} onChange={e => updateBrief('options', decision.brief.options.map((v, index) => index === i ? e.target.value : v))} /></label>)}
          {!decision.commitment && <div className="button-row">{decision.brief.options.length < 5 && <button type="button" className="text-button" onClick={() => updateBrief('options', [...decision.brief.options, ''])}>+ Add an option</button>}{decision.brief.options.length > 2 && <button type="button" className="text-button" onClick={() => updateBrief('options', decision.brief.options.slice(0, -1))}>Remove last option</button>}</div>}
          {([['priorities', 'What matters most'], ['constraints', 'Limits to work within'], ['assumptions', 'What you’re assuming'], ['questions', 'What you still need to learn']] as const).map(([key, label]) => <label key={key}>{label}<textarea rows={3} maxLength={2000} value={decision.brief[key]} onChange={e => updateBrief(key, e.target.value)} /></label>)}
        </fieldset>
        {!decision.commitment && <div className="button-row"><button className="secondary" disabled={locked} onClick={() => perform('Saving draft…', async () => { await persist(decision); })}>Save draft</button><button disabled={locked} onClick={() => { setCommitment(c => ({ ...c, option: decision.brief.options.includes(c.option) ? c.option : decision.brief.options[0] })); setPhase('commit'); }}>Choose a direction <ArrowRight size={16} /></button></div>}
      </section>
    </div>}
    {phase === 'commit' && <section className="paper narrow"><p className="eyebrow">A commitment, not a prediction</p><h2>What will you try?</h2><p className="muted">Record what you expect before you know the outcome. Once saved, this commitment stays intact for an honest comparison.</p>
      {decision.commitment ? <CommitmentView value={decision.commitment} /> : <form onSubmit={e => { e.preventDefault(); void perform('Recording your commitment…', async () => {
        if (message.trim()) throw new Error('Send or clear your unsent message in Clarify before recording a commitment.');
        const parsed = parseCommitment(commitment);
        if (!decision.brief.options.includes(parsed.option)) throw new Error('Choose an option from your brief.');
        const saved = await persist(decision);
        await persist(saved, 'commit', { commitment: parsed });
      }); }}><fieldset disabled={locked}>
        <label>I’m choosing<select value={commitment.option} onChange={e => { setCommitment(c => ({ ...c, option: e.target.value })); setCommitDirty(true); }} required><option value="">Choose an option</option>{decision.brief.options.filter(Boolean).map((o, i) => <option key={i} value={o}>{o}</option>)}</select></label>
        {([['reasoning', 'Why this option?'], ['expectedOutcome', 'What do you expect to happen?'], ['experiment', 'The smallest experiment you’ll try'], ['successCriteria', 'What would count as success?']] as const).map(([key, label]) => <label key={key}>{label}<textarea rows={3} required maxLength={2000} value={commitment[key]} onChange={e => { setCommitment(c => ({ ...c, [key]: e.target.value })); setCommitDirty(true); }} /></label>)}
        <div className="form-pair"><label>Confidence in this outcome: {commitment.confidence}%<input type="range" min="0" max="100" step="5" value={commitment.confidence} onChange={e => { setCommitment(c => ({ ...c, confidence: Number(e.target.value) })); setCommitDirty(true); }} /></label><label>Review on<input type="date" required value={commitment.reviewDate} onChange={e => { setCommitment(c => ({ ...c, reviewDate: e.target.value })); setCommitDirty(true); }} /></label></div>
        <button type="submit">Record commitment <ArrowRight size={16} /></button>
      </fieldset></form>}
    </section>}
    {phase === 'review' && decision.commitment && <div className="editor-grid review-grid"><section className="paper expectation"><p className="eyebrow">Then · your original commitment</p><h2>What you expected.</h2><CommitmentView value={decision.commitment} /></section><section className="paper"><p className="eyebrow">Now · what actually happened</p><h2>Turn experience into evidence.</h2>
      <form onSubmit={e => { e.preventDefault(); void perform('Saving your review…', async () => { await persist(decision, 'review', { review: parseReview(review) }); }); }}><fieldset disabled={locked}>
        <label>What happened?<textarea rows={5} maxLength={4000} required value={review.outcome} onChange={e => { setReview(r => ({ ...r, outcome: e.target.value, analysis: '', model: '' })); setReviewDirty(true); }} placeholder="Describe what you observed. Numbers, feedback, and surprises help." /></label>
        <label>Did it meet your success criteria?<select value={review.result} onChange={e => { setReview(r => ({ ...r, result: e.target.value as Review['result'] })); setReviewDirty(true); }}><option value="met">Yes, met the criteria</option><option value="partly">Partly</option><option value="not-yet">Not yet</option></select></label>
        <label>What would you carry into your next decision?<textarea rows={3} maxLength={2000} required value={review.lesson} onChange={e => { setReview(r => ({ ...r, lesson: e.target.value, analysis: '', model: '' })); setReviewDirty(true); }} /></label>
        <button type="button" className="secondary" disabled={!review.outcome.trim()} onClick={() => perform('Comparing expectation and outcome…', async () => {
          const result = await request<AIResult>(uid, '/api/ai', { action: 'review', decisionId: decision.id, draft: decision, outcome: review.outcome, lesson: review.lesson, sourceIds: [] }, controller.current.signal);
          if (active()) { setReview(r => ({ ...r, analysis: result.reply!, model: result.model })); setReviewDirty(true); }
        })}><Sparkles size={16} /> Help me reflect</button>
        <p className="small muted">Optional: shares this decision’s original situation, commitment, outcome, and lesson with Gemini.</p>
        {review.analysis && <div className="ai-note"><span className="eyebrow">AI interpretation · check against your experience</span><ReactMarkdown>{review.analysis}</ReactMarkdown></div>}
        <button type="submit">Save outcome review <Check size={16} /></button>
      </fieldset></form>
    </section>{decision.reviews.length > 0 && <section className="review-history"><div className="section-heading"><h2>Recorded outcomes</h2><button className="secondary" disabled={locked} onClick={() => onStartNext([decision.id])}>Bring this experience into a new decision <ArrowRight size={16} /></button></div>{[...decision.reviews].reverse().map(r => <article className="paper" key={r.id}><div className="section-heading"><span className="eyebrow">{new Date(r.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}</span><span className="tag">{r.result === 'met' ? 'Criteria met' : r.result === 'partly' ? 'Partly met' : 'Not yet met'}</span></div><h3>Your observation</h3><p className="preserve">{r.outcome}</p><h3>Your lesson</h3><p className="preserve">{r.lesson}</p>{r.analysis && <div className="ai-note"><span className="eyebrow">AI interpretation · {r.model}</span><ReactMarkdown>{r.analysis}</ReactMarkdown></div>}</article>)}</section>}</div>}
  </div>;
}
export function CommitmentView({ value: c }: { value: Commitment }) {
  return <dl className="commitment-details"><dt>Choice</dt><dd className="chosen-option">{c.option}</dd><dt>Reasoning at the time</dt><dd>{c.reasoning}</dd><dt>Expected outcome</dt><dd>{c.expectedOutcome}</dd><dt>Small experiment</dt><dd>{c.experiment}</dd><dt>Success criteria</dt><dd>{c.successCriteria}</dd><div className="form-pair"><div><dt>Confidence then</dt><dd>{c.confidence}%</dd></div><div><dt>Review date</dt><dd>{c.reviewDate}</dd></div></div></dl>;
}
