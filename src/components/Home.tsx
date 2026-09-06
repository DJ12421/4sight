import { ArrowRight, BookOpen, Feather, Network, Sparkles } from 'lucide-react';
import { Decision, PatternReport } from '../domain';
import { JournalInteraction } from '../types';

type HomeProps = {
  name: string;
  entries: JournalInteraction[];
  decisions: Decision[];
  report: PatternReport | null;
  loading: boolean;
  onJournal: () => void;
  onDecision: () => void;
  onGraph: () => void;
  onPatterns: () => void;
};

export function Home({ name, entries, decisions, report, loading, onJournal, onDecision, onGraph, onPatterns }: HomeProps) {
  const openExperiments = decisions.filter(item => item.commitment && !item.reviews.length).length;
  const reviewed = decisions.filter(item => item.reviews.length).length;
  const connections = entries.reduce((total, item) => total + (item.tags?.length || 0), 0) + decisions.reduce((total, item) => total + item.sourceIds.length + (item.journalId ? 1 : 0), 0) + (report?.sources.length || 0);
  const latestPage = entries[0], latestDecision = decisions[0];
  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening';

  return <div className="home-dashboard">
    <section className="home-hero">
      <div className="home-hero-copy"><p className="eyebrow"><span className="accent-dot" />Your private thinking space</p><h1>{greeting}, {name}.<br /><em>What is asking for your attention?</em></h1><p>Begin with the thought that keeps returning. Gemini can help you reflect, your graph can reveal the threads, and you decide what becomes action.</p><div className="home-actions"><button onClick={onJournal}><Feather size={17} />Write in your journal</button><button className="secondary" onClick={onDecision}>Make a decision <ArrowRight size={16} /></button></div><p className="small muted">Your writing stays in your account. You always see what is sent to Gemini.</p></div>
      <div className="home-map" aria-label="Open a part of your thinking workspace">
        <span className="home-map-caption">TODAY / YOUR FIELD NOTES</span>
        <button className="home-paper" onClick={onJournal}><span className="eyebrow">Latest page</span><strong>{latestPage?.title || 'Begin with one honest sentence.'}</strong><p>{latestPage?.prompt || 'Name what happened, what you noticed, or what you cannot stop thinking about.'}</p><span>Open journal <ArrowRight size={14} /></span></button>
        <button className="home-thread home-thread-decision" onClick={onDecision}><BookOpen size={15} /><span>{latestDecision ? 'Continue a choice' : 'First decision'}</span></button>
        <button className="home-thread home-thread-graph" onClick={onGraph}><Network size={15} /><span>Follow the threads</span></button>
        <button className="home-thread home-thread-pattern" onClick={onPatterns}><Sparkles size={15} /><span>{report ? 'Revisit a pattern' : 'Find a pattern'}</span></button>
      </div>
    </section>

    <section className="home-pulse" aria-label="Workspace summary">
      <div><strong>{loading ? '—' : String(entries.length).padStart(2, '0')}</strong><span>Journal pages</span></div>
      <div><strong>{loading ? '—' : String(openExperiments).padStart(2, '0')}</strong><span>Experiments in motion</span></div>
      <div><strong>{loading ? '—' : String(reviewed).padStart(2, '0')}</strong><span>Outcomes reviewed</span></div>
      <div><strong>{loading ? '—' : String(connections).padStart(2, '0')}</strong><span>Explicit connections</span></div>
    </section>

    <section className="home-loop"><div><p className="eyebrow">A quieter way to move forward</p><h2>Write what is true now.<br />Leave evidence for your future self.</h2></div><ol><li><span>Notice</span>Capture the thought before hindsight edits it.</li><li><span>Connect</span>See the tags, choices, and evidence that belong together.</li><li><span>Try</span>Turn insight into one small experiment you can revisit.</li></ol></section>
  </div>;
}
