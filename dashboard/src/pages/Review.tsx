// Needs review (design "Dashboard · Needs review"): every ended candidate without a verdict, across the admin's
// sessions, highest risk first.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { RiskLevel } from '@icu/core';
import { AiBadge } from '../components/AiSuggestion';
import { useAdminData } from '../lib/admin-data';
import { loadAnalyses, needsReview, RISK_ORDER, type AiAnalysis } from '../lib/data';
import { Alert, formatDateTime, RiskPill, Seg } from '../ui';

type Filter = 'all' | RiskLevel;

export function Review() {
  const { loading, error, attempts } = useAdminData();
  const [filter, setFilter] = useState<Filter>('all');
  const [ai, setAi] = useState<Map<string, AiAnalysis>>(new Map());

  const all = useMemo(() => attempts.filter(needsReview).sort((a, b) => RISK_ORDER[a.risk.level] - RISK_ORDER[b.risk.level] || b.risk.score - a.risk.score), [attempts]);
  const rows = all.filter((a) => filter === 'all' || a.risk.level === filter);

  const ids = all.map((a) => a.attempt_id).join(',');
  useEffect(() => {
    if (!ids) return;
    void loadAnalyses(ids.split(',')).then(setAi).catch(() => undefined);
  }, [ids]);

  return (
    <>
      <div className="head">
        <div><h1 className="h1">Needs review</h1><p className="sub">Ended candidates without a verdict, highest risk first</p></div>
        <Seg<Filter> label="Risk level" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' }]} />
      </div>
      {error && <Alert>{error}</Alert>}
      <section className="card" aria-label="Candidates to review">
        {rows.length > 0 && (
          <div className="tw">
            <table className="t">
              <thead><tr>{['Candidate', 'Session', 'Risk', 'AI suggestion', 'Ended'].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.attempt_id}>
                    <td><Link className="lk" to={`/sessions/${a.session.id}/attempts/${a.attempt_id}`}>{a.full_name}</Link><small>{a.email}</small></td>
                    <td>{a.session.name}</td>
                    <td><RiskPill level={a.risk.level} score={a.risk.score} /></td>
                    <td><AiBadge analysis={ai.get(a.attempt_id)} /></td>
                    <td className="num">{formatDateTime(a.ended_at ?? a.session.ends_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {loading && <div className="empty" role="status"><b>Loading…</b></div>}
        {!loading && all.length === 0 && <div className="empty"><b>You're all caught up</b>Ended candidates without a verdict show up here.</div>}
        {!loading && all.length > 0 && rows.length === 0 && <div className="empty"><b>Nothing at this risk level</b>Try another filter.</div>}
      </section>
    </>
  );
}
