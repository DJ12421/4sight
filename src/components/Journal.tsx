import { useEffect, useState } from 'react';
import { ArrowRight, BookOpen, Feather, MessageCircle, Sparkles } from 'lucide-react';
import ReactMarkdown from './Markdown';
import { request } from '../lib/workspace';
import { JournalInteraction, ReflectionMode } from '../types';

const modeLabels: Record<Exclude<ReflectionMode, 'chat'>, string> = {
  reflect: 'Reflect with me',
  summarize: 'Help me make sense of it',
  brainstorm: 'Explore what comes next',
};

export function Journal({ uid, entries, loading, canLoadOlder, onDirty, onSaved, onStartDecision, onLoadOlder }: {
  uid: string;
  entries: JournalInteraction[];
  loading: boolean;
  canLoadOlder: boolean;
  onDirty: (dirty: boolean) => void;
  onSaved: (entry: JournalInteraction) => void;
  onStartDecision: (entry: JournalInteraction) => void;
  onLoadOlder: () => void;
}) {
  const [title, setTitle] = useState('');
  const [entry, setEntry] = useState('');
  const [mode, setMode] = useState<Exclude<ReflectionMode, 'chat'>>('reflect');
  const [activeId, setActiveId] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    onDirty(!!busy || !!title || !!entry || !!followUp);
    return () => onDirty(false);
  }, [busy, title, entry, followUp, onDirty]);

  async function submit() {
    if (busy || !title.trim() || !entry.trim()) return;
    const id = crypto.randomUUID();
    setBusy('new'); setError('');
    try {
      const saved = await request<JournalInteraction>(uid, '/api/journal', { id, title, entry, mode });
      onSaved(saved); setTitle(''); setEntry('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save this journal entry.'); }
    finally { setBusy(''); }
  }

  async function continueEntry(item: JournalInteraction) {
    if (busy || !followUp.trim()) return;
    setBusy(item.id); setError('');
    try {
      const saved = await request<JournalInteraction>(uid, '/api/journal', { id: item.id, message: followUp });
      onSaved(saved); setFollowUp(''); setActiveId('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not continue this reflection.'); }
    finally { setBusy(''); }
  }

  return <>
    <div className="page-heading journal-heading"><div><p className="eyebrow">Notice before you decide</p><h1>Your journal.</h1><p className="muted">Write what is happening in your own words. Gemini can reflect it back, and you decide what is worth carrying forward.</p></div><Feather size={42} strokeWidth={1} aria-hidden="true" /></div>
    <section className="journal-composer" aria-labelledby="journal-prompt">
      <div className="journal-margin" aria-hidden="true"><span>{new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span></div>
      <div className="journal-page">
        <p className="eyebrow">A new page</p>
        <h2 id="journal-prompt">What deserves your attention today?</h2>
        <label>Give this page a title<input maxLength={150} value={title} onChange={event => setTitle(event.target.value)} placeholder="The conversation I keep replaying" disabled={!!busy} /></label>
        <label>Write freely<textarea rows={7} maxLength={6000} value={entry} onChange={event => setEntry(event.target.value)} placeholder="Start with what happened, what you noticed, or what you cannot stop thinking about…" disabled={!!busy} /></label>
        <div className="journal-actions"><label>How should Gemini help?<select value={mode} onChange={event => setMode(event.target.value as Exclude<ReflectionMode, 'chat'>)} disabled={!!busy}>{Object.entries(modeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button onClick={submit} disabled={!!busy || !title.trim() || !entry.trim()}><Sparkles size={16} />{busy === 'new' ? 'Reflecting…' : 'Save and reflect'}</button></div>
      </div>
    </section>
    {error && <p className="alert" role="alert">{error}</p>}
    <div className="journal-history-heading"><div><p className="eyebrow">Pages and conversations</p><h2>Your reflections</h2></div><span className="small muted">Private to your account</span></div>
    {loading ? <p role="status">Opening your journal…</p> : !entries.length ? <div className="empty-state"><Feather size={40} strokeWidth={1} /><h2>Your first page is blank.</h2><p>Write above. Your words remain the record; Gemini’s response is kept clearly separate.</p></div> : entries.map(item => <article className="paper journal-entry" key={item.id}>
      <div className="journal-entry-meta"><span className="tag">{modeLabels[item.mode as Exclude<ReflectionMode, 'chat'>] || 'Earlier reflection'}</span><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</time></div>
      <h2>{item.title}</h2>
      <p className="preserve journal-words">{item.prompt}</p>
      <div className="ai-note"><span className="eyebrow">Gemini · a reflection</span><ReactMarkdown>{item.response}</ReactMarkdown></div>
      {item.turns?.map((turn, index) => <div className={`legacy-turn ${turn.role}`} key={`${turn.timestamp}-${index}`}><strong>{turn.role === 'user' ? 'You' : 'Gemini'}</strong><ReactMarkdown>{turn.text}</ReactMarkdown></div>)}
      {activeId === item.id ? <div className="journal-follow-up"><label>Continue this reflection<textarea rows={3} maxLength={4000} autoFocus value={followUp} onChange={event => setFollowUp(event.target.value)} placeholder="What feels true, unclear, or different now?" disabled={!!busy} /></label><div className="button-row"><button onClick={() => continueEntry(item)} disabled={!!busy || !followUp.trim()}><MessageCircle size={15} />{busy === item.id ? 'Reflecting…' : 'Send to Gemini'}</button><button className="text-button" onClick={() => { setActiveId(''); setFollowUp(''); }} disabled={!!busy}>Cancel</button></div></div> : <div className="journal-entry-actions"><button className="secondary" onClick={() => { setActiveId(item.id); setFollowUp(''); }} disabled={!!busy}><MessageCircle size={15} />Continue reflecting</button><button className="text-button" onClick={() => onStartDecision(item)} disabled={!!busy}><BookOpen size={15} />Turn this into a decision <ArrowRight size={15} /></button></div>}
    </article>)}
    {canLoadOlder && <button className="secondary" onClick={onLoadOlder}>Load older entries</button>}
  </>;
}
