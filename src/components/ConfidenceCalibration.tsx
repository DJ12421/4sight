import { Activity, ArrowRight, Target } from 'lucide-react';
import { CSSProperties } from 'react';
import { Decision } from '../domain';

const MINIMUM_DECISIONS = 5;

export function ConfidenceCalibration({ decisions, onOpen }: { decisions: Decision[]; onOpen: (decision: Decision) => void }) {
  const reviewed = decisions.filter(d => !d.sample && d.commitment && d.reviews.length > 0);
  const recent = reviewed.slice(0, 12);

  if (reviewed.length < MINIMUM_DECISIONS) {
    return <section className="calibration-card calibration-empty">
      <div className="calibration-heading"><span className="calibration-icon"><Target size={20} /></span><div><p className="eyebrow">Confidence calibration</p><h2>Learn how your confidence travels.</h2></div></div>
      <p>Review {MINIMUM_DECISIONS} personal decisions to compare what you expected with what happened. Foresight waits for enough evidence instead of forcing a score.</p>
      <div className="calibration-progress" aria-label={`${reviewed.length} of ${MINIMUM_DECISIONS} reviewed decisions recorded`}>{Array.from({ length: MINIMUM_DECISIONS }, (_, i) => <span className={i < reviewed.length ? 'filled' : ''} key={i} />)}</div>
      <strong>{reviewed.length} / {MINIMUM_DECISIONS} reviewed</strong>
    </section>;
  }

  const expected = Math.round(recent.reduce((sum, d) => sum + d.commitment!.confidence, 0) / recent.length);
  const observed = Math.round(recent.reduce((sum, d) => {
    const result = d.reviews.at(-1)!.result;
    return sum + (result === 'met' ? 100 : result === 'partly' ? 50 : 0);
  }, 0) / recent.length);
  const gap = Math.abs(expected - observed);

  return <section className="calibration-card">
    <div className="calibration-heading"><span className="calibration-icon"><Activity size={20} /></span><div><p className="eyebrow">Confidence calibration</p><h2>{gap <= 10 ? 'Your confidence is tracking closely.' : expected > observed ? 'You may be estimating a little high.' : 'You may be underestimating yourself.'}</h2></div></div>
    <div className="calibration-bars" aria-label={`Average confidence ${expected} percent; outcome alignment ${observed} percent`}>
      <div><span>Confidence at commitment</span><div><i style={{ width: `${expected}%` }} /></div><strong>{expected}%</strong></div>
      <div><span>Outcome alignment</span><div><i style={{ width: `${observed}%` }} /></div><strong>{observed}%</strong></div>
    </div>
    <div className="calibration-trail" aria-label="Recent confidence and outcomes">{recent.map(d => <button key={d.id} title={`${d.title}: ${d.commitment!.confidence}% confidence, ${d.reviews.at(-1)!.result}`} onClick={() => onOpen(d)} style={{ '--confidence': `${d.commitment!.confidence}%` } as CSSProperties}><span className={`result-dot ${d.reviews.at(-1)!.result}`} /><span>{d.commitment!.confidence}%</span></button>)}</div>
    <div className="calibration-note"><p>Based on the latest review of {recent.length} decisions. “Partly” counts halfway; “not yet” counts as unmet. This is a reflection aid, not a performance score.</p><button className="text-button" onClick={() => onOpen(recent[0])}>Review the evidence <ArrowRight size={15} /></button></div>
  </section>;
}
