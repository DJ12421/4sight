import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Feather, Focus, Minus, Network, Plus, Search, Sparkles, Tag } from 'lucide-react';
import { Decision, PatternReport } from '../domain';
import { JournalInteraction } from '../types';

export type GraphKind = 'journal' | 'decision' | 'tag' | 'pattern';
export type GraphNode = { id: string; kind: GraphKind; label: string; detail: string; sourceId?: string; x: number; y: number; radius: number };
export type GraphEdge = { source: string; target: string; kind: 'tag' | 'origin' | 'evidence' | 'pattern' };
export type GraphData = { nodes: GraphNode[]; edges: GraphEdge[]; truncated: boolean };
type GraphVelocity = Map<string, { x: number; y: number }>;

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

export function advanceGraphLayout(nodes: GraphNode[], edges: GraphEdge[], velocities: GraphVelocity, pinnedId = '') {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const forces = new Map(nodes.map(node => {
    const velocity = velocities.get(node.id) || { x: 0, y: 0 };
    return [node.id, { x: velocity.x * .78 + (500 - node.x) * .0014, y: velocity.y * .78 + (310 - node.y) * .0014 }];
  }));
  for (let leftIndex = 0; leftIndex < nodes.length; leftIndex++) for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex++) {
    const left = nodes[leftIndex], right = nodes[rightIndex];
    const dx = left.x - right.x || .01, dy = left.y - right.y || .01;
    const force = 1050 / Math.max(144, dx * dx + dy * dy);
    forces.get(left.id)!.x += dx * force;
    forces.get(left.id)!.y += dy * force;
    forces.get(right.id)!.x -= dx * force;
    forces.get(right.id)!.y -= dy * force;
  }
  edges.forEach(edge => {
    const source = byId.get(edge.source), target = byId.get(edge.target);
    if (!source || !target) return;
    const dx = target.x - source.x, dy = target.y - source.y;
    const distance = Math.max(1, Math.hypot(dx, dy)), force = (distance - 110) * .006;
    forces.get(source.id)!.x += dx / distance * force;
    forces.get(source.id)!.y += dy / distance * force;
    forces.get(target.id)!.x -= dx / distance * force;
    forces.get(target.id)!.y -= dy / distance * force;
  });
  let movement = 0;
  nodes.forEach(node => {
    const force = node.id === pinnedId ? { x: 0, y: 0 } : forces.get(node.id)!;
    const stepX = clamp(force.x, -7, 7), stepY = clamp(force.y, -7, 7);
    node.x = clamp(node.x + stepX, 34, 966);
    node.y = clamp(node.y + stepY, 34, 586);
    velocities.set(node.id, { x: stepX, y: stepY });
    movement = Math.max(movement, Math.abs(stepX) + Math.abs(stepY));
  });
  return movement;
}

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
  const degree = new Map<string, number>();
  edges.forEach(edge => { degree.set(edge.source, (degree.get(edge.source) || 0) + 1); degree.set(edge.target, (degree.get(edge.target) || 0) + 1); });
  const nodes: GraphNode[] = rawNodes.map((node, index) => {
    const angle = index * 2.399963, distance = 32 * Math.sqrt(index + 1);
    return { ...node, x: clamp(500 + Math.cos(angle) * distance, 34, 966), y: clamp(310 + Math.sin(angle) * distance, 34, 586), radius: Math.min(24, 8 + Math.sqrt(degree.get(node.id) || 0) * 3) };
  });
  return { nodes, edges, truncated: entries.length > journal.length || decisions.length > choices.length || tagCounts.size > tags.length };
}

const kindLabel: Record<GraphKind, string> = { journal: 'Journal page', decision: 'Decision', tag: 'Tag', pattern: 'Gemini pattern' };

export function GraphView({ entries, decisions, report, loading, onOpenDecision, onOpenJournal }: { entries: JournalInteraction[]; decisions: Decision[]; report: PatternReport | null; loading: boolean; onOpenDecision: (decision: Decision) => void; onOpenJournal: () => void }) {
  const graph = useMemo(() => buildGraph(entries, decisions, report), [entries, decisions, report]);
  const [visible, setVisible] = useState<Record<GraphKind, boolean>>({ journal: true, decision: true, tag: true, pattern: true });
  const [query, setQuery] = useState(''), [selectedId, setSelectedId] = useState('');
  const [camera, setCamera] = useState({ x: 0, y: 0, scale: 1 });
  const [layoutNodes, setLayoutNodes] = useState<GraphNode[]>(graph.nodes);
  const nodesRef = useRef<GraphNode[]>(graph.nodes), edgesRef = useRef(graph.edges), velocities = useRef<GraphVelocity>(new Map());
  const animation = useRef<number | null>(null), framesRemaining = useRef(0), graphLayer = useRef<SVGGElement>(null);
  const pan = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
  const drag = useRef<{ id: string; pointerId: number; startX: number; startY: number } | null>(null);

  function startSimulation(frames = 260) {
    if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    framesRemaining.current = Math.max(framesRemaining.current, frames);
    if (animation.current !== null) return;
    const tick = () => {
      const movement = advanceGraphLayout(nodesRef.current, edgesRef.current, velocities.current, drag.current?.id);
      setLayoutNodes([...nodesRef.current]);
      framesRemaining.current -= 1;
      if (framesRemaining.current > 0 && (movement > .015 || drag.current)) animation.current = requestAnimationFrame(tick);
      else animation.current = null;
    };
    animation.current = requestAnimationFrame(tick);
  }

  useEffect(() => {
    if (animation.current !== null) cancelAnimationFrame(animation.current);
    animation.current = null;
    framesRemaining.current = 0;
    const next = graph.nodes.map(node => ({ ...node }));
    const nextVelocities: GraphVelocity = new Map(next.map(node => [node.id, { x: 0, y: 0 }]));
    nodesRef.current = next;
    edgesRef.current = graph.edges;
    velocities.current = nextVelocities;
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (let step = 0; step < 150; step++) advanceGraphLayout(next, graph.edges, nextVelocities);
      setLayoutNodes([...next]);
    } else {
      setLayoutNodes(next);
      startSimulation(360);
    }
    return () => { if (animation.current !== null) cancelAnimationFrame(animation.current); };
  }, [graph]);

  const nodes = layoutNodes.filter(node => visible[node.kind]), nodeIds = new Set(nodes.map(node => node.id));
  const edges = graph.edges.filter(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target));
  const positions = new Map(nodes.map(node => [node.id, node]));
  const selected = nodes.find(node => node.id === selectedId) || null, needle = query.trim().toLowerCase();
  const related = new Set(selected ? edges.flatMap(edge => edge.source === selected.id ? [edge.target] : edge.target === selected.id ? [edge.source] : []) : []);

  function zoom(next: number) {
    const scale = clamp(next, .55, 2.4);
    setCamera(current => ({ scale, x: 500 - (500 - current.x) * scale / current.scale, y: 310 - (310 - current.y) * scale / current.scale }));
  }
  function rootPoint(svg: SVGSVGElement, clientX: number, clientY: number) {
    const matrix = svg.getScreenCTM();
    return matrix ? new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse()) : null;
  }
  function layoutPoint(clientX: number, clientY: number) {
    const matrix = graphLayer.current?.getScreenCTM();
    return matrix ? new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse()) : null;
  }
  function moveNode(id: string, x: number, y: number) {
    const node = nodesRef.current.find(item => item.id === id);
    if (!node) return;
    node.x = clamp(x, 34, 966);
    node.y = clamp(y, 34, 586);
    velocities.current.set(id, { x: 0, y: 0 });
    setLayoutNodes([...nodesRef.current]);
  }
  function releasePointer(svg: SVGSVGElement, pointerId: number) {
    if (svg.hasPointerCapture(pointerId)) svg.releasePointerCapture(pointerId);
    drag.current = null;
    pan.current = null;
    startSimulation(220);
  }

  return <><div className="page-heading graph-heading"><div><p className="eyebrow">Follow the threads</p><h1>Your knowledge graph.</h1><p className="muted">See how journal pages, decisions, tags, and evidence connect. Drag a node to reshape the map; every line still represents something you explicitly linked.</p></div><Network size={42} strokeWidth={1} /></div>
    <section className="graph-shell">
      <div className="graph-toolbar"><label><span className="sr-only">Search graph</span><Search size={15} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a node" /></label><div className="graph-filters">{(Object.keys(visible) as GraphKind[]).map(kind => <button key={kind} className={`node-${kind}`} aria-pressed={visible[kind]} onClick={() => setVisible(current => ({ ...current, [kind]: !current[kind] }))}>{kindLabel[kind]}</button>)}</div><div className="graph-zoom"><button className="icon-button" aria-label="Zoom out" onClick={() => zoom(camera.scale - .2)}><Minus size={16} /></button><button className="icon-button" aria-label="Reset graph view" onClick={() => setCamera({ x: 0, y: 0, scale: 1 })}><Focus size={16} /></button><button className="icon-button" aria-label="Zoom in" onClick={() => zoom(camera.scale + .2)}><Plus size={16} /></button></div></div>
      {loading ? <div className="graph-empty" role="status">Mapping your journal…</div> : !nodes.length ? <div className="graph-empty"><Network size={38} /><h2>Your graph is waiting for its first thread.</h2><p>Add a journal page, tag it, or save a decision to begin.</p></div> : <div className="graph-stage">
        <svg viewBox="0 0 1000 620" role="application" aria-label="Interactive knowledge graph. Drag nodes to rearrange them; use arrow keys on a focused node for precise movement." onWheel={event => { event.preventDefault(); zoom(camera.scale + (event.deltaY < 0 ? .12 : -.12)); }} onPointerMove={event => {
          if (drag.current?.pointerId === event.pointerId) {
            const point = layoutPoint(event.clientX, event.clientY);
            if (point) moveNode(drag.current.id, point.x, point.y);
            return;
          }
          if (!pan.current) return;
          const point = rootPoint(event.currentTarget, event.clientX, event.clientY);
          if (point) setCamera(current => ({ ...current, x: pan.current!.x + point.x - pan.current!.startX, y: pan.current!.y + point.y - pan.current!.startY }));
        }} onPointerUp={event => releasePointer(event.currentTarget, event.pointerId)} onPointerCancel={event => releasePointer(event.currentTarget, event.pointerId)}>
          <rect className="graph-background" width="1000" height="620" onPointerDown={event => {
            const svg = event.currentTarget.ownerSVGElement, point = svg && rootPoint(svg, event.clientX, event.clientY);
            if (!svg || !point) return;
            pan.current = { x: camera.x, y: camera.y, startX: point.x, startY: point.y };
            svg.setPointerCapture(event.pointerId);
          }} />
          <g ref={graphLayer} transform={`translate(${camera.x} ${camera.y}) scale(${camera.scale})`}>
            {edges.map((edge, index) => { const source = positions.get(edge.source)!, target = positions.get(edge.target)!, active = selected && (edge.source === selected.id || edge.target === selected.id); return <line key={`${edge.source}-${edge.target}-${index}`} className={active ? 'active' : ''} x1={source.x} y1={source.y} x2={target.x} y2={target.y} />; })}
            {nodes.map(node => {
              const match = !needle || `${node.label} ${node.detail}`.toLowerCase().includes(needle), active = selected?.id === node.id, dim = (!!needle && !match) || (!!selected && !active && !related.has(node.id));
              return <g key={node.id} className={`graph-node node-${node.kind} ${active ? 'active' : ''} ${dim ? 'dim' : ''}`} transform={`translate(${node.x} ${node.y})`} role="button" tabIndex={0} aria-label={`${kindLabel[node.kind]}: ${node.label}. Drag to move or use arrow keys.`} onPointerDown={event => {
                event.stopPropagation();
                const svg = event.currentTarget.ownerSVGElement;
                if (!svg) return;
                setSelectedId(node.id);
                drag.current = { id: node.id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY };
                svg.setPointerCapture(event.pointerId);
                startSimulation(220);
              }} onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(node.id); return; }
                const distance = event.shiftKey ? 24 : 8;
                const offset = event.key === 'ArrowLeft' ? [-distance, 0] : event.key === 'ArrowRight' ? [distance, 0] : event.key === 'ArrowUp' ? [0, -distance] : event.key === 'ArrowDown' ? [0, distance] : null;
                if (offset) { event.preventDefault(); setSelectedId(node.id); moveNode(node.id, node.x + offset[0], node.y + offset[1]); startSimulation(180); }
              }}><circle r={node.radius} /><text x={node.radius + 7} y="4">{node.label.length > 28 ? `${node.label.slice(0, 27)}…` : node.label}</text></g>;
            })}
          </g>
        </svg>
        {selected && <aside className="graph-inspector"><span className={`graph-kind node-${selected.kind}`}>{kindLabel[selected.kind]}</span><button className="icon-button" aria-label="Close node details" onClick={() => setSelectedId('')}>×</button><h2>{selected.label}</h2><p>{selected.detail.slice(0, 500)}{selected.detail.length > 500 ? '…' : ''}</p>{selected.kind === 'decision' && <button className="graph-open-node" onClick={() => { const item = decisions.find(decision => decision.id === selected.sourceId); if (item) onOpenDecision(item); }}><BookOpen size={15} />Open decision</button>}{selected.kind === 'journal' && <button className="graph-open-node" onClick={onOpenJournal}><Feather size={15} />Open journal</button>}{selected.kind === 'pattern' && <p className="small"><Sparkles size={13} />Generated from selected reviewed decisions</p>}{selected.kind === 'tag' && <p className="small"><Tag size={13} />Select a connected page to inspect it</p>}</aside>}
      </div>}
      <footer className="graph-legend"><span className="node-journal"><i />Journal</span><span className="node-decision"><i />Decision</span><span className="node-tag"><i />Tag</span><span className="node-pattern"><i />Gemini pattern</span><em>{nodes.length} nodes · {edges.length} links{graph.truncated ? ' · recent records shown' : ''}</em></footer>
    </section>
  </>;
}
