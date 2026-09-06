import { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, doc, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { ArrowRight, BookOpen, Compass, Feather, House, LogOut, Moon, Network, Plus, Sparkles, Sun, Trash2 } from 'lucide-react';
import { auth, db, logOut, signInWithGoogle } from './lib/firebase';
import { request } from './lib/workspace';
import { Decision, PatternReport, localDate, newDecision, stage } from './domain';
import { JournalInteraction } from './types';
import { Welcome } from './components/Welcome';
import { SampleJourney } from './components/SampleJourney';
import { DecisionEditor } from './components/DecisionEditor';
import { Patterns } from './components/Patterns';
import { ConfidenceCalibration } from './components/ConfidenceCalibration';
import { Journal } from './components/Journal';
import { GraphView } from './components/GraphView';
import { Home } from './components/Home';

type WorkspaceView = 'home' | 'decisions' | 'patterns' | 'legacy' | 'graph' | 'sample';
type Theme = 'light' | 'dark';
const viewPaths: Record<WorkspaceView, string> = { home: '/', decisions: '/decisions', patterns: '/patterns', legacy: '/journal', graph: '/graph', sample: '/sample' };
function viewFromPath(): WorkspaceView | null {
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  if (path === '/history') return 'legacy';
  return (Object.entries(viewPaths).find(([, value]) => value === path)?.[0] as WorkspaceView | undefined) || null;
}
function updatePath(path: string, replace = false) {
  if (window.location.pathname === path) return;
  window.history[replace ? 'replaceState' : 'pushState']({}, '', path);
}
function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem('foresight-theme');
    return saved === 'light' || saved === 'dark' ? saved : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch { return 'light'; }
}
function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  const next = theme === 'dark' ? 'light' : 'dark';
  return <button className="icon-button theme-toggle" title={`Use ${next} theme`} aria-label={`Use ${next} theme`} onClick={onToggle}>{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button>;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sample, setSample] = useState(() => window.location.pathname === '/sample');
  const [theme, setTheme] = useState<Theme>(initialTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try { localStorage.setItem('foresight-theme', theme); } catch { /* Preference persistence may be unavailable. */ }
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#101923' : '#34674f');
  }, [theme]);
  const toggleTheme = () => setTheme(current => current === 'dark' ? 'light' : 'dark');
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
  if (user) return <Workspace key={user.uid} user={user} showSample={sample} theme={theme} onToggleTheme={toggleTheme} />;
  return <div className="app"><header className="public-header"><a className="brand" href="/" aria-label="Foresight home"><Compass size={25} />foresight<span className="brand-period">.</span></a><div className="public-actions"><button className="text-button" onClick={() => showSample(!sample)}>{sample ? 'Home' : 'See how it works'}</button><ThemeToggle theme={theme} onToggle={toggleTheme} /><button className="secondary" onClick={signIn} disabled={busy}>Sign in <ArrowRight size={15} /></button></div></header>{sample ? <main className="content"><SampleJourney onBack={() => showSample(false)} onCopy={signIn} busy={busy} copyLabel="Sign in to copy this journey" /><p className="muted small">Sign in, then open the sample journey in your workspace to copy it.</p>{error && <p role="alert" className="alert">{error}</p>}</main> : <Welcome onSignIn={signIn} onSample={() => showSample(true)} busy={busy} error={error} />}<Footer /></div>;
}
function Workspace({ user, showSample, theme, onToggleTheme }: { user: User; showSample: boolean; theme: Theme; onToggleTheme: () => void }) {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [legacy, setLegacy] = useState<JournalInteraction[]>([]);
  const [report, setReport] = useState<PatternReport | null>(null);
  const [view, setView] = useState<WorkspaceView>(() => viewFromPath() || (showSample ? 'sample' : 'home'));
  const [editing, setEditing] = useState<Decision | null>(null);
  const [status, setStatus] = useState('Loading your journal…');
  const [loading, setLoading] = useState(true);
  const [legacyLoading, setLegacyLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<Decision | null>(null);
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(200);
  const [legacySize, setLegacySize] = useState(100);
  const dirty = useRef(false);
  const working = useRef(false);
  const controller = useRef(new AbortController());
  useEffect(() => { controller.current = new AbortController(); return () => controller.current.abort(); }, []);
  useEffect(() => {
    if (!deleteCandidate) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape' && !actionBusy) setDeleteCandidate(null); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [deleteCandidate, actionBusy]);
  useEffect(() => {
    if (!viewFromPath()) updatePath(viewPaths[view], true);
    document.title = `${view === 'legacy' ? 'Journal' : view[0].toUpperCase() + view.slice(1)} · Foresight`;
    const onPopState = () => {
      const next = viewFromPath() || 'home';
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
    if (view !== 'home' && view !== 'legacy' && view !== 'graph') return;
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
  function deleteDecision(decision: Decision) {
    void action(async () => {
      const revision = Number.isInteger(decision.revision) ? decision.revision : 0;
      await request(user.uid, `/api/decisions/${encodeURIComponent(decision.id)}?revision=${revision}`, undefined, controller.current.signal, 'DELETE');
      if (!controller.current.signal.aborted) {
        setDecisions(current => current.filter(item => item.id !== decision.id));
        setDeleteCandidate(null);
      }
    });
  }
  const saved = useCallback((d: Decision) => setDecisions(current => [d, ...current.filter(item => item.id !== d.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))), []);
  const due = decisions.filter(d => d.commitment && !d.reviews.length && d.commitment.reviewDate <= localDate());
  const personal = decisions.filter(d => !d.sample);
  const filtered = decisions.filter(d => `${d.title} ${d.dilemma}`.toLowerCase().includes(search.toLowerCase()) && (filter === 'All' || filter === stage(d) || filter === 'Due for review' && due.includes(d)));
  return <div className="app workspace"><header className="workspace-header"><button className="brand" onClick={() => navigate('home')}><Compass size={25} />foresight<span className="brand-period">.</span></button><nav aria-label="Main navigation"><button aria-current={view === 'home' ? 'page' : undefined} onClick={() => navigate('home')}><House size={16} />Home</button><button aria-current={view === 'decisions' ? 'page' : undefined} onClick={() => navigate('decisions')}><BookOpen size={16} />Decisions</button><button aria-current={view === 'legacy' ? 'page' : undefined} onClick={() => navigate('legacy')}><Feather size={16} />Journal</button><button aria-current={view === 'graph' ? 'page' : undefined} onClick={() => navigate('graph')}><Network size={16} />Graph</button><button aria-current={view === 'patterns' ? 'page' : undefined} onClick={() => navigate('patterns')}><Sparkles size={16} />Patterns</button></nav><div className="account"><span title={user.email || ''}>{user.displayName?.split(' ')[0] || 'Your journal'}</span><ThemeToggle theme={theme} onToggle={onToggleTheme} /><button className="icon-button" title="Sign out" aria-label="Sign out" disabled={actionBusy} onClick={() => { if (canLeave()) void action(async () => { updatePath('/'); await logOut(); }); }}><LogOut size={17} /></button></div></header>
    <main className="content" id="main-content">{error && <div className="alert" role="alert">{error}<button className="text-button" onClick={() => setError('')}>Dismiss</button></div>}
      {editing ? <DecisionEditor key={editing.id} initial={editing} decisions={decisions} uid={user.uid} onBack={() => navigate('decisions')} onDirty={onDirty} onSaved={saved} onStartNext={sourceIds => open({ ...newDecision(), sourceIds })} /> : view === 'home' ? <Home name={user.displayName?.split(' ')[0] || 'there'} entries={legacy} decisions={decisions} report={report} loading={loading || legacyLoading} onJournal={() => navigate('legacy')} onDecision={() => open(newDecision())} onGraph={() => navigate('graph')} onPatterns={() => navigate('patterns')} /> : view === 'patterns' ? <Patterns uid={user.uid} decisions={decisions} report={report} onReport={setReport} onOpen={open} /> : view === 'graph' ? <GraphView entries={legacy} decisions={decisions} report={report} loading={loading || legacyLoading} onOpenDecision={open} onOpenJournal={() => navigate('legacy')} /> : view === 'sample' ? <SampleJourney onBack={() => navigate('decisions')} busy={actionBusy} onCopy={() => action(async () => { await request(user.uid, '/api/sample', {}, controller.current.signal); if (!controller.current.signal.aborted) { navigate('decisions'); setFilter('All'); setSearch(''); } })} /> : view === 'legacy' ? <Journal uid={user.uid} entries={legacy} decisions={decisions} loading={legacyLoading} canLoadOlder={legacy.length >= legacySize} onDirty={onDirty} onSaved={entry => setLegacy(current => [entry, ...current.filter(item => item.id !== entry.id)].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))} onDeleted={id => setLegacy(current => current.filter(item => item.id !== id))} onDeleteAll={() => { setLegacy([]); setDecisions([]); setReport(null); }} onStartDecision={entry => open({ ...newDecision(), title: entry.title, dilemma: entry.prompt, journalId: entry.id })} onLoadOlder={() => setLegacySize(size => size + 100)} /> : <>
      <div className="page-heading dashboard-heading"><div><p className="eyebrow">Your next chapter starts with a choice</p><h1>Decisions in motion.</h1><p className="muted">A place to think clearly, try things, and learn what works for you.</p></div><button onClick={() => open(newDecision())}><Plus size={18} />New decision</button></div>
      <div className="dashboard-summary"><div><span className="summary-number">{personal.filter(d => !d.commitment).length}</span><span>Taking shape</span></div><div><span className="summary-number">{personal.filter(d => d.commitment && !d.reviews.length).length}</span><span>Experiments in progress</span></div><div><span className="summary-number">{personal.filter(d => d.reviews.length).length}</span><span>Experiences to learn from</span></div><p className="small muted">{status}<br />Fictional examples excluded from counts</p></div>
      <ConfidenceCalibration decisions={decisions} onOpen={open} />
      {due.length > 0 && <section className="due-banner"><div><p className="eyebrow">Time to close the loop</p><h2>{due.length === 1 ? 'One decision is ready for a look back.' : `${due.length} decisions are ready for a look back.`}</h2><p>What changed? What surprised you? Your original expectations are waiting.</p></div><button className="secondary" onClick={() => open(due[0])}>Review an outcome <ArrowRight size={16} /></button></section>}
      <div className="list-toolbar"><div className="filters" aria-label="Filter decisions">{['All', 'Clarify', 'Experiment', 'Reviewed', 'Due for review'].map(f => <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f}</button>)}</div><label className="search"><span className="sr-only">Search decisions</span><input placeholder="Find a decision…" value={search} onChange={e => setSearch(e.target.value)} /></label></div>
      {loading ? <div className="empty-state" role="status">Opening your decisions…</div> : !filtered.length ? <div className="empty-state"><Compass size={40} strokeWidth={1} /><h2>{decisions.length ? 'No decisions match this view.' : 'What’s on your mind?'}</h2><p>{decisions.length ? 'Try another filter or search.' : 'A project to choose. A skill to learn. A first step you haven’t taken yet.'}</p>{!decisions.length && <button onClick={() => open(newDecision())}>Write your first decision <ArrowRight size={16} /></button>}</div> : <div className="decision-list">{filtered.map(d => <article className="decision-row" key={d.id}><button className="decision-main" onClick={() => open(d)}><div className="decision-row-top"><span className={`tag ${due.includes(d) ? 'due-tag' : ''}`}>{due.includes(d) ? 'Due for review' : stage(d)}</span>{d.sample && <span className="small muted">Fictional example</span>}<span className="decision-date">{new Date(d.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span></div><h2>{d.title}</h2><p>{d.commitment?.experiment || d.dilemma}</p><span className="row-action">{d.reviews.length ? 'Revisit what you learned' : d.commitment ? 'Record what happened' : 'Continue thinking'} <ArrowRight size={16} /></span></button><button type="button" className="icon-button delete-button" disabled={actionBusy} aria-label={`Delete ${d.title}`} onClick={() => { setError(''); setDeleteCandidate(d); }}><Trash2 size={16} /></button></article>)}</div>}
      {decisions.length >= pageSize && <button className="secondary" onClick={() => setPageSize(size => size + 200)}>Load older decisions</button>}
      <section className="sample-invitation"><div><p className="eyebrow">See the whole journey</p><h3>From a campus project to a first interview.</h3><p>Follow a fictional student through two decisions and the lesson connecting them.</p></div><button className="text-button" onClick={() => navigate('sample')}>Explore the example <ArrowRight size={16} /></button></section>
    </>}
    </main>{deleteCandidate && <div className="dialog-backdrop"><section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-decision-title" aria-describedby="delete-decision-description"><span className="dialog-icon"><Trash2 size={19} /></span><p className="eyebrow">Permanent deletion</p><h2 id="delete-decision-title">Delete “{deleteCandidate.title}”?</h2><p id="delete-decision-description">Its brief, commitment, conversation, and outcome reviews will be permanently removed. This cannot be undone.</p>{error && <p className="dialog-error" role="alert">{error}</p>}<div className="dialog-actions"><button className="secondary" autoFocus disabled={actionBusy} onClick={() => setDeleteCandidate(null)}>Keep decision</button><button className="danger-confirm" disabled={actionBusy} onClick={() => deleteDecision(deleteCandidate)}>{actionBusy ? 'Deleting…' : 'Delete decision'}</button></div></section></div>}<Footer /></div>;
}
function Footer() { return <footer className="footer"><span>Foresight · Think. Try. Learn.</span><span>A private journal, with a little help from Gemini.</span></footer>; }
