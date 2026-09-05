import { useState } from 'react';
import { Decision, evidenceRecord } from '../domain';

export function SourcePicker({ decisions, selected, onChange, disabled = false }: {
  decisions: Decision[]; selected: string[]; onChange: (ids: string[]) => void; disabled?: boolean;
}) {
  const [older, setOlder] = useState(false);
  const [search, setSearch] = useState('');
  const reviewed = decisions.filter(d => d.reviews.length > 0);
  const visible = (older || search ? reviewed : reviewed.slice(0, 20)).filter(d => d.title.toLowerCase().includes(search.toLowerCase()));
  return <details className="source-picker">
    <summary>Past experience <span>{selected.length ? `${selected.length} selected` : 'Nothing shared'}</span></summary>
    <p className="muted">Only checked entries are sent to Gemini. Up to 20, with the last three reviews per entry. The preview below shows the exact past-entry content shared.</p>
    {!reviewed.length && <p>Once you review a decision, you can bring that experience into the next one.</p>}
    {reviewed.length > 20 && <label>Find an older decision<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search reviewed decisions" /></label>}
    <div className="source-options">{visible.map(d => <label className="check-row" key={d.id}>
      <input type="checkbox" checked={selected.includes(d.id)} disabled={disabled || (!selected.includes(d.id) && selected.length >= 20)} onChange={e => onChange(e.target.checked ? [...selected, d.id] : selected.filter(id => id !== d.id))} />
      <span>{d.title}{d.sample && <small>Fictional example</small>}</span>
    </label>)}</div>
    {selected.filter(id => !reviewed.some(d => d.id === id)).map(id => <label className="check-row" key={id}><input type="checkbox" checked disabled={disabled} onChange={() => onChange(selected.filter(v => v !== id))} />Unavailable source — uncheck to remove</label>)}
    {!older && !search && reviewed.length > 20 && <button className="text-button" type="button" onClick={() => setOlder(true)}>Show older reviewed decisions</button>}
    {selected.length > 0 && <details className="context-preview"><summary>Preview what Gemini receives</summary>{selected.map(id => {
      const decision = reviewed.find(d => d.id === id);
      if (!decision) return null;
      const record = evidenceRecord(decision);
      return <article key={id}><h4>{record.title}</h4>{record.fictional && <span className="tag">Fictional example</span>}<dl><dt>Choice</dt><dd>{record.chosenOption}</dd><dt>Expected</dt><dd>{record.expectation}</dd><dt>Experiment</dt><dd>{record.experiment}</dd></dl>{record.reviews.map((r, i) => <div key={i}><p><strong>Recorded outcome ({r.result}):</strong> {r.outcome}</p><p><strong>Lesson:</strong> {r.lesson}</p></div>)}</article>;
    })}</details>}
  </details>;
}
