// Session detail (R19; DSD § Components "Data table"): candidates with risk and verdict, High first.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { attemptStatus, loadSummaries, RISK_ORDER, SESSION_COLUMNS, sessionStatus, type ScoredAttempt, type SessionRow } from '../lib/data';
import { errorText, supabase } from '../supabase';
import { Alert, formatDateTime, RiskBadge, VerdictBadge } from '../ui';

type SortKey = 'risk' | 'name' | 'start';

export function SessionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<SessionRow>();
  const [rows, setRows] = useState<ScoredAttempt[]>();
  const [error, setError] = useState<string>();
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: 'risk', asc: true });

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

  const sorted = useMemo(() => {
    if (!rows) return undefined;
    const cmp: Record<SortKey, (a: ScoredAttempt, b: ScoredAttempt) => number> = {
      risk: (a, b) => RISK_ORDER[a.risk.level] - RISK_ORDER[b.risk.level] || b.risk.score - a.risk.score,
      name: (a, b) => a.full_name.localeCompare(b.full_name),
      start: (a, b) => (a.started_at ?? '').localeCompare(b.started_at ?? ''),
    };
    const out = [...rows].sort(cmp[sort.key]);
    return sort.asc ? out : out.reverse();
  }, [rows, sort]);

  const header = (key: SortKey, label: string) => {
    const active = sort.key === key;
    return (
      <th scope="col" className="p-2" aria-sort={active ? (sort.asc ? 'ascending' : 'descending') : 'none'}>
        <button className="font-semibold underline-offset-2 hover:underline" onClick={() => setSort({ key, asc: active ? !sort.asc : true })}>
          {label} {active ? (sort.asc ? '↑' : '↓') : ''}
        </button>
      </th>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <Link to="/sessions" className="text-sm text-primary underline">← Sessions</Link>
      {error && <Alert>{error}</Alert>}
      {session && (
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-xl font-semibold">{session.name}</h1>
          <span className="font-mono">{session.code}</span>
          <span className="text-sm text-muted">{sessionStatus(session)} · {formatDateTime(session.starts_at)} – {formatDateTime(session.ends_at)}</span>
        </div>
      )}
      {!rows && !error && <p className="text-sm text-muted">Loading…</p>}
      {rows?.length === 0 && <p className="text-sm text-muted">No candidates have joined yet. Share the code {session?.code} with your students.</p>}
      {sorted && sorted.length > 0 && session && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-surface">
              <tr>
                {header('name', 'Candidate')}
                <th scope="col" className="p-2">Status</th>
                {header('start', 'Started')}
                <th scope="col" className="p-2">Warnings</th>
                {header('risk', 'Risk')}
                <th scope="col" className="p-2">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((a) => (
                <tr key={a.attempt_id} className="cursor-pointer border-b border-border hover:bg-surface" onClick={() => navigate(`/sessions/${id}/attempts/${a.attempt_id}`)}>
                  <td className="p-2">
                    <Link className="text-primary underline" to={`/sessions/${id}/attempts/${a.attempt_id}`} onClick={(e) => e.stopPropagation()}>{a.full_name}</Link>
                    <div className="text-xs text-muted">{a.email}</div>
                  </td>
                  <td className="p-2">{attemptStatus(a, session)}</td>
                  <td className="p-2">{a.started_at ? formatDateTime(a.started_at) : '—'}</td>
                  <td className="p-2">{a.warnings} of {session.warning_limit}</td>
                  <td className="p-2"><RiskBadge level={a.risk.level} score={a.risk.score} /></td>
                  <td className="p-2"><VerdictBadge verdict={a.verdict} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
