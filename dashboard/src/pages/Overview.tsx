// Overview: what needs attention today (feedback round 2026-11-15: greeting, pastel cards and avatar lists,
// inspired by the "intelly" dashboard). Built from the sessions and candidate summaries the admin already
// loads (lib/admin-data); no new backend calls.
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { avatarFor } from '@icu/ui-tokens/avatars';
import { useAuth } from '../auth';
import { useAdminData } from '../lib/admin-data';
import { needsReview, RISK_ORDER, sessionStatus, type ReviewAttempt } from '../lib/data';
import { Alert, Icon, RiskPill, scheduleComma, Seg, StatusPill } from '../ui';

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

/** "Good morning" / "Good afternoon" / "Good evening" in Asia/Manila. */
function greeting() {
  const hour = Number(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila', hour: 'numeric', hour12: false })) % 24;
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

/** A line chart across the card (decorative; the numbers carry the meaning). */
function Spark({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => [values.length === 1 ? 300 : 4 + (i / (values.length - 1)) * 292, 54 - (v / max) * 44]);
  const last = pts[pts.length - 1]!;
  return (
    <svg aria-hidden="true" width="100%" height="60" viewBox="0 0 300 60" preserveAspectRatio="none" style={{ display: 'block', marginTop: 12, position: 'relative' }}>
      <path d={pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]!.toFixed(1)} ${p[1]!.toFixed(1)}`).join(' ')} fill="none" stroke="#1d1a17" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r={4} fill="#1d1a17" />
    </svg>
  );
}

/** Large soft shapes in the card corners, as in the inspiration (decorative). */
const SHAPES = {
  plus: <path d="M55 10h40v45h45v40H95v45H55V95H10V55h45z" />,
  heart: <path d="M75 135S12 95 12 52a33 33 0 0 1 63-14 33 33 0 0 1 63 14c0 43-63 83-63 83z" />,
  triangle: <path d="M10 20h130L75 140z" />,
  star: <path d="M75 5l14 42 44-8-30 33 30 33-44-8-14 42-14-42-44 8 30-33-30-33 44 8z" />,
};
function Shape({ kind }: { kind: keyof typeof SHAPES }) {
  return <svg className="shape" viewBox="0 0 150 150" aria-hidden="true" fill="#1d1a17">{SHAPES[kind]}</svg>;
}

export function Overview() {
  const { profile } = useAuth();
  const { loading, error, sessions, attempts } = useAdminData();
  const navigate = useNavigate();
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
      byRisk: { high: mine.filter((a) => a.risk.level === 'high').length, medium: mine.filter((a) => a.risk.level === 'medium').length, low: mine.filter((a) => a.risk.level === 'low').length },
      spark: bucketCounts(mine, w.start, w.end, period === 'today' ? 8 : w.days),
    };
  }, [sessions, attempts, period]);

  const candidatesIn = (id: string) => attempts.filter((a) => a.session.id === id).length;
  const liveAndUpcoming = [...view.live, ...view.upcoming].slice(0, 6);
  const v = (n: number) => (loading ? '—' : n);
  const firstName = profile?.full_name.split(/\s+/)[0] ?? '';
  const summary = loading
    ? 'Loading your sessions…'
    : `${view.review.length} candidate${view.review.length === 1 ? '' : 's'} waiting for your review and ${view.live.length} live session${view.live.length === 1 ? '' : 's'} right now.`;

  return (
    <>
      <div className="head">
        <div>
          <p className="eyebrow">Overview</p>
          <h1 className="greet">{greeting()}, {firstName}</h1>
          <p className="sub"><span>{summary}</span></p>
        </div>
        <Seg<Period> label="Period" value={period} onChange={setPeriod} options={[{ value: 'today', label: 'Today' }, { value: '7d', label: '7D' }, { value: '30d', label: '30D' }]} />
      </div>
      {error && <Alert>{error}</Alert>}

      <div className="pgrid">
        <div className="pcard yellow">
          <Shape kind="plus" />
          <h2>Live now:</h2>
          <p className="big">{v(view.live.length)}</p>
          <p className="sub2">{view.monitoring} candidate{view.monitoring === 1 ? '' : 's'} monitoring</p>
        </div>
        <div className="pcard pink">
          <Shape kind="heart" />
          <h2>Candidates:</h2>
          <div className="chipline">
            <div><b>{v(view.candidates)}</b><span>Started</span></div>
            <div><b>{v(view.byRisk.medium)}</b><span>Medium</span></div>
            <div><b>{v(view.byRisk.low)}</b><span>Low</span></div>
          </div>
          <Spark values={view.spark} />
          <span className="trend">{view.candidatesTrend}</span>
        </div>
        <Link to="/review" className="pcard sage">
          <Shape kind="triangle" />
          <h2>Needs review:</h2>
          <p className="big">{v(view.review.length)}</p>
          <p className="sub2">Ended, no verdict yet</p>
          <span className="lk2">Open Needs review <Icon name="arrow" size={18} /></span>
        </Link>
        <div className="pcard blue">
          <Shape kind="star" />
          <h2>High risk:</h2>
          <p className="big">{v(view.high)}</p>
          <span className="trend" style={{ marginTop: 12, display: 'inline-block' }}>{view.highTrend}</span>
        </div>
      </div>

      <div className="grid2">
        <section className="card" aria-labelledby="nr">
          <div className="cardhead"><h2 id="nr">Needs review</h2><Link className="lk" to="/review">View all</Link></div>
          {!loading && view.review.length === 0 && <div className="empty"><b>You're all caught up</b>Ended candidates without a verdict show up here.</div>}
          <ul className="rows">
            {view.review.slice(0, 5).map((a, i) => (
              <li key={a.attempt_id} className="rowcard" style={{ animationDelay: `${i * 40}ms` }} onClick={() => navigate(`/sessions/${a.session.id}/attempts/${a.attempt_id}`)}>
                <img className="avatar" src={avatarFor(a.student_id)} alt="" />
                <div className="rowmain"><Link className="rt" to={`/sessions/${a.session.id}/attempts/${a.attempt_id}`} onClick={(e) => e.stopPropagation()}>{a.full_name}</Link><p>{a.session.name}</p></div>
                <RiskPill level={a.risk.level} score={a.risk.score} />
              </li>
            ))}
          </ul>
        </section>
        <section className="card" aria-labelledby="ls">
          <div className="cardhead"><h2 id="ls">Live and upcoming sessions</h2><Link className="lk" to="/sessions">All sessions</Link></div>
          {!loading && liveAndUpcoming.length === 0 && <div className="empty"><b>No live or upcoming sessions</b>Create one from Sessions.</div>}
          <ul className="rows">
            {liveAndUpcoming.map((s, i) => (
              <li key={s.id} className="rowcard" style={{ animationDelay: `${i * 40}ms` }} onClick={() => navigate(`/sessions/${s.id}`)}>
                <span className={`rowicon ${['yellow', 'pink', 'sage', 'blue'][i % 4]}`}><Icon name="monitor" /></span>
                <div className="rowmain">
                  <Link className="rt" to={`/sessions/${s.id}`} onClick={(e) => e.stopPropagation()}>{s.name}</Link>
                  <p>{s.url_patterns.join(', ')} · {scheduleComma(s)} · {candidatesIn(s.id)} candidates</p>
                </div>
                <StatusPill status={sessionStatus(s)} />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
