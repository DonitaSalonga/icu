// Candidate review (R18, R20–R23; design "Dashboard · Candidate review").
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { findGaps, scoreAttempt, type Gap, type Score } from '@icu/core';
import type { IconName } from '@icu/ui-tokens/icons';
import { avatarFor } from '@icu/ui-tokens/avatars';
import { AiSuggestionCard } from '../components/AiSuggestion';
import { useAdminData } from '../lib/admin-data';
import { deleteAttemptData } from '../lib/deleteAttempt';
import { attemptStatus, SESSION_COLUMNS, type SessionRow } from '../lib/data';
import { eventLabel, TYPE_NAMES } from '../lib/labels';
import { errorText, supabase } from '../supabase';
import { Alert, formatDate, formatDateTime, formatDuration, formatTime, Icon, notify, Overlay, RiskPill, VERDICTS } from '../ui';

interface EventRow {
  id: string;
  type: string;
  occurred_at: string;
  details: Record<string, unknown>;
  screenshot_id: string | null;
}

interface Shot {
  id: string;
  storage_path: string;
  captured_at: string;
  reason: 'interval' | 'violation' | 'site_visit' | 'tab_switch';
  url?: string;
}

interface AttemptRow {
  id: string;
  status: 'joined' | 'active' | 'ended';
  student_id: string;
  started_at: string | null;
  ended_at: string | null;
  verdict: string | null;
  verdict_note: string | null;
  verdict_at: string | null;
  data_deleted_at: string | null;
  student: { full_name: string; email: string } | null;
}

type TimelineRow = { kind: 'event'; at: number; event: EventRow } | { kind: 'gap'; at: number; gap: Gap };

const SIGNED_URL_SECONDS = 3600;
const EVENT_ICON: Record<string, IconName> = {
  exam_tab_hidden: 'camera', exam_tab_visible: 'camera', tab_opened: 'camera',
  navigated_off_exam: 'external', url_visited: 'external', exam_page_changed: 'external',
  copy: 'copy', cut: 'copy', paste: 'copy', context_menu: 'copy',
  warning_shown: 'alert', warning_limit_reached: 'alert', screenshot_failed: 'alert', extension_uninstalled: 'alert',
};
const REASON = { interval: 'Taken on the 60-second interval', violation: 'Taken on a warning', site_visit: 'Taken when another website was on screen', tab_switch: 'Taken when the student switched tabs' } as const;

export function AttemptReview() {
  const { id, attemptId } = useParams();
  const { reload: reloadAll } = useAdminData();
  const [session, setSession] = useState<SessionRow>();
  const [attempt, setAttempt] = useState<AttemptRow>();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [shots, setShots] = useState<Shot[]>([]);
  const [error, setError] = useState<string>();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [lightbox, setLightbox] = useState<number>();

  const load = useCallback(async () => {
    try {
      const db = supabase!;
      const [s, a, ev, hb, sh] = await Promise.all([
        db.from('exam_sessions').select(SESSION_COLUMNS).eq('id', id!).single(),
        db.from('attempts').select('id, status, student_id, started_at, ended_at, verdict, verdict_note, verdict_at, data_deleted_at, student:profiles!attempts_student_id_fkey(full_name, email)').eq('id', attemptId!).single(),
        db.from('events').select('id, type, occurred_at, details, screenshot_id').eq('attempt_id', attemptId!).order('occurred_at'),
        db.from('heartbeats').select('received_at').eq('attempt_id', attemptId!).order('received_at'),
        db.from('screenshots').select('id, storage_path, captured_at, reason').eq('attempt_id', attemptId!).order('captured_at'),
      ]);
      for (const r of [s, a, ev, hb, sh]) if (r.error) throw r.error;
      const sessionRow = s.data as SessionRow;
      const attemptRow = a.data as unknown as AttemptRow;
      setSession(sessionRow);
      setAttempt(attemptRow);
      setEvents((ev.data ?? []) as EventRow[]);
      if (attemptRow.started_at && !attemptRow.data_deleted_at) {
        // SDD F6: end = min(ended_at ?? now, session.ends_at)
        const end = Math.min(attemptRow.ended_at ? Date.parse(attemptRow.ended_at) : Date.now(), Date.parse(sessionRow.ends_at));
        setGaps(findGaps((hb.data ?? []).map((h) => new Date(h.received_at)), new Date(attemptRow.started_at), new Date(end)));
      } else {
        setGaps([]);
      }
      const shotRows = (sh.data ?? []) as Shot[];
      if (shotRows.length) {
        const { data: urls, error: urlError } = await db.storage.from('screenshots').createSignedUrls(shotRows.map((x) => x.storage_path), SIGNED_URL_SECONDS);
        if (urlError) throw urlError;
        const byPath = new Map(urls.map((u) => [u.path, u.signedUrl]));
        setShots(shotRows.map((x) => ({ ...x, url: byPath.get(x.storage_path) ?? undefined })));
      } else {
        setShots([]);
      }
    } catch (e) {
      setError(errorText(e as { message: string }));
    }
  }, [id, attemptId]);

  useEffect(() => void load(), [load]);

  const score: Score | undefined = useMemo(() => (session ? scoreAttempt(events, gaps.length, session) : undefined), [events, gaps, session]);
  const timeline = useMemo<TimelineRow[]>(
    () =>
      [
        ...events.map((event): TimelineRow => ({ kind: 'event', at: Date.parse(event.occurred_at), event })),
        ...gaps.map((gap): TimelineRow => ({ kind: 'gap', at: gap.start.getTime(), gap })),
      ].sort((x, y) => x.at - y.at),
    [events, gaps],
  );
  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of events) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
    if (gaps.length) counts.set('monitoring_lost', gaps.length);
    return [...counts.entries()];
  }, [events, gaps]);

  if (error) return <Alert>{error}</Alert>;
  if (!session || !attempt || !score) return <div className="empty" role="status"><b>Loading…</b></div>;

  const visible = timeline.filter((r) => !hidden.has(r.kind === 'gap' ? 'monitoring_lost' : r.event.type));
  const shotIndex = (shotId: string | null) => shots.findIndex((s) => s.id === shotId);
  const notFullscreen = attempt.started_at && !attempt.data_deleted_at && !events.some((e) => e.type === 'fullscreen_enter');
  const refresh = () => { void load(); void reloadAll(); };

  return (
    <>
      <div className="head">
        <div>
          <h1 className="h1" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <img className="avatar" src={avatarFor(attempt.student_id)} alt="" style={{ width: 56, height: 56 }} />
            {attempt.student?.full_name ?? 'Candidate'}
          </h1>
          <p className="sub">
            <span>{attempt.student?.email}</span>
            <span>{attemptStatus(attempt, session)}</span>
            {attempt.started_at && <span>Started {formatDateTime(attempt.started_at)}{attempt.ended_at ? ` · ended ${formatDateTime(attempt.ended_at)}` : ''}</span>}
          </p>
        </div>
        <RiskPill level={score.level} score={score.score} />
      </div>
      <Findings events={events} gaps={gaps.length} notFullscreen={Boolean(notFullscreen)} forcedHigh={score.forcedHigh} deletedAt={attempt.data_deleted_at} />

      <div className="cols">
        <div style={{ display: 'grid', gap: 24, minWidth: 0 }}>
          <section className="card pc pink" aria-labelledby="tlh">
            <h2 id="tlh" style={{ marginBottom: 16 }}>Timeline</h2>
            {typeCounts.length > 0 && (
              <div role="group" aria-label="Filter event types" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                {typeCounts.map(([type, n]) => {
                  const on = !hidden.has(type);
                  return (
                    <button
                      key={type}
                      type="button"
                      className="tag"
                      aria-pressed={on}
                      style={on ? { cursor: 'pointer' } : { cursor: 'pointer', background: 'var(--surface)', borderColor: 'var(--line-strong)', color: 'var(--muted)' }}
                      onClick={() => setHidden((h) => { const next = new Set(h); if (on) next.add(type); else next.delete(type); return next; })}
                    >
                      {TYPE_NAMES[type] ?? type} · {n}
                    </button>
                  );
                })}
              </div>
            )}
            {visible.length === 0 ? (
              <div className="empty"><b>No events recorded</b></div>
            ) : (
              <ol className="scrollbox tlbox" tabIndex={0} aria-label="Timeline events" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {visible.map((r) =>
                  r.kind === 'gap' ? (
                    <li key={`gap-${r.at}`} className="alertrow">
                      <Icon name="alert" size={18} /> Monitoring lost · {formatTime(r.gap.start)} – {formatTime(r.gap.end)} · {formatDuration(r.gap.durationMs)}
                    </li>
                  ) : (
                    <li key={r.event.id} className="tl">
                      <time dateTime={r.event.occurred_at}>{formatTime(r.event.occurred_at)}</time>
                      <span className="ico"><Icon name={EVENT_ICON[r.event.type] ?? 'monitor'} size={18} /></span>
                      <span className="tx">{eventLabel(r.event.type, r.event.details)}</span>
                      {shotIndex(r.event.screenshot_id) >= 0 && (
                        <button type="button" className="btn s sm" onClick={() => setLightbox(shotIndex(r.event.screenshot_id))}>Screenshot</button>
                      )}
                    </li>
                  ),
                )}
              </ol>
            )}
          </section>

          <section className="card pc blue" aria-labelledby="sh">
            <h2 id="sh" style={{ marginBottom: 16 }}>Screenshots ({shots.length})</h2>
            {shots.length === 0 ? (
              <div className="empty"><b>No screenshots</b></div>
            ) : (
              <div className="scrollbox shotbox" tabIndex={0} aria-label="Screenshots" role="group" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 16 }}>
                {shots.map((s, i) => (
                  <button key={s.id} type="button" className="shot" aria-label={`Open screenshot at ${formatTime(s.captured_at)}`} onClick={() => setLightbox(i)}>
                    {s.url && <img src={s.url} loading="lazy" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
                    <span>{formatTime(s.captured_at)}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
          {!attempt.data_deleted_at && <DeleteData sessionId={session.id} attempt={attempt} onDeleted={() => { notify('Candidate data deleted.'); refresh(); }} />}
        </div>

        <div className="sticky" style={{ display: 'grid', gap: 24 }}>
          <Breakdown score={score} />
          {!attempt.data_deleted_at && <AiSuggestionCard attemptId={attempt.id} canAnalyze={Boolean(attempt.started_at)} />}
          <VerdictCard attempt={attempt} onSaved={() => { notify('Verdict saved.'); refresh(); }} />
        </div>
      </div>

      <Lightbox shots={shots} events={events} index={lightbox} onClose={() => setLightbox(undefined)} />
    </>
  );
}

const count = (events: EventRow[], type: string) => events.filter((e) => e.type === type).length;
const times = (n: number) => (n === 1 ? 'once' : `${n} times`);

/** One bar summarising what the candidate did (feedback 2026-11-15), instead of separate notes. */
function Findings({ events, gaps, notFullscreen, forcedHigh, deletedAt }: { events: EventRow[]; gaps: number; notFullscreen: boolean; forcedHigh: boolean; deletedAt: string | null }) {
  const sites = new Set(events.filter((e) => e.type === 'url_visited').map((e) => `${String(e.details.host ?? '')}${String(e.details.path ?? '')}`)).size;
  const items: { text: string; icon: IconName; tone?: 'alert' }[] = [];
  if (deletedAt) items.push({ text: `Data deleted on ${formatDate(deletedAt)}`, icon: 'alert' });
  if (forcedHigh) items.push({ text: 'Warning limit reached · High regardless of score', icon: 'alert', tone: 'alert' });
  if (notFullscreen) items.push({ text: 'Never entered fullscreen', icon: 'monitor', tone: 'alert' });
  const left = count(events, 'exam_tab_hidden');
  if (left) items.push({ text: `Left the exam tab ${times(left)}`, icon: 'camera' });
  if (sites) items.push({ text: `Visited ${sites} other site${sites === 1 ? '' : 's'}`, icon: 'external' });
  const paste = count(events, 'paste');
  if (paste) items.push({ text: `Pasted ${times(paste)}`, icon: 'copy' });
  const blur = count(events, 'window_blur');
  if (blur) items.push({ text: `Left the browser ${times(blur)}`, icon: 'monitor' });
  const fsExit = count(events, 'fullscreen_exit');
  if (fsExit) items.push({ text: `Left fullscreen ${times(fsExit)}`, icon: 'monitor' });
  if (gaps) items.push({ text: `Monitoring lost ${times(gaps)}`, icon: 'alert', tone: 'alert' });
  const stopped = count(events, 'screen_share_stopped');
  if (stopped) items.push({ text: `Stopped screen sharing ${times(stopped)}`, icon: 'alert', tone: 'alert' });
  return (
    <section className="findings pc yellow" aria-label="Summary of findings">
      <span className="fl">Findings</span>
      <ul>
        {items.length === 0 ? <li className="fi ok"><Icon name="check" size={16} /> Nothing unusual recorded</li> : items.map((it) => (
          <li key={it.text} className={`fi ${it.tone ?? ''}`}><Icon name={it.icon} size={16} /> {it.text}</li>
        ))}
      </ul>
    </section>
  );
}

function Breakdown({ score }: { score: Score }) {
  const cell = { paddingLeft: 0 };
  return (
    <section className="card pc sage" aria-labelledby="rb">
      <div className="cardhead"><h2 id="rb">Risk breakdown</h2><span className="num" style={{ fontSize: 40, fontWeight: 700, letterSpacing: '-.03em' }} aria-label={`Score ${score.score}`}>{score.score}</span></div>
      <table className="t">
        <thead>
          <tr>
            <th scope="col" style={{ background: 'none', paddingLeft: 0 }}>Type</th>
            <th scope="col" style={{ background: 'none', textAlign: 'right' }}>Count</th>
            <th scope="col" style={{ background: 'none', textAlign: 'right' }}>Points</th>
          </tr>
        </thead>
        <tbody>
          {score.breakdown.filter((r) => r.points > 0).map((r) => (
            <tr key={r.type}>
              <td style={cell}>{TYPE_NAMES[r.type] ?? r.type}</td>
              <td className="num" style={{ textAlign: 'right' }}>{r.count}</td>
              <td className="num" style={{ textAlign: 'right' }}>{r.points}</td>
            </tr>
          ))}
          <tr>
            <td style={{ paddingLeft: 0, fontWeight: 700, borderTop: '2px solid var(--ink)' }}>Total</td>
            <td style={{ borderTop: '2px solid var(--ink)' }} />
            <td className="num" style={{ textAlign: 'right', fontWeight: 700, borderTop: '2px solid var(--ink)' }}>{score.score}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

function VerdictCard({ attempt, onSaved }: { attempt: AttemptRow; onSaved: () => void }) {
  const [verdict, setVerdict] = useState(attempt.verdict ?? '');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setError(undefined);
    setSaving(true);
    // The design has no note field; an existing note is kept as it is.
    const { error } = await supabase!.rpc('set_verdict', { p_attempt_id: attempt.id, p_verdict: verdict, p_note: attempt.verdict_note });
    setSaving(false);
    if (error) return setError(errorText(error));
    onSaved();
  };

  return (
    <section className="card pc pink" aria-labelledby="vd">
      <h2 id="vd" style={{ marginBottom: 14 }}>Your verdict</h2>
      <div role="radiogroup" aria-labelledby="vd">
        {VERDICTS.map((v) => (
          <label key={v.value} className={`radio ${verdict === v.value ? 'on' : ''}`}>
            <input type="radio" name="v" value={v.value} checked={verdict === v.value} onChange={() => setVerdict(v.value)} />
            {v.label}
          </label>
        ))}
      </div>
      {error && <p className="err" role="alert">{error}</p>}
      {attempt.verdict_at && <p className="hint" style={{ margin: '4px 0 0' }}>Last saved {formatDateTime(attempt.verdict_at)}</p>}
      <button type="button" className="btn p" style={{ width: '100%', marginTop: 8 }} disabled={!verdict || saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save verdict'}</button>
    </section>
  );
}

const HOLD_MS = 1400;

/** R23: press and hold (pointer, or Enter/Space) for 1.4 s to delete the candidate's data. A button under the
 *  screenshots (feedback 2026-11-15) instead of a "Danger zone" card; once deleted, Findings says so. */
function DeleteData({ sessionId, attempt, onDeleted }: { sessionId: string; attempt: AttemptRow; onDeleted: () => void }) {
  const [holding, setHolding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const run = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await deleteAttemptData(supabase!, sessionId, attempt.id);
      onDeleted();
    } catch (e) {
      setError(`${errorText(e as { message: string })} Nothing else was lost; try again.`);
    } finally {
      setBusy(false);
    }
  };
  const start = () => {
    if (timer.current || busy) return;
    setHolding(true);
    timer.current = setTimeout(() => { timer.current = undefined; setHolding(false); void run(); }, HOLD_MS);
  };
  const end = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = undefined; }
    setHolding(false);
  };

  return (
    <div className="delrow">
      <button
        type="button"
        className={`btn d hold ${holding ? 'go' : ''}`}
        disabled={busy}
        onPointerDown={start}
        onPointerUp={end}
        onPointerLeave={end}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!e.repeat) start(); } }}
        onKeyUp={end}
      >
        <span className="fill" />
        <span className="lbl2" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}><Icon name="alert" size={18} /> {busy ? 'Deleting…' : 'Hold to delete candidate data'}</span>
      </button>
      <span className="hint" style={{ margin: 0 }}>Removes the screenshots and events. This cannot be undone.</span>
      {error && <p className="err" role="alert" style={{ width: '100%' }}>{error}</p>}
    </div>
  );
}

function Lightbox({ shots, events, index, onClose }: { shots: Shot[]; events: EventRow[]; index?: number; onClose: () => void }) {
  const shot = index !== undefined ? shots[index] : undefined;
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (shot) close.current?.focus();
  }, [shot]);
  const linked = shot ? events.filter((e) => e.screenshot_id === shot.id) : [];
  const title = shot ? `Screenshot · ${formatTime(shot.captured_at)}${linked.length ? ` · ${linked.map((e) => eventLabel(e.type, e.details)).join(', ')}` : ''}` : 'Screenshot';
  return (
    <Overlay>
      <div className={`lbox ${shot ? 'open' : ''}`} role="dialog" aria-modal="true" aria-label="Screenshot preview" aria-hidden={!shot} onKeyDown={(e) => e.key === 'Escape' && onClose()} {...(shot ? {} : { inert: '' })}>
        <div className="pane">
          <div className="cardhead" style={{ marginBottom: 12 }}>
            <b>{title}</b>
            <button ref={close} type="button" className="btn s sm" onClick={onClose}>Close</button>
          </div>
          <div style={{ aspectRatio: '16/10', borderRadius: 12, background: 'var(--sunken)', position: 'relative', overflow: 'hidden' }}>
            {shot?.url && <img src={shot.url} alt={`Screenshot at ${formatTime(shot.captured_at)}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />}
          </div>
          {shot && <p className="hint">{REASON[shot.reason]} · {formatDateTime(shot.captured_at)}</p>}
        </div>
      </div>
    </Overlay>
  );
}
