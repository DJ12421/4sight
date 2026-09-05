import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildGraph } from '../src/components/GraphView';
import { Decision, PatternReport } from '../src/domain';
import { JournalInteraction } from '../src/types';

test('knowledge graph uses only explicit journal, tag, decision, and pattern links', () => {
  const journal = [
    { id: 'j1', title: 'Learning note', prompt: 'I want to learn deliberately.', tags: ['learning'], createdAt: '2026-09-01T00:00:00.000Z' },
    { id: 'j2', title: 'Course note', prompt: 'A smaller course may work.', tags: ['learning'], createdAt: '2026-09-02T00:00:00.000Z' },
  ] as JournalInteraction[];
  const decisions = [
    { id: 'd1', title: 'Choose a course', dilemma: 'Which course?', journalId: 'j1', sourceIds: [] },
    { id: 'd2', title: 'Plan study time', dilemma: 'When?', sourceIds: ['d1'] },
  ] as Decision[];
  const report = { insights: [{ observation: 'Small tests help', evidence: 'Two decisions', question: 'What next?', sourceIds: ['d1', 'd2'] }] } as PatternReport;
  const graph = buildGraph(journal, decisions, report);
  assert.deepEqual(new Set(graph.nodes.map(node => node.kind)), new Set(['journal', 'decision', 'tag', 'pattern']));
  assert.deepEqual(new Set(graph.edges.map(edge => edge.kind)), new Set(['tag', 'origin', 'evidence', 'pattern']));
  assert.ok(graph.nodes.every(node => Number.isFinite(node.x) && Number.isFinite(node.y) && node.x >= 34 && node.x <= 966 && node.y >= 34 && node.y <= 586));
});
