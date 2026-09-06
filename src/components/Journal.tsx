import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, BookOpen, CalendarDays, ChevronLeft, ChevronRight, Download, Feather, FileJson, MessageCircle, Mic, MicOff, Search, ShieldCheck, Sparkles, Tags, Trash2, X } from 'lucide-react';
import ReactMarkdown from './Markdown';
import { request } from '../lib/workspace';
import { Decision, stage } from '../domain';
import { JournalInteraction, ReflectionMode } from '../types';
import { deleteDecisionFromFirestore, deleteJournalFromFirestore, syncJournalToFirestore } from '../lib/storage';

const modeLabels: Record<Exclude<ReflectionMode, 'chat'>, string> = {
  reflect: 'Reflect with me',
  summarize: 'Help me make sense of it',
  brainstorm: 'Explore what comes next',
};
type ExportData = { exportedAt: string; journal: JournalInteraction[]; decisions: Decision[]; insights: unknown };
type VoiceEvent = { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> };
type VoiceRecognition = {
  continuous: boolean; interimResults: boolean; lang: string;
  start: () => void; stop: () => void; abort: () => void;
  onresult: ((event: VoiceEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
};

function dayKey(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function download(name: string, type: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function journalMarkdown(data: ExportData): string {
  const pages = [...data.journal].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(item => {
    const turns = (item.turns || []).map(turn => `### ${turn.role === 'user' ? 'You' : 'Gemini'}\n\n${turn.text}`).join('\n\n');
    return `## ${item.title}\n\n${new Date(item.createdAt).toLocaleString()}${item.tags?.length ? ` · ${item.tags.map(tag => `#${tag}`).join(' ')}` : ''}\n\n### Your entry\n\n${item.prompt}\n\n### Gemini reflection\n\n${item.response}${turns ? `\n\n${turns}` : ''}`;
  });
  return `# Foresight journal\n\nExported ${new Date(data.exportedAt).toLocaleString()}\n\n${pages.join('\n\n---\n\n')}\n`;
}

function JournalCalendar({ entries, decisions, selected, onSelect }: { entries: JournalInteraction[]; decisions: Decision[]; selected: string; onSelect: (day: string) => void }) {
  const today = new Date();
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const firstOffset = month.getDay(), daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const activity = useMemo(() => {
    const result = new Map<string, { journal: number; decisions: number }>();
    const add = (value: string, kind: 'journal' | 'decisions') => { const key = dayKey(value); if (!key) return; const count = result.get(key) || { journal: 0, decisions: 0 }; count[kind]++; result.set(key, count); };
    entries.forEach(item => add(item.createdAt, 'journal'));
    decisions.forEach(item => add(item.createdAt, 'decisions'));
    return result;
  }, [entries, decisions]);
  return <section className="journal-calendar" aria-label="Journal and decision calendar">
    <div className="calendar-heading"><div><CalendarDays size={18} /><strong>{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</strong></div><div><button className="icon-button" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={17} /></button><button className="icon-button" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={17} /></button></div></div>
    <div className="calendar-grid">{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((label, index) => <span className="calendar-weekday" key={`${label}-${index}`}>{label}</span>)}
      {Array.from({ length: firstOffset }, (_, index) => <span key={`blank-${index}`} />)}
      {Array.from({ length: daysInMonth }, (_, index) => { const date = new Date(month.getFullYear(), month.getMonth(), index + 1), key = dayKey(date), count = activity.get(key); const label = `${date.toLocaleDateString()}${count ? `, ${count.journal} journal entries and ${count.decisions} decisions` : ''}`; return <button key={key} className={`${key === dayKey(today) ? 'today' : ''} ${key === selected ? 'selected' : ''}`} aria-label={label} aria-pressed={key === selected} onClick={() => onSelect(key === selected ? '' : key)}><span>{index + 1}</span><i>{count?.journal ? <b className="journal-dot" title={`${count.journal} journal entries`} /> : null}{count?.decisions ? <b className="decision-dot" title={`${count.decisions} decisions`} /> : null}</i></button>; })}
    </div>
    <div className="calendar-legend"><span><i className="journal-dot" />Journal</span><span><i className="decision-dot" />Decision</span>{selected && <button className="text-button" onClick={() => onSelect('')}><X size={13} />Clear date</button>}</div>
  </section>;
}

export function Journal({ uid, entries, decisions, loading, canLoadOlder, onDirty, onSaved, onDeleted, onDeleteAll, onStartDecision, onLoadOlder, onOpenDecision }: {
  uid: string; entries: JournalInteraction[]; decisions: Decision[]; loading: boolean; canLoadOlder: boolean;
  onDirty: (dirty: boolean) => void; onSaved: (entry: JournalInteraction) => void; onDeleted: (id: string) => void; onDeleteAll: () => void;
  onStartDecision: (entry: JournalInteraction) => void; onLoadOlder: () => void; onOpenDecision?: (d: Decision) => void;
}) {
  const [title, setTitle] = useState(''), [entry, setEntry] = useState(''), [tags, setTags] = useState('');
  const [mode, setMode] = useState<Exclude<ReflectionMode, 'chat'>>('reflect');
  const [typeFilter, setTypeFilter] = useState<'all' | 'reflections' | 'decisions'>('all');
  const [activeId, setActiveId] = useState(''), [followUp, setFollowUp] = useState(''), [tagEditorId, setTagEditorId] = useState(''), [editTags, setEditTags] = useState(''), [busy, setBusy] = useState(''), [error, setError] = useState('');
  const [search, setSearch] = useState(''), [tag, setTag] = useState(''), [date, setDate] = useState(''), [listening, setListening] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteSuccess, setDeleteSuccess] = useState(false);
  const voice = useRef<VoiceRecognition | null>(null);
  useEffect(() => { onDirty(!!busy || listening || !!title || !!entry || !!tags || !!followUp || !!tagEditorId || showDeleteModal); return () => onDirty(false); }, [busy, listening, title, entry, tags, followUp, tagEditorId, showDeleteModal, onDirty]);
  useEffect(() => () => voice.current?.abort(), []);
  const allTags = useMemo(() => [...new Set(entries.flatMap(item => item.tags || []))].sort(), [entries]);

  type JournalFeedItem =
    | { kind: 'reflection'; id: string; date: string; data: JournalInteraction }
    | { kind: 'decision'; id: string; date: string; data: Decision };

  const items = useMemo<JournalFeedItem[]>(() => {
    const list: JournalFeedItem[] = [];
    if (typeFilter !== 'decisions') {
      entries.forEach(e => list.push({ kind: 'reflection', id: e.id, date: e.createdAt, data: e }));
    }
    if (typeFilter !== 'reflections') {
      decisions.forEach(d => list.push({ kind: 'decision', id: d.id, date: d.createdAt || d.updatedAt, data: d }));
    }
    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [entries, decisions, typeFilter]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items.filter(item => {
      if (date && dayKey(item.date) !== date) return false;
      if (item.kind === 'reflection') {
        const e = item.data;
        if (tag && !e.tags?.includes(tag)) return false;
        if (needle) {
          const text = [e.title, e.prompt, e.response, ...(e.tags || []), ...(e.turns || []).map(t => t.text)].join(' ').toLowerCase();
          if (!text.includes(needle)) return false;
        }
        return true;
      } else {
        const d = item.data;
        if (tag) return false;
        if (needle) {
          const text = [d.title, d.dilemma, d.commitment?.option, d.commitment?.experiment, d.commitment?.reasoning, ...d.reviews.map(r => `${r.outcome} ${r.lesson}`)].filter(Boolean).join(' ').toLowerCase();
          if (!text.includes(needle)) return false;
        }
        return true;
      }
    });
  }, [items, search, tag, date]);

  function toggleVoice() {
    if (listening) { voice.current?.stop(); return; }
    const browser = window as typeof window & { SpeechRecognition?: new () => VoiceRecognition; webkitSpeechRecognition?: new () => VoiceRecognition };
    const Voice = browser.SpeechRecognition || browser.webkitSpeechRecognition;
    if (!Voice) { setError('Voice dictation is not supported by this browser. You can continue typing your entry.'); return; }
    const recognition = new Voice(), original = entry.trim(); let finalText = '';
    recognition.continuous = true; recognition.interimResults = true; recognition.lang = navigator.language || 'en-US';
    recognition.onresult = event => { let interim = ''; for (let index = event.resultIndex; index < event.results.length; index++) { const result = event.results[index]; if (result.isFinal) finalText += `${result[0].transcript.trim()} `; else interim += result[0].transcript; } setEntry([original, finalText.trim(), interim.trim()].filter(Boolean).join(' ')); };
    recognition.onerror = event => { setError(event.error === 'not-allowed' ? 'Microphone access was not allowed. Enable it in your browser settings or continue typing.' : 'Voice dictation stopped unexpectedly. Your transcribed text is still here.'); setListening(false); };
    recognition.onend = () => setListening(false);
    voice.current = recognition; setError(''); setListening(true);
    try { recognition.start(); } catch { setListening(false); setError('Voice dictation could not start. Check your browser microphone settings or continue typing.'); }
  }
  async function submit() {
    if (busy || !title.trim() || !entry.trim()) return;
    const parsedTags = tags.split(',').map(value => value.trim()).filter(Boolean);
    if (parsedTags.length > 8) { setError('Add at most 8 comma-separated tags.'); return; }
    setBusy('new'); setError('');
    try {
      const saved = await request<JournalInteraction>(uid, '/api/journal', { id: crypto.randomUUID(), title, entry, mode, tags: parsedTags });
      onSaved(saved);
      void syncJournalToFirestore(uid, saved);
      setTitle(''); setEntry(''); setTags('');
    }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save this journal entry.'); } finally { setBusy(''); }
  }
  async function continueEntry(item: JournalInteraction) {
    if (busy || !followUp.trim()) return; setBusy(item.id); setError('');
    try {
      const saved = await request<JournalInteraction>(uid, '/api/journal', { id: item.id, message: followUp });
      onSaved(saved);
      void syncJournalToFirestore(uid, saved);
      setFollowUp(''); setActiveId('');
    }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not continue this reflection.'); } finally { setBusy(''); }
  }
  async function deleteEntry(item: JournalInteraction) {
    if (!window.confirm(`Permanently delete “${item.title}”? This cannot be undone.`)) return; setBusy(item.id); setError('');
    try {
      await request(uid, `/api/journal/${item.id}`, undefined, undefined, 'DELETE');
      onDeleted(item.id);
      void deleteJournalFromFirestore(uid, item.id);
    }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not delete this journal entry.'); } finally { setBusy(''); }
  }
  async function saveTags(item: JournalInteraction) {
    const parsed = editTags.split(',').map(value => value.trim()).filter(Boolean);
    if (parsed.length > 8) { setError('Add at most 8 comma-separated tags.'); return; }
    setBusy(item.id); setError('');
    try {
      const saved = await request<JournalInteraction>(uid, `/api/journal/${item.id}/tags`, { tags: parsed }, undefined, 'PUT');
      onSaved(saved);
      void syncJournalToFirestore(uid, saved);
      setTagEditorId(''); setEditTags('');
    }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not update these tags.'); } finally { setBusy(''); }
  }
  async function exportAccount(format: 'markdown' | 'json') {
    setBusy('export'); setError('');
    try {
      let data: ExportData;
      try {
        data = await request<ExportData>(uid, '/api/export', undefined, undefined, 'GET');
      } catch {
        data = { exportedAt: new Date().toISOString(), journal: entries, decisions, insights: null };
      }
      if (!data.journal.length && entries.length) data.journal = entries;
      if (!data.decisions.length && decisions.length) data.decisions = decisions;
      download(format === 'markdown' ? 'foresight-journal.md' : 'foresight-data.json', format === 'markdown' ? 'text/markdown' : 'application/json', format === 'markdown' ? journalMarkdown(data) : JSON.stringify(data, null, 2));
    }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not prepare your export.'); } finally { setBusy(''); }
  }
  async function deleteAll() {
    if (deleteConfirmText.trim() !== 'DELETE') return;
    setBusy('delete-all');
    setError('');
    try {
      await request(uid, '/api/account-data', undefined, undefined, 'DELETE');
      for (const e of entries) { void deleteJournalFromFirestore(uid, e.id); }
      for (const d of decisions) { void deleteDecisionFromFirestore(uid, d.id); }
      setShowDeleteModal(false);
      setDeleteConfirmText('');
      setDeleteSuccess(true);
      onDeleteAll();
    }
    catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete your stored data.');
    } finally {
      setBusy('');
    }
  }

  const totalCount = entries.length + decisions.length;

  return <>
    <div className="page-heading journal-heading"><div><p className="eyebrow">Notice before you decide</p><h1>Your journal.</h1><p className="muted">Write what is happening in your own words. Gemini can reflect it back, and you decide what is worth carrying forward.</p></div><Feather size={42} strokeWidth={1} aria-hidden="true" /></div>
    <section className="journal-composer" aria-labelledby="journal-prompt"><div className="journal-margin" aria-hidden="true"><span>{new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span></div><div className="journal-page">
      <p className="eyebrow">A new page</p><h2 id="journal-prompt">What deserves your attention today?</h2>
      <label>Give this page a title<input maxLength={150} value={title} onChange={event => setTitle(event.target.value)} placeholder="The conversation I keep replaying" disabled={!!busy} /></label>
      <label>Write freely<div className="voice-field"><textarea rows={7} maxLength={6000} value={entry} onChange={event => setEntry(event.target.value)} placeholder="Start with what happened, what you noticed, or what you cannot stop thinking about…" disabled={!!busy} /><button type="button" className={`voice-button ${listening ? 'listening' : ''}`} onClick={toggleVoice} disabled={!!busy} aria-pressed={listening}>{listening ? <MicOff size={16} /> : <Mic size={16} />}{listening ? 'Stop dictation' : 'Dictate'}</button></div></label>
      <label>Tags <span className="muted small">(comma-separated)</span><input maxLength={248} value={tags} onChange={event => setTags(event.target.value)} placeholder="career, confidence, study" disabled={!!busy} /></label>
      <div className="journal-actions"><label>How should Gemini help?<select value={mode} onChange={event => setMode(event.target.value as Exclude<ReflectionMode, 'chat'>)} disabled={!!busy}>{Object.entries(modeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button onClick={submit} disabled={!!busy || !title.trim() || !entry.trim()}><Sparkles size={16} />{busy === 'new' ? 'Reflecting…' : 'Save and reflect'}</button></div>
      <details className="gemini-context"><summary>What will Gemini receive?</summary><p>For a new page: its title, your journal text, and the reflection style. For a follow-up: that page, its first Gemini reflection, saved conversation turns, and your new message. Tags, other entries, decisions, account details, and microphone audio are not sent. Dictation is handled by your browser; only the editable transcript becomes journal text.</p></details>
    </div></section>
    {error && <p className="alert" role="alert">{error}</p>}
    <div className="journal-tools">
      <label className="journal-search"><span className="sr-only">Search journal</span><Search size={16} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search journal and decisions…" /></label>
      <div className="tag-filters">
        <button aria-pressed={typeFilter === 'all'} onClick={() => setTypeFilter('all')}>All ({totalCount})</button>
        <button aria-pressed={typeFilter === 'reflections'} onClick={() => setTypeFilter('reflections')}>Reflections ({entries.length})</button>
        <button aria-pressed={typeFilter === 'decisions'} onClick={() => setTypeFilter('decisions')}>Decisions ({decisions.length})</button>
        {allTags.map(value => <button key={value} aria-pressed={tag === value} onClick={() => setTag(tag === value ? '' : value)}>#{value}</button>)}
      </div>
    </div>
    <JournalCalendar entries={entries} decisions={decisions} selected={date} onSelect={setDate} />
    <div className="journal-history-heading">
      <div>
        <p className="eyebrow">Earlier journal & decisions</p>
        <h2>
          {date
            ? `Entries on ${new Date(date + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
            : search || tag
            ? `${filtered.length} matching ${filtered.length === 1 ? 'entry' : 'entries'}`
            : 'Your journal timeline'}
        </h2>
      </div>
      {date && <button className="text-button" onClick={() => setDate('')}>Clear calendar filter ({date})</button>}
      <span className="small muted">Private to your account</span>
    </div>
    {loading ? (
      <p role="status">Opening your journal…</p>
    ) : !filtered.length ? (
      <div className="empty-state">
        <Feather size={40} strokeWidth={1} />
        <h2>{totalCount ? 'No entries match this view.' : 'Your first page is blank.'}</h2>
        <p>{totalCount ? 'Try clearing search, tags, or calendar date.' : 'Write above or record a decision. Your words remain the record.'}</p>
        {date && <button className="secondary" onClick={() => setDate('')}>Show all entries</button>}
      </div>
    ) : (
      filtered.map(item => item.kind === 'reflection' ? (
        <article className="paper journal-entry" key={item.id}>
          <div className="journal-entry-meta"><div><span className="tag">{modeLabels[item.data.mode as Exclude<ReflectionMode, 'chat'>] || 'Earlier reflection'}</span>{item.data.tags?.map(value => <button className="entry-tag" key={value} onClick={() => setTag(value)}>#{value}</button>)}</div><time dateTime={item.data.createdAt}>{new Date(item.data.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</time></div>
          <h2>{item.data.title}</h2><p className="preserve journal-words">{item.data.prompt}</p><div className="ai-note"><span className="eyebrow">Gemini · a reflection</span><ReactMarkdown>{item.data.response}</ReactMarkdown></div>
          {item.data.turns?.map((turn, index) => <div className={`legacy-turn ${turn.role}`} key={`${turn.timestamp}-${index}`}><strong>{turn.role === 'user' ? 'You' : 'Gemini'}</strong><ReactMarkdown>{turn.text}</ReactMarkdown></div>)}
          {tagEditorId === item.id ? <div className="journal-tag-editor"><label>Edit tags <span className="muted small">(comma-separated)</span><input autoFocus maxLength={248} value={editTags} onChange={event => setEditTags(event.target.value)} /></label><div className="button-row"><button onClick={() => saveTags(item.data)} disabled={!!busy}><Tags size={15} />Save tags</button><button className="text-button" onClick={() => { setTagEditorId(''); setEditTags(''); }} disabled={!!busy}>Cancel</button></div></div> : activeId === item.id ? <div className="journal-follow-up"><label>Continue this reflection<textarea rows={3} maxLength={4000} autoFocus value={followUp} onChange={event => setFollowUp(event.target.value)} placeholder="What feels true, unclear, or different now?" disabled={!!busy} /></label><div className="button-row"><button onClick={() => continueEntry(item.data)} disabled={!!busy || !followUp.trim()}><MessageCircle size={15} />{busy === item.id ? 'Reflecting…' : 'Send to Gemini'}</button><button className="text-button" onClick={() => { setActiveId(''); setFollowUp(''); }} disabled={!!busy}>Cancel</button></div></div> : <div className="journal-entry-actions"><button className="secondary" onClick={() => { setActiveId(item.id); setFollowUp(''); }} disabled={!!busy}><MessageCircle size={15} />Continue reflecting</button><button className="text-button" onClick={() => { setTagEditorId(item.id); setEditTags((item.data.tags || []).join(', ')); }} disabled={!!busy}><Tags size={15} />Edit tags</button><button className="text-button" onClick={() => onStartDecision(item.data)} disabled={!!busy}><BookOpen size={15} />Turn this into a decision <ArrowRight size={15} /></button><button className="icon-button journal-delete" aria-label={`Delete ${item.data.title}`} title="Delete entry" onClick={() => deleteEntry(item.data)} disabled={!!busy}><Trash2 size={16} /></button></div>}
        </article>
      ) : (
        <article className="paper journal-entry journal-decision-entry" key={item.id}>
          <div className="journal-entry-meta">
            <div>
              <span className="tag">Decision · {stage(item.data)}</span>
              {item.data.sample && <span className="small muted">Fictional example</span>}
              {item.data.journalId && <span className="small muted">· Originated in a journal reflection</span>}
            </div>
            <time dateTime={item.date}>{new Date(item.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</time>
          </div>
          <h2>{item.data.title}</h2>
          <p className="preserve journal-words">{item.data.dilemma}</p>
          {item.data.commitment && (
            <div className="ai-note">
              <span className="eyebrow">Commitment · {item.data.commitment.option}</span>
              <p><strong>Reasoning:</strong> {item.data.commitment.reasoning}</p>
              <p><strong>Experiment:</strong> {item.data.commitment.experiment}</p>
            </div>
          )}
          {item.data.reviews.length > 0 && (
            <div className="legacy-turn model">
              <strong>Outcome ({item.data.reviews[item.data.reviews.length - 1].result}):</strong> {item.data.reviews[item.data.reviews.length - 1].outcome}
              <br />
              <span className="muted"><strong>Lesson:</strong> {item.data.reviews[item.data.reviews.length - 1].lesson}</span>
            </div>
          )}
          <div className="journal-entry-actions">
            <button className="secondary" onClick={() => onOpenDecision?.(item.data)}>
              <BookOpen size={15} />Open in decisions workspace <ArrowRight size={15} />
            </button>
          </div>
        </article>
      ))
    )}
    {canLoadOlder && <button className="secondary" onClick={onLoadOlder}>Load older entries</button>}
    <section className="paper privacy-panel">
      <div>
        <ShieldCheck size={22} />
        <div>
          <p className="eyebrow">Your data</p>
          <h2>Keep a copy—or clear the slate.</h2>
          <p>Exports come directly from your authenticated Firestore records. Deleting all stored data keeps your Firebase sign-in account so you can start again.</p>
          {deleteSuccess && <p className="success" role="status" style={{ marginTop: '12px' }}>All stored data was permanently deleted. Your account is fresh.</p>}
        </div>
      </div>
      <div className="privacy-actions">
        <button className="secondary" onClick={() => exportAccount('markdown')} disabled={!!busy}><Download size={15} />Export journal</button>
        <button className="secondary" onClick={() => exportAccount('json')} disabled={!!busy}><FileJson size={15} />Export all data</button>
        <button className="danger-button" onClick={() => { setShowDeleteModal(true); setDeleteConfirmText(''); setError(''); setDeleteSuccess(false); }} disabled={!!busy}><Trash2 size={15} />Delete all stored data</button>
      </div>
    </section>

    {showDeleteModal && (
      <div
        className="modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-all-title"
        onClick={e => {
          if (e.target === e.currentTarget && busy !== 'delete-all') {
            setShowDeleteModal(false);
            setDeleteConfirmText('');
          }
        }}
      >
        <div className="modal-card">
          <div className="modal-header">
            <AlertTriangle size={24} className="danger-icon" />
            <h3 id="delete-all-title">Delete all stored data?</h3>
          </div>
          <p className="modal-description">
            This will permanently remove every journal entry, decision, review, pattern, and usage record for your account. Your Firebase sign-in account will remain so you can start fresh.
          </p>
          <div className="modal-input-group">
            <label htmlFor="delete-confirm-input">
              To confirm, type <strong>DELETE</strong> below:
            </label>
            <input
              id="delete-confirm-input"
              type="text"
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              disabled={busy === 'delete-all'}
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter' && deleteConfirmText.trim() === 'DELETE' && busy !== 'delete-all') {
                  void deleteAll();
                } else if (e.key === 'Escape' && busy !== 'delete-all') {
                  setShowDeleteModal(false);
                  setDeleteConfirmText('');
                }
              }}
            />
          </div>
          {error && <p className="alert" role="alert">{error}</p>}
          <div className="modal-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setShowDeleteModal(false);
                setDeleteConfirmText('');
              }}
              disabled={busy === 'delete-all'}
            >
              Cancel
            </button>
            <button
              type="button"
              className="danger-button confirm-delete-button"
              onClick={deleteAll}
              disabled={deleteConfirmText.trim() !== 'DELETE' || busy === 'delete-all'}
            >
              <Trash2 size={15} />
              {busy === 'delete-all' ? 'Deleting stored data…' : 'Delete all stored data'}
            </button>
          </div>
        </div>
      </div>
    )}
  </>;
}
