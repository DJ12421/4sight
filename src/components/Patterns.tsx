import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Sparkles } from 'lucide-react';
import { Decision, PatternReport, sourceVersions } from '../domain';
import { request } from '../lib/workspace';
import { SourcePicker } from './SourcePicker';

export function PatternCards({ report, decisions, onOpen }: { report: PatternReport; decisions: Decision[]; onOpen: (d: Decision) => void }) {
  const stale = report.sources.some(s => !decisions.some(d => d.id === s.id && d.revision === s.revision));
  if (stale) return <div className="empty-state"><h3>Your evidence has changed.</h3><p>Generate a fresh reflection to include current reviews. The previous interpretation is hidden because its sources changed or were deleted.</p></div>;
  return <div className="pattern-list">{report.insights.length === 0 ? <div className="empty-state"><h3>No supported pattern yet.</h3><p>These entries don’t support a recurring observation. Keep recording outcomes; there is no need to force a pattern.</p></div> : report.insights.map((insight, index) => <article className="paper insight" key={index}>
    <p className="eyebrow">A possible pattern · AI interpretation</p><h2>{insight.observation}</h2>
    <div className="evidence-block"><span className="eyebrow">Gemini’s reading of the evidence</span><p>{insight.evidence}</p><div className="source-links">{insight.sourceIds.map(id => { const source = decisions.find(d => d.id === id); const outcome = source?.reviews.at(-1)?.outcome || ''; return source ? <div className="source-evidence" key={id}><button className="source-link" onClick={() => onOpen(source)}>{source.title}<ArrowUpRight size={15} /></button><p><strong>{source.sample ? 'The fictional student recorded' : 'You recorded'}:</strong> “{outcome.slice(0, 280)}{outcome.length > 280 ? '…' : ''}”</p></div> : null; })}</div></div>
    <p className="reflection-question">{insight.question}</p>
  </article>)}<p className="small muted">{report.model} · {new Date(report.createdAt).toLocaleDateString()} · Patterns are hypotheses to examine, not personality assessments or predictions.</p></div>;
}
export function Patterns({ uid, decisions, report, onReport, onOpen }: { uid: string; decisions: Decision[]; report: PatternReport | null; onReport: (r: PatternReport) => void; onOpen: (d: Decision) => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef(new AbortController());
  const working = useRef(false);
  useEffect(() => { controller.current = new AbortController(); return () => controller.current.abort(); }, []);
  async function reflect() {
    if (working.current) return;
    working.current = true; setBusy(true); setError('');
    try {
      const result = await request<PatternReport>(uid, '/api/ai', { action: 'patterns', sourceIds: selected, sourceVersions: sourceVersions(selected, decisions) }, controller.current.signal);
      if (!controller.current.signal.aborted) onReport(result);
    } catch (e) { if (!controller.current.signal.aborted) setError(e instanceof Error ? e.message : 'Could not analyze these entries.'); }
    finally { working.current = false; if (!controller.current.signal.aborted) setBusy(false); }
  }
  return <><div className="page-heading"><div><p className="eyebrow">Learn across decisions</p><h1>Experience, connected.</h1><p className="muted">Look for what repeats. Keep the evidence in view.</p></div></div>
    <section className="paper pattern-controls"><h2>Which experiences should we consider?</h2><p>Select at least two reviewed decisions. Fictional examples are analyzed separately from personal entries.</p><SourcePicker decisions={decisions} selected={selected} onChange={setSelected} disabled={busy} /><button disabled={busy || selected.length < 2} onClick={reflect}><Sparkles size={16} />{busy ? 'Reading your selected experience…' : 'Find possible patterns'}</button><p className="small muted">Only the selected past-entry previews are sent for this analysis.</p></section>
    {error && <p className="alert" role="alert">{error}</p>}
    {report ? <PatternCards report={report} decisions={decisions} onOpen={onOpen} /> : <div className="empty-state"><span className="loop-glyph" aria-hidden="true">↗</span><h2>Your history can become a head start.</h2><p>Record outcomes for two decisions, then ask what you might carry into the next one.</p></div>}
  </>;
}
