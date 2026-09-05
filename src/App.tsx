import { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, doc, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import ReactMarkdown from './components/Markdown';
import { ArrowRight, BookOpen, Compass, Layers, LogOut, Plus, Sparkles, Trash2 } from 'lucide-react';
import { auth, db, logOut, signInWithGoogle } from './lib/firebase';
import { request } from './lib/workspace';
import { Decision, PatternReport, localDate, newDecision, stage } from './domain';
import { JournalInteraction } from './types';
import { Welcome } from './components/Welcome';
import { SampleJourney } from './components/SampleJourney';
import { DecisionEditor } from './components/DecisionEditor';
import { Patterns } from './components/Patterns';

type WorkspaceView = 'decisions' | 'patterns' | 'legacy' | 'sample';
const viewPaths: Record<WorkspaceView, string> = { decisions: '/decisions', patterns: '/patterns', legacy: '/history', sample: '/sample' };
function viewFromPath(): WorkspaceView | null {
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  return (Object.entries(viewPaths).find(([, value]) => value === path)?.[0] as WorkspaceView | undefined) || null;
}
function updatePath(path: string, replace = false) {
  if (window.location.pathname === path) return;
  window.history[replace ? 'replaceState' : 'pushState']({}, '', path);
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sample, setSample] = useState(() => window.location.pathname === '/sample');
  useEffect(() => {
    const onPopState = () => setSample(window.location.pathname === '/sample');
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  useEffect(() => onAuthStateChanged(auth, current => { setUser(current); setLoading(false); setError(''); }, () => { setLoading(false); setError('Could not restore your session. Reload to try again.'); }), []);
  function showSample(next: boolean) { updatePath(next ? '/sample' : '/'); setSample(next); }
  async function signIn() {
    if (busy) return;
    setBusy(true); setError('');
    try { await signInWithGoogle(); }
    catch (e) {
      const code = (e as { code?: string }).code;
      setError(code === 'auth/popup-closed-by-user' ? 'Sign-in was closed. You can try again when ready.' : code === 'auth/popup-blocked' ? 'Allow the Google sign-in popup, then try again.' : 'Sign-in could not complete. Check your connection and try again.');
    } finally { setBusy(false); }
  }
  if (loading) return <div className="boot" role="status"><Compass size={32} /><p>Opening your journal…</p></div>;
  if (user) return <Workspace key={user.uid} user={user} showSample={sample} />;
  return <div className="app"><header className="public-header"><a className="brand" href="/" aria-label="Foresight home"><Compass size={25} />foresight<span className="brand-period">.</span></a><div className="public-actions"><button className="text-button" onClick={() => showSample(!sample)}>{sample ? 'Home' : 'See how it works'}</button><button className="secondary" onClick={signIn} disabled={busy}>Sign in <ArrowRight size={15} /></button></div></header>{sample ? <main className="content"><SampleJourney onBack={() => showSample(false)} onCopy={signIn} busy={busy} copyLabel="Sign in to copy this journey" /><p className="muted small">Sign in, then open the sample journey in your workspace to copy it.</p>{error && <p role="alert" className="alert">{error}</p>}</main> : <Welcome onSignIn={signIn} onSample={() => showSample(true)} busy={busy} error={error} />}<Footer /></div>;
}
function Workspace({ user, showSample }: { user: User; showSample: boolean }) {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [legacy, setLegacy] = useState<JournalInteraction[]>([]);
  const [report, setReport] = useState<PatternReport | null>(null);
  const [view, setView] = useState<WorkspaceView>(() => viewFromPath() || (showSample ? 'sample' : 'decisions'));
  const [editing, setEditing] = useState<Decision | null>(null);
  const [status, setStatus] = useState('Loading your journal…');
  const [loading, setLoading] = useState(true);
  const [legacyLoading, setLegacyLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(200);
  const [legacySize, setLegacySize] = useState(100);
  const dirty = useRef(false);
  const working = useRef(false);
  const controller = useRef(new AbortController());
  useEffect(() => { controller.current = new AbortController(); return () => controller.current.abort(); }, []);
  useEffect(() => {
    if (!viewFromPath()) updatePath(viewPaths[view], true);
    document.title = `${view === 'legacy' ? 'Earlier journal' : view[0].toUpperCase() + view.slice(1)} · Foresight`;
    const onPopState = () => {
      const next = viewFromPath() || 'decisions';
      if (!canLeave()) { updatePath(viewPaths[view], true); return; }
      dirty.current = false; setEditing(null); setView(next); setError('');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [view]);
  const onDirty = useCallback((value: boolean) => { dirty.current = value; }, []);
  useEffect(() => {
    let active = true;
    const unsubscribe = onSnapshot(query(collection(db, 'users', user.uid, 'decisions'), orderBy('updatedAt', 'desc'), limit(pageSize)), { includeMetadataChanges: true }, snapshot => {
      if (!active) return;
      setDecisions(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Decision)));
      setLoading(false); setStatus(snapshot.metadata.fromCache ? 'Waiting for connection' : 'Journal connected');
    }, () => { if (active) { setLoading(false); setStatus('Connection unavailable'); setError('Could not load your journal. Check your connection and deployed access rules, then reload.'); } });
    return () => { active = false; unsubscribe(); };
  }, [user.uid, pageSize]);
  useEffect(() => {
    let active = true;
    const unsubscribe = onSnapshot(doc(db, 'users', user.uid, 'insights', 'latest'), snapshot => { if (active) setReport(snapshot.exists() ? snapshot.data() as PatternReport : null); }, () => { if (active) setError('Could not load saved pattern reflections. Check your connection and reload.'); });
    return () => { active = false; unsubscribe(); };
  }, [user.uid]);
  useEffect(() => {
    if (view !== 'legacy') return;
    let active = true; setLegacyLoading(true);
    const unsubscribe = onSnapshot(query(collection(db, 'users', user.uid, 'interactions'), orderBy('createdAt', 'desc'), limit(legacySize)), snapshot => {
      if (active) { setLegacy(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as JournalInteraction))); setLegacyLoading(false); }
    }, () => { if (active) { setError('Could not load your earlier journal entries.'); setLegacyLoading(false); } });
    return () => { active = false; unsubscribe(); };
  }, [user.uid, view, legacySize]);
  function canLeave() { return !dirty.current || window.confirm('There is unsaved writing or a request in progress. Leave this page and discard the unsaved draft?'); }
  function navigate(next: WorkspaceView) { if (!canLeave()) return; dirty.current = false; setEditing(null); setView(next); setError(''); updatePath(viewPaths[next]); }
  function open(d: Decision) { if (!canLeave()) return; dirty.current = false; setEditing(d); setView('decisions'); setError(''); updatePath(viewPaths.decisions); window.scrollTo({ top: 0 }); }
  async function action(fn: () => Promise<void>) {
    if (working.current) return;
    working.current = true; setActionBusy(true); setError('');
    try { await fn(); } catch (e) { if (!controller.current.signal.aborted) setError(e instanceof Error ? e.message : 'Could not complete this action.'); }
    finally { working.current = false; if (!controller.current.signal.aborted) setActionBusy(false); }
  }
  const saved = useCallback((d: Decision) => setDecisions(current => [d, ...current.filter(item => item.id !== d.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))), []);
  const due = decisions.filter(d => d.commitment && !d.reviews.length && d.commitment.reviewDate <= localDate());
  const personal = decisions.filter(d => !d.sample);
  const filtered = decisions.filter(d => `${d.title} ${d.dilemma}`.toLowerCase().includes(search.toLowerCase()) && (filter === 'All' || filter === stage(d) || filter === 'Due for review' && due.includes(d)));
  return <div className="app workspace"><header className="workspace-header"><button className="brand" onClick={() => navigate('decisions')}><Compass size={25} />foresight<span className="brand-period">.</span></button><nav aria-label="Main navigation"><button aria-current={view === 'decisions' ? 'page' : undefined} onClick={() => navigate('decisions')}><BookOpen size={16} />Decisions</button><button aria-current={view === 'patterns' ? 'page' : undefined} onClick={() => navigate('patterns')}><Sparkles size={16} />Patterns</button><button aria-current={view === 'legacy' ? 'page' : undefined} onClick={() => navigate('legacy')}><Layers size={16} />Earlier journal</button></nav><div className="account"><span title={user.email || ''}>{user.displayName?.split(' ')[0] || 'Your journal'}</span><button className="icon-button" title="Sign out" aria-label="Sign out" disabled={actionBusy} onClick={() => { if (canLeave()) void action(async () => { updatePath('/'); await logOut(); }); }}><LogOut size={17} /></button></div></header>
    <main className="content" id="main-content">{error && <div className="alert" role="alert">{error}<button className="text-button" onClick={() => setError('')}>Dismiss</button></div>}
      {editing ? <DecisionEditor key={editing.id} initial={editing} decisions={decisions} uid={user.uid} onBack={() => navigate('decisions')} onDirty={onDirty} onSaved={saved} onStartNext={sourceIds => open({ ...newDecision(), sourceIds })} /> : view === 'patterns' ? <Patterns uid={user.uid} decisions={decisions} report={report} onReport={setReport} onOpen={open} /> : view === 'sample' ? <SampleJourney onBack={() => navigate('decisions')} busy={actionBusy} onCopy={() => action(async () => { await request(user.uid, '/api/sample', {}, controller.current.signal); if (!controller.current.signal.aborted) { navigate('decisions'); setFilter('All'); setSearch(''); } })} /> : view === 'legacy' ? <><div className="page-heading"><div><p className="eyebrow">Preserved from Gemini Reflections</p><h1>Your earlier journal.</h1><p className="muted">Your original entries and conversations, kept intact as a read-only archive.</p></div></div>{legacyLoading ? <p role="status">Loading earlier entries…</p> : !legacy.length ? <div className="empty-state"><h2>No earlier entries.</h2><p>Your new decision journal is ready whenever you are.</p></div> : legacy.map(entry => <article className="paper legacy-entry" key={entry.id}><p className="eyebrow">{entry.mode} · {new Date(entry.createdAt).toLocaleDateString()}</p><h2>{entry.title}</h2><p className="preserve">{entry.prompt}</p><div className="ai-note"><ReactMarkdown>{entry.response}</ReactMarkdown></div>{entry.turns?.map((turn, i) => <div className="legacy-turn" key={i}><strong>{turn.role === 'user' ? 'You' : 'Gemini'}</strong><ReactMarkdown>{turn.text}</ReactMarkdown></div>)}</article>)}{legacy.length >= legacySize && <button className="secondary" onClick={() => setLegacySize(size => size + 100)}>Load older entries</button>}</> : <>
      <div className="page-heading dashboard-heading"><div><p className="eyebrow">Your next chapter starts with a choice</p><h1>Decisions in motion.</h1><p className="muted">A place to think clearly, try things, and learn what works for you.</p></div><button onClick={() => open(newDecision())}><Plus size={18} />New decision</button></div>
      <div className="dashboard-summary"><div><span className="summary-number">{String(personal.filter(d => !d.commitment).length).padStart(2, '0')}</span><span>Taking shape</span></div><div><span className="summary-number">{String(personal.filter(d => d.commitment && !d.reviews.length).length).padStart(2, '0')}</span><span>Experiments in progress</span></div><div><span className="summary-number">{String(personal.filter(d => d.reviews.length).length).padStart(2, '0')}</span><span>Experiences to learn from</span></div><p className="small muted">{status}<br />Fictional examples excluded from counts</p></div>
      {due.length > 0 && <section className="due-banner"><div><p className="eyebrow">Time to close the loop</p><h2>{due.length === 1 ? 'One decision is ready for a look back.' : `${due.length} decisions are ready for a look back.`}</h2><p>What changed? What surprised you? Your original expectations are waiting.</p></div><button className="secondary" onClick={() => open(due[0])}>Review an outcome <ArrowRight size={16} /></button></section>}
      <div className="list-toolbar"><div className="filters" aria-label="Filter decisions">{['All', 'Clarify', 'Experiment', 'Reviewed', 'Due for review'].map(f => <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f}</button>)}</div><label className="search"><span className="sr-only">Search decisions</span><input placeholder="Find a decision…" value={search} onChange={e => setSearch(e.target.value)} /></label></div>
      {loading ? <div className="empty-state" role="status">Opening your decisions…</div> : !filtered.length ? <div className="empty-state"><Compass size={40} strokeWidth={1} /><h2>{decisions.length ? 'No decisions match this view.' : 'What’s on your mind?'}</h2><p>{decisions.length ? 'Try another filter or search.' : 'A project to choose. A skill to learn. A first step you haven’t taken yet.'}</p>{!decisions.length && <button onClick={() => open(newDecision())}>Write your first decision <ArrowRight size={16} /></button>}</div> : <div className="decision-list">{filtered.map(d => <article className="decision-row" key={d.id}><button className="decision-main" onClick={() => open(d)}><div className="decision-row-top"><span className={`tag ${due.includes(d) ? 'due-tag' : ''}`}>{due.includes(d) ? 'Due for review' : stage(d)}</span>{d.sample && <span className="small muted">Fictional example</span>}<span className="decision-date">{new Date(d.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span></div><h2>{d.title}</h2><p>{d.commitment?.experiment || d.dilemma}</p><span className="row-action">{d.reviews.length ? 'Revisit what you learned' : d.commitment ? 'Record what happened' : 'Continue thinking'} <ArrowRight size={16} /></span></button><button className="icon-button delete-button" disabled={actionBusy} aria-label={`Delete ${d.title}`} onClick={() => { if (window.confirm(`Permanently delete “${d.title}” and its reviews? This cannot be undone.`)) void action(async () => { await request(user.uid, `/api/decisions/${d.id}?revision=${d.revision}`, undefined, controller.current.signal, 'DELETE'); if (!controller.current.signal.aborted) setDecisions(current => current.filter(item => item.id !== d.id)); }); }}><Trash2 size={16} /></button></article>)}</div>}
      {decisions.length >= pageSize && <button className="secondary" onClick={() => setPageSize(size => size + 200)}>Load older decisions</button>}
      <section className="sample-invitation"><div><p className="eyebrow">See the whole journey</p><h3>From a campus project to a first interview.</h3><p>Follow a fictional student through two decisions and the lesson connecting them.</p></div><button className="text-button" onClick={() => navigate('sample')}>Explore the example <ArrowRight size={16} /></button></section>
    </>}
    </main><Footer /></div>;
}
function Footer() { return <footer className="footer"><span>Foresight · Think. Try. Learn.</span><span>A private journal, with a little help from Gemini.</span></footer>; }
