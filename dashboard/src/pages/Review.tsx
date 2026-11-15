// Needs review: every ended candidate without a verdict, across the admin's sessions, highest risk first.
// Row cards with student avatars (feedback round 2026-11-15); the whole row opens the candidate.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { RiskLevel } from '@icu/core';
import { avatarFor } from '@icu/ui-tokens/avatars';
import { AiBadge } from '../components/AiSuggestion';
import { useAdminData } from '../lib/admin-data';
import { loadAnalyses, needsReview, RISK_ORDER, type AiAnalysis } from '../lib/data';
import { Alert, formatShort, Icon, RiskPill, Seg } from '../ui';

type Filter = 'all' | RiskLevel;

export function Review() {
  const { loading, error, attempts } = useAdminData();
  const navigate = useNavigate();
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
        <ul className="rows" key={filter} aria-label="Candidates to review">
          {rows.map((a, i) => {
            const to = `/sessions/${a.session.id}/attempts/${a.attempt_id}`;
            return (
              <li key={a.attempt_id} className="rowcard" style={{ animationDelay: `${i * 35}ms` }} onClick={() => navigate(to)}>
                <img className="avatar" src={avatarFor(a.student_id)} alt="" />
                <div className="rowmain">
                  <Link className="rt" to={to} onClick={(e) => e.stopPropagation()}>{a.full_name}</Link>
                  <p>{a.session.name} · {a.email}</p>
                </div>
                <RiskPill level={a.risk.level} score={a.risk.score} />
                <span className="meta opt"><AiBadge analysis={ai.get(a.attempt_id)} /></span>
                <span className="meta"><Icon name="clock" size={18} />{formatShort(a.ended_at ?? a.session.ends_at)}</span>
                <span className="btn k" aria-hidden="true">Review</span>
              </li>
            );
          })}
        </ul>
        {loading && <div className="empty" role="status"><b>Loading…</b></div>}
        {!loading && all.length === 0 && <div className="empty"><b>You're all caught up</b>Ended candidates without a verdict show up here.</div>}
        {!loading && all.length > 0 && rows.length === 0 && <div className="empty"><b>Nothing at this risk level</b>Try another filter.</div>}
      </section>
    </>
  );
}
