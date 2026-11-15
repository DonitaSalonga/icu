// Session detail (R19, R34; design "Dashboard · Session detail"): stats, candidates (High first) and exam info.
import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { avatarFor } from '@icu/ui-tokens/avatars';
import { describeExamSite } from '@icu/core';
import { attemptStatus, isEnded, loadSummaries, RISK_ORDER, SESSION_COLUMNS, sessionStatus, type ScoredAttempt, type SessionRow } from '../lib/data';
import { errorText, supabase } from '../supabase';
import { Alert, formatShort, Icon, RiskPill, scheduleFull, StatusPill } from '../ui';

export function SessionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<SessionRow>();
  const [rows, setRows] = useState<ScoredAttempt[]>();
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const s = await supabase!.from('exam_sessions').select(SESSION_COLUMNS).eq('id', id!).single();
        if (s.error) throw s.error;
        setSession(s.data as SessionRow);
        setRows(await loadSummaries(s.data as SessionRow));
      } catch (e) {
        setError(errorText(e as { message: string }));
      }
    })();
  }, [id]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  const sorted = useMemo(() => rows && [...rows].sort((a, b) => RISK_ORDER[a.risk.level] - RISK_ORDER[b.risk.level] || b.risk.score - a.risk.score), [rows]);
  const stats = rows && session && {
    candidates: rows.filter((a) => a.started_at).length,
    monitoring: rows.filter((a) => a.status === 'active' && !isEnded(a, session)).length,
    review: rows.filter((a) => isEnded(a, session) && !a.verdict).length,
    high: rows.filter((a) => a.risk.level === 'high').length,
  };
  const v = (n: number | undefined) => (n === undefined ? '—' : n);

  if (error) return <Alert>{error}</Alert>;
  if (!session) return <div className="empty" role="status"><b>Loading…</b></div>;

  return (
    <>
      <div className="head">
        <div>
          <h1 className="h1">{session.name}</h1>
          <p className="sub"><StatusPill status={sessionStatus(session)} /><span className="mono">{session.code}</span></p>
        </div>
        <button type="button" className="btn s" onClick={() => { void navigator.clipboard?.writeText(session.code); setCopied(true); }}>
          <span>{copied ? 'Copied' : 'Copy code'}</span>
        </button>
      </div>
      <div className="grid4">
        <div className="card stat"><p className="l">Candidates</p><p className="v">{v(stats?.candidates)}</p><p className="d">Started the exam</p></div>
        <div className="card stat"><p className="l">Monitoring now</p><p className="v">{v(stats?.monitoring)}</p><p className="d">In progress</p></div>
        <div className="card stat"><p className="l">Needs review</p><p className="v">{v(stats?.review)}</p><p className="d">Ended, no verdict yet</p></div>
        <div className="card stat"><p className="l">High risk</p><p className="v">{v(stats?.high)}</p><p className="d">Flagged High</p></div>
      </div>
      <div className="cols">
        <section className="card" aria-labelledby="ch">
          <div className="cardhead"><h2 id="ch">Candidates</h2></div>
          {sorted && sorted.length > 0 && (
            <div className="tw">
              <table className="t">
                <thead><tr>{['Candidate', 'Status', 'Started', 'Warnings', 'Risk'].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
                <tbody>
                  {sorted.map((a) => (
                    <tr key={a.attempt_id} className="click" onClick={() => navigate(`/sessions/${session.id}/attempts/${a.attempt_id}`)}>
                      <td>
                        <span className="who">
                          <img className="avatar sm" src={avatarFor(a.student_id)} alt="" />
                          <span><Link className="lk" to={`/sessions/${session.id}/attempts/${a.attempt_id}`} onClick={(e) => e.stopPropagation()}>{a.full_name}</Link><small>{a.email}</small></span>
                        </span>
                      </td>
                      <td>{attemptStatus(a, session)}</td>
                      <td className="num">{a.started_at ? formatShort(a.started_at) : '—'}</td>
                      <td className="num mono">{a.warnings} of {session.warning_limit}</td>
                      <td><RiskPill level={a.risk.level} score={a.risk.score} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!sorted && <div className="empty" role="status"><b>Loading…</b></div>}
          {sorted?.length === 0 && <div className="empty"><b>No candidates yet</b>Share the code {session.code} with your students.</div>}
        </section>
        <section className="card sticky" aria-labelledby="ei" role="region">
          <h2 id="ei" style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}><Icon name="monitor" /> Exam info</h2>
          <p className="m" style={{ color: 'var(--muted)' }}>About the exam</p>
          <p style={{ marginBottom: 14, whiteSpace: 'pre-line' }}>{session.description || 'No description.'}</p>
          <p style={{ color: 'var(--muted)' }}>Exam platform</p>
          <p style={{ marginBottom: 14 }}>
            {session.url_patterns.map((p, i) => (
              <Fragment key={p}>{i > 0 && <br />}<b>{p}</b>: {describeExamSite(p)}</Fragment>
            ))}
          </p>
          <p style={{ color: 'var(--muted)' }}>Schedule</p>
          <p style={{ marginBottom: 14 }}>{scheduleFull(session)} ({sessionStatus(session)})</p>
          <p style={{ color: 'var(--muted)' }}>Warning limit</p>
          <p style={{ marginBottom: 14 }}>{session.warning_limit} warnings, then the candidate is flagged High</p>
          <p style={{ color: 'var(--muted)' }}>Code for students</p>
          <p className="mono">{session.code}</p>
        </section>
      </div>
    </>
  );
}
