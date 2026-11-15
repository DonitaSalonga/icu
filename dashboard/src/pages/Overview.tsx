// Overview (design "Dashboard · Overview"): what needs attention today. Built from the sessions and candidate
// summaries the admin already loads (lib/admin-data); no new backend calls.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminData } from '../lib/admin-data';
import { needsReview, RISK_ORDER, sessionStatus, type ReviewAttempt } from '../lib/data';
import { Alert, RiskPill, scheduleComma, Seg, StatusPill } from '../ui';

type Period = 'today' | '7d' | '30d';
const DAY = 86_400_000;
const MANILA_OFFSET = 8 * 3_600_000;
/** Start of today in Asia/Manila (UTC+8, no daylight saving). */
const startOfToday = () => Math.floor((Date.now() + MANILA_OFFSET) / DAY) * DAY - MANILA_OFFSET;

function windowFor(period: Period) {
  const end = startOfToday() + DAY;
  const days = { today: 1, '7d': 7, '30d': 30 }[period];
  return { start: end - days * DAY, end, prevStart: end - 2 * days * DAY, days };
}

const within = (iso: string | null, from: number, to: number) => iso !== null && Date.parse(iso) >= from && Date.parse(iso) < to;

function bucketCounts(attempts: ReviewAttempt[], start: number, end: number, buckets: number) {
  const size = (end - start) / buckets;
  const out = Array<number>(buckets).fill(0);
  for (const a of attempts) {
    if (!a.started_at) continue;
    const t = Date.parse(a.started_at);
    if (t >= start && t < end) out[Math.min(buckets - 1, Math.floor((t - start) / size))]!++;
  }
  return out;
}

const change = (now: number, before: number, label: string) => {
  const diff = now - before;
  return diff === 0 ? 'No change' : `${diff > 0 ? '+' : ''}${diff} vs ${label}`;
};

/** The design's sparkline: a line across a 200 × 40 box ending in a dot. Decorative; the value carries the meaning. */
function Spark({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => [values.length === 1 ? 150 : 2 + (i / (values.length - 1)) * 148, 36 - (v / max) * 28]);
  const last = pts[pts.length - 1]!;
  return (
    <svg aria-hidden="true" width="100%" height="40" viewBox="0 0 200 40" preserveAspectRatio="none" style={{ display: 'block', marginTop: 10 }}>
      <path d={pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]!.toFixed(1)} ${p[1]!.toFixed(1)}`).join(' ')} fill="none" stroke="#d9662e" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={3.5} fill="#d9662e" />
    </svg>
  );
}

export function Overview() {
  const { loading, error, sessions, attempts } = useAdminData();
  const [period, setPeriod] = useState<Period>('7d');

  const view = useMemo(() => {
    const w = windowFor(period);
    const ids = new Set(sessions.filter((s) => within(s.starts_at, w.start, w.end)).map((s) => s.id));
    const prevIds = new Set(sessions.filter((s) => within(s.starts_at, w.prevStart, w.start)).map((s) => s.id));
    const mine = attempts.filter((a) => ids.has(a.session.id) && a.started_at);
    const prev = attempts.filter((a) => prevIds.has(a.session.id) && a.started_at);
    const label = period === 'today' ? 'yesterday' : `the previous ${w.days} days`;
    const highNow = mine.filter((a) => a.risk.level === 'high').length;
    return {
      live: sessions.filter((s) => sessionStatus(s) === 'Active'),
      upcoming: sessions.filter((s) => sessionStatus(s) === 'Upcoming').reverse(),
      monitoring: attempts.filter((a) => a.status === 'active' && sessionStatus(a.session) === 'Active').length,
      review: attempts.filter(needsReview).sort((a, b) => RISK_ORDER[a.risk.level] - RISK_ORDER[b.risk.level] || b.risk.score - a.risk.score),
      candidates: mine.length,
      candidatesTrend: change(mine.length, prev.length, label),
      high: highNow,
      highTrend: change(highNow, prev.filter((a) => a.risk.level === 'high').length, label),
      spark: bucketCounts(mine, w.start, w.end, period === 'today' ? 8 : w.days),
    };
  }, [sessions, attempts, period]);

  const candidatesIn = (id: string) => attempts.filter((a) => a.session.id === id).length;
  const liveAndUpcoming = [...view.live, ...view.upcoming].slice(0, 6);
  const v = (n: number) => (loading ? '—' : n);

  return (
    <>
      <div className="head">
        <div><h1 className="h1">Overview</h1><p className="sub"><span>Today · Asia/Manila</span></p></div>
        <Seg<Period> label="Period" value={period} onChange={setPeriod} options={[{ value: 'today', label: 'Today' }, { value: '7d', label: '7D' }, { value: '30d', label: '30D' }]} />
      </div>
      {error && <Alert>{error}</Alert>}
      <div className="grid4">
        <div className="card stat"><p className="l">Live now</p><p className="v">{v(view.live.length)}</p><p className="d">{view.monitoring} candidate{view.monitoring === 1 ? '' : 's'} monitoring</p></div>
        <div className="card stat"><p className="l">Candidates</p><p className="v">{v(view.candidates)}</p><span className="trend">{view.candidatesTrend}</span><Spark values={view.spark} /></div>
        <Link to="/review" className="card stat" style={{ textDecoration: 'none', color: 'inherit', display: 'block', transition: 'transform 160ms var(--ease-out)' }}>
          <p className="l">Needs review</p><p className="v">{v(view.review.length)}</p><p className="d">Ended, no verdict yet</p>
          <p className="lk" style={{ marginTop: 12, color: 'var(--primary)', textDecoration: 'underline' }}>Open Needs review</p>
        </Link>
        <div className="card stat"><p className="l">High risk</p><p className="v">{v(view.high)}</p><span className={`trend ${view.high > 0 ? 'bad' : ''}`}>{view.highTrend}</span></div>
      </div>
      <div className="grid2">
        <section className="card" aria-labelledby="nr">
          <div className="cardhead"><h2 id="nr">Needs review</h2><Link className="lk" to="/review">View all</Link></div>
          {!loading && view.review.length === 0 && <div className="empty"><b>You're all caught up</b>Ended candidates without a verdict show up here.</div>}
          {view.review.slice(0, 5).map((a) => (
            <div key={a.attempt_id} className="row">
              <div><Link className="t" to={`/sessions/${a.session.id}/attempts/${a.attempt_id}`}>{a.full_name}</Link><p className="m">{a.session.name}</p></div>
              <RiskPill level={a.risk.level} score={a.risk.score} />
            </div>
          ))}
        </section>
        <section className="card" aria-labelledby="ls">
          <div className="cardhead"><h2 id="ls">Live and upcoming sessions</h2><Link className="lk" to="/sessions">All sessions</Link></div>
          {!loading && liveAndUpcoming.length === 0 && <div className="empty"><b>No live or upcoming sessions</b>Create one from Sessions.</div>}
          {liveAndUpcoming.map((s) => (
            <div key={s.id} className="row" style={{ alignItems: 'flex-start' }}>
              <div>
                <Link className="t" to={`/sessions/${s.id}`}>{s.name}</Link>
                <p className="m">{s.url_patterns.join(', ')} · {scheduleComma(s)}</p>
                <p className="m" style={{ marginTop: 8, display: 'flex', gap: 10, alignItems: 'center' }}>{candidatesIn(s.id)} candidates <StatusPill status={sessionStatus(s)} /></p>
              </div>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
