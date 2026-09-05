import { useMemo, useRef, useState } from 'react';
import { BookOpen, Feather, Focus, Minus, Network, Plus, Search, Sparkles, Tag } from 'lucide-react';
import { Decision, PatternReport } from '../domain';
import { JournalInteraction } from '../types';

export type GraphKind = 'journal' | 'decision' | 'tag' | 'pattern';
export type GraphNode = { id: string; kind: GraphKind; label: string; detail: string; sourceId?: string; x: number; y: number; radius: number };
export type GraphEdge = { source: string; target: string; kind: 'tag' | 'origin' | 'evidence' | 'pattern' };
export type GraphData = { nodes: GraphNode[]; edges: GraphEdge[]; truncated: boolean };

export function buildGraph(entries: JournalInteraction[], decisions: Decision[], report: PatternReport | null): GraphData {
  const journal = entries.slice(0, 80), choices = decisions.slice(0, 80);
  const tagCounts = new Map<string, number>();
  journal.forEach(item => (item.tags || []).forEach(tag => tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)));
  const tags = [...tagCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 60).map(([tag]) => tag);
  const rawNodes: Omit<GraphNode, 'x' | 'y' | 'radius'>[] = [
    ...journal.map(item => ({ id: `journal:${item.id}`, kind: 'journal' as const, label: item.title, detail: item.prompt, sourceId: item.id })),
    ...choices.map(item => ({ id: `decision:${item.id}`, kind: 'decision' as const, label: item.title, detail: item.commitment?.experiment || item.dilemma, sourceId: item.id })),
    ...tags.map(tag => ({ id: `tag:${tag}`, kind: 'tag' as const, label: `#${tag}`, detail: `${tagCounts.get(tag)} journal ${tagCounts.get(tag) === 1 ? 'page' : 'pages'}` })),
    ...(report?.insights || []).map((item, index) => ({ id: `pattern:${index}`, kind: 'pattern' as const, label: item.observation, detail: item.evidence })),
  ];
  const ids = new Set(rawNodes.map(node => node.id));
  const edges: GraphEdge[] = [];
  journal.forEach(item => (item.tags || []).forEach(tag => { if (ids.has(`tag:${tag}`)) edges.push({ source: `journal:${item.id}`, target: `tag:${tag}`, kind: 'tag' }); }));
  choices.forEach(item => {
    if (item.journalId && ids.has(`journal:${item.journalId}`)) edges.push({ source: `journal:${item.journalId}`, target: `decision:${item.id}`, kind: 'origin' });
    item.sourceIds.forEach(id => { if (ids.has(`decision:${id}`)) edges.push({ source: `decision:${id}`, target: `decision:${item.id}`, kind: 'evidence' }); });
  });
  (report?.insights || []).forEach((item, index) => item.sourceIds.forEach(id => { if (ids.has(`decision:${id}`)) edges.push({ source: `decision:${id}`, target: `pattern:${index}`, kind: 'pattern' }); }));
  const degree = new Map<string, number>(); edges.forEach(edge => { degree.set(edge.source, (degree.get(edge.source) || 0) + 1); degree.set(edge.target, (degree.get(edge.target) || 0) + 1); });
  const nodes: GraphNode[] = rawNodes.map((node, index) => { const angle = index * 2.399963, distance = 32 * Math.sqrt(index + 1); return { ...node, x: 500 + Math.cos(angle) * distance, y: 310 + Math.sin(angle) * distance, radius: Math.min(24, 8 + Math.sqrt(degree.get(node.id) || 0) * 3) }; });
  const byId = new Map(nodes.map(node => [node.id, node]));
  for (let step = 0; step < 150; step++) {
    const velocity = new Map(nodes.map(node => [node.id, { x: (500 - node.x) * .0018, y: (310 - node.y) * .0018 }]));
    for (let a = 0; a < nodes.length; a++) for (let b = a + 1; b < nodes.length; b++) {
      const left = nodes[a], right = nodes[b], dx = left.x - right.x, dy = left.y - right.y, distanceSquared = Math.max(100, dx * dx + dy * dy), force = 950 / distanceSquared;
      velocity.get(left.id)!.x += dx * force; velocity.get(left.id)!.y += dy * force; velocity.get(right.id)!.x -= dx * force; velocity.get(right.id)!.y -= dy * force;
    }
    edges.forEach(edge => { const source = byId.get(edge.source), target = byId.get(edge.target); if (!source || !target) return; const dx = target.x - source.x, dy = target.y - source.y, distance = Math.max(1, Math.hypot(dx, dy)), force = (distance - 105) * .008; velocity.get(source.id)!.x += dx / distance * force; velocity.get(source.id)!.y += dy / distance * force; velocity.get(target.id)!.x -= dx / distance * force; velocity.get(target.id)!.y -= dy / distance * force; });
    nodes.forEach(node => { const movement = velocity.get(node.id)!; node.x = Math.max(34, Math.min(966, node.x + Math.max(-8, Math.min(8, movement.x)))); node.y = Math.max(34, Math.min(586, node.y + Math.max(-8, Math.min(8, movement.y)))); });
  }
  return { nodes, edges, truncated: entries.length > journal.length || decisions.length > choices.length || tagCounts.size > tags.length };
}

const kindLabel: Record<GraphKind, string> = { journal: 'Journal page', decision: 'Decision', tag: 'Tag', pattern: 'Gemini pattern' };
export function GraphView({ entries, decisions, report, loading, onOpenDecision, onOpenJournal }: { entries: JournalInteraction[]; decisions: Decision[]; report: PatternReport | null; loading: boolean; onOpenDecision: (decision: Decision) => void; onOpenJournal: () => void }) {
  const graph = useMemo(() => buildGraph(entries, decisions, report), [entries, decisions, report]);
  const [visible, setVisible] = useState<Record<GraphKind, boolean>>({ journal: true, decision: true, tag: true, pattern: true });
  const [query, setQuery] = useState(''), [selectedId, setSelectedId] = useState('');
  const [camera, setCamera] = useState({ x: 0, y: 0, scale: 1 });
  const pan = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
  const nodes = graph.nodes.filter(node => visible[node.kind]), nodeIds = new Set(nodes.map(node => node.id));
  const edges = graph.edges.filter(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target));
  const positions = new Map(nodes.map(node => [node.id, node]));
  const selected = nodes.find(node => node.id === selectedId) || null, needle = query.trim().toLowerCase();
  const related = new Set(selected ? edges.flatMap(edge => edge.source === selected.id ? [edge.target] : edge.target === selected.id ? [edge.source] : []) : []);
  function zoom(next: number) { const scale = Math.max(.55, Math.min(2.4, next)); setCamera(current => ({ scale, x: 500 - (500 - current.x) * scale / current.scale, y: 310 - (310 - current.y) * scale / current.scale })); }
  function inspect(node: GraphNode) { setSelectedId(node.id); }
  return <><div className="page-heading graph-heading"><div><p className="eyebrow">Follow the threads</p><h1>Your knowledge graph.</h1><p className="muted">See how journal pages, decisions, tags, and evidence connect. Every line represents something you explicitly linked.</p></div><Network size={42} strokeWidth={1} /></div>
    <section className="graph-shell">
      <div className="graph-toolbar"><label><span className="sr-only">Search graph</span><Search size={15} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a node" /></label><div className="graph-filters">{(Object.keys(visible) as GraphKind[]).map(kind => <button key={kind} className={`node-${kind}`} aria-pressed={visible[kind]} onClick={() => setVisible(current => ({ ...current, [kind]: !current[kind] }))}>{kindLabel[kind]}</button>)}</div><div className="graph-zoom"><button className="icon-button" aria-label="Zoom out" onClick={() => zoom(camera.scale - .2)}><Minus size={16} /></button><button className="icon-button" aria-label="Reset graph view" onClick={() => setCamera({ x: 0, y: 0, scale: 1 })}><Focus size={16} /></button><button className="icon-button" aria-label="Zoom in" onClick={() => zoom(camera.scale + .2)}><Plus size={16} /></button></div></div>
      {loading ? <div className="graph-empty" role="status">Mapping your journal…</div> : !nodes.length ? <div className="graph-empty"><Network size={38} /><h2>Your graph is waiting for its first thread.</h2><p>Add a journal page, tag it, or save a decision to begin.</p></div> : <div className="graph-stage">
        <svg viewBox="0 0 1000 620" role="application" aria-label="Interactive knowledge graph" onWheel={event => { event.preventDefault(); zoom(camera.scale + (event.deltaY < 0 ? .12 : -.12)); }} onPointerMove={event => { if (!pan.current) return; const rect = event.currentTarget.getBoundingClientRect(); setCamera(current => ({ ...current, x: pan.current!.x + (event.clientX - pan.current!.startX) * 1000 / rect.width, y: pan.current!.y + (event.clientY - pan.current!.startY) * 620 / rect.height })); }} onPointerUp={event => { if (!pan.current) return; pan.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => { pan.current = null; }}>
          <rect className="graph-background" width="1000" height="620" onPointerDown={event => { pan.current = { x: camera.x, y: camera.y, startX: event.clientX, startY: event.clientY }; event.currentTarget.parentElement?.setPointerCapture(event.pointerId); }} />
          <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.scale})`}>
            {edges.map((edge, index) => { const source = positions.get(edge.source)!, target = positions.get(edge.target)!, active = selected && (edge.source === selected.id || edge.target === selected.id); return <line key={`${edge.source}-${edge.target}-${index}`} className={active ? 'active' : ''} x1={source.x} y1={source.y} x2={target.x} y2={target.y} />; })}
            {nodes.map(node => { const match = !needle || `${node.label} ${node.detail}`.toLowerCase().includes(needle), active = selected?.id === node.id, dim = (!!needle && !match) || (!!selected && !active && !related.has(node.id)); return <g key={node.id} className={`graph-node node-${node.kind} ${active ? 'active' : ''} ${dim ? 'dim' : ''}`} transform={`translate(${node.x} ${node.y})`} role="button" tabIndex={0} aria-label={`${kindLabel[node.kind]}: ${node.label}`} onClick={() => inspect(node)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); inspect(node); } }}><circle r={node.radius} /><text x={node.radius + 7} y="4">{node.label.length > 28 ? `${node.label.slice(0, 27)}…` : node.label}</text></g>; })}
          </g>
        </svg>
        {selected && <aside className="graph-inspector"><span className={`graph-kind node-${selected.kind}`}>{kindLabel[selected.kind]}</span><button className="icon-button" aria-label="Close node details" onClick={() => setSelectedId('')}>×</button><h2>{selected.label}</h2><p>{selected.detail.slice(0, 500)}{selected.detail.length > 500 ? '…' : ''}</p>{selected.kind === 'decision' && <button onClick={() => { const item = decisions.find(decision => decision.id === selected.sourceId); if (item) onOpenDecision(item); }}><BookOpen size={15} />Open decision</button>}{selected.kind === 'journal' && <button onClick={onOpenJournal}><Feather size={15} />Open journal</button>}{selected.kind === 'pattern' && <p className="small"><Sparkles size={13} />Generated from selected reviewed decisions</p>}{selected.kind === 'tag' && <p className="small"><Tag size={13} />Select a connected page to inspect it</p>}</aside>}
      </div>}
      <footer className="graph-legend"><span className="node-journal"><i />Journal</span><span className="node-decision"><i />Decision</span><span className="node-tag"><i />Tag</span><span className="node-pattern"><i />Gemini pattern</span><em>{nodes.length} nodes · {edges.length} links{graph.truncated ? ' · recent records shown' : ''}</em></footer>
    </section>
  </>;
}
