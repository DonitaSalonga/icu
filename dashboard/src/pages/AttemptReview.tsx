// Candidate review (R18, R20–R23; DSD § Layout "Candidate review").
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { findGaps, scoreAttempt, type Gap, type Score } from '@icu/core';
import { AiSuggestionCard } from '../components/AiSuggestion';
import { deleteAttemptData } from '../lib/deleteAttempt';
import { attemptStatus, SESSION_COLUMNS, type SessionRow } from '../lib/data';
import { eventLabel, TYPE_NAMES } from '../lib/labels';
import { errorText, supabase } from '../supabase';
import { Alert, Button, Dialog, formatDate, formatDateTime, formatDuration, formatTime, RiskBadge, Toast, VERDICTS } from '../ui';

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
const REASON_SHORT = { interval: 'interval', violation: 'on warning', site_visit: 'site visit', tab_switch: 'tab switch' } as const;
const REASON_LONG = { interval: 'Taken on the 60-second interval', violation: 'Taken on a warning', site_visit: 'Taken when another website was on screen', tab_switch: 'Taken when the student switched tabs' } as const;

export function AttemptReview() {
  const { id, attemptId } = useParams();
  const [session, setSession] = useState<SessionRow>();
  const [attempt, setAttempt] = useState<AttemptRow>();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [shots, setShots] = useState<Shot[]>([]);
  const [error, setError] = useState<string>();
  const [toast, setToast] = useState<string>();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [lightbox, setLightbox] = useState<number>();

  const load = useCallback(async () => {
    try {
      const db = supabase!;
      const [s, a, ev, hb, sh] = await Promise.all([
        db.from('exam_sessions').select(SESSION_COLUMNS).eq('id', id!).single(),
        db.from('attempts').select('id, status, started_at, ended_at, verdict, verdict_note, verdict_at, data_deleted_at, student:profiles!attempts_student_id_fkey(full_name, email)').eq('id', attemptId!).single(),
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

  const visible = timeline.filter((r) => !hidden.has(r.kind === 'gap' ? 'monitoring_lost' : r.event.type));
  const shotIndex = (shotId: string | null) => shots.findIndex((s) => s.id === shotId);
  const notFullscreen = attempt?.started_at && !attempt.data_deleted_at && !events.some((e) => e.type === 'fullscreen_enter');

  if (error) return <Alert>{error}</Alert>;
  if (!session || !attempt || !score) return <p className="text-sm text-muted">Loading…</p>;

  return (
    <div className="flex flex-col gap-6">
      <Link to={`/sessions/${id}`} className="text-sm text-primary underline">← {session.name}</Link>
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-xl font-semibold">{attempt.student?.full_name ?? 'Candidate'}</h1>
        <span className="text-sm text-muted">{attempt.student?.email}</span>
        <RiskBadge level={score.level} score={score.score} />
        <span className="text-sm">{attemptStatus(attempt, session)}</span>
        {attempt.started_at && <span className="text-sm text-muted">Started {formatDateTime(attempt.started_at)}{attempt.ended_at ? ` · ended ${formatDateTime(attempt.ended_at)}` : ''}</span>}
      </header>

      {attempt.data_deleted_at && (
        <p role="status" className="rounded-md border border-border bg-surface p-3 text-sm">Data deleted on {formatDate(attempt.data_deleted_at)}.</p>
      )}
      {notFullscreen && <p className="rounded-md bg-risk-med-bg p-3 text-sm text-risk-med-fg">Not in fullscreen: the exam window never entered fullscreen during this attempt.</p>}
      {score.forcedHigh && <p className="rounded-md bg-risk-high-bg p-3 text-sm text-risk-high-fg">The warning limit was reached, so this candidate is High risk regardless of score.</p>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <aside className="order-first flex flex-col gap-6 lg:order-last lg:col-span-4">
          {!attempt.data_deleted_at && <AiSuggestionCard attemptId={attempt.id} canAnalyze={Boolean(attempt.started_at)} />}
          <Breakdown score={score} />
          <VerdictForm attempt={attempt} onSaved={(msg) => { setToast(msg); void load(); }} />
          {!attempt.data_deleted_at && session && (
            <DeleteData sessionId={session.id} attemptId={attempt.id} onDeleted={() => { setToast('Candidate data deleted.'); void load(); }} />
          )}
        </aside>

        <section className="flex flex-col gap-4 lg:col-span-8" aria-labelledby="timeline-heading">
          <h2 id="timeline-heading" className="text-lg font-semibold">Timeline</h2>
          {typeCounts.length > 0 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filter event types">
              {typeCounts.map(([type, n]) => {
                const on = !hidden.has(type);
                return (
                  <button
                    key={type}
                    aria-pressed={on}
                    onClick={() => setHidden((h) => { const next = new Set(h); if (on) next.add(type); else next.delete(type); return next; })}
                    className={`min-h-[28px] rounded-full border px-3 text-xs ${on ? 'border-primary bg-primary text-primary-on' : 'border-border-strong bg-bg text-muted'}`}
                  >
                    {TYPE_NAMES[type] ?? type} · {n}
                  </button>
                );
              })}
            </div>
          )}
          {visible.length === 0 ? (
            <p className="text-sm text-muted">No events recorded.</p>
          ) : (
            <ol className="flex flex-col text-sm">
              {visible.map((r) =>
                r.kind === 'gap' ? (
                  <li key={`gap-${r.at}`} className="my-1 rounded-sm border-2 border-danger bg-gap p-2 font-semibold">
                    Monitoring lost · {formatTime(r.gap.start)} – {formatTime(r.gap.end)} · {formatDuration(r.gap.durationMs)}
                  </li>
                ) : (
                  <li key={r.event.id} className="flex items-center gap-3 border-b border-border py-2">
                    <time className="w-20 shrink-0 font-mono text-muted" dateTime={r.event.occurred_at}>{formatTime(r.event.occurred_at)}</time>
                    <span className="flex-1">{eventLabel(r.event.type, r.event.details)}</span>
                    {shotIndex(r.event.screenshot_id) >= 0 && (
                      <button className="text-xs text-primary underline" onClick={() => setLightbox(shotIndex(r.event.screenshot_id))}>
                        Screenshot
                      </button>
                    )}
                  </li>
                ),
              )}
            </ol>
          )}

          <h2 className="mt-4 text-lg font-semibold">Screenshots ({shots.length})</h2>
          {shots.length === 0 ? (
            <p className="text-sm text-muted">No screenshots.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {shots.map((s, i) => (
                <li key={s.id}>
                  <button className="flex w-full flex-col gap-1 text-left" onClick={() => setLightbox(i)}>
                    {s.url ? (
                      <img src={s.url} loading="lazy" alt={`Screenshot at ${formatTime(s.captured_at)}, ${s.reason}`} className="aspect-video w-full rounded-lg border border-border object-cover" />
                    ) : (
                      <span className="flex aspect-video w-full items-center justify-center rounded-lg border border-border text-xs text-muted">Image unavailable</span>
                    )}
                    <span className="text-xs text-muted">{formatTime(s.captured_at)} · {REASON_SHORT[s.reason]}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <Lightbox shots={shots} events={events} index={lightbox} onIndex={setLightbox} />
      <Toast message={toast} onDone={() => setToast(undefined)} />
    </div>
  );
}

function Breakdown({ score }: { score: Score }) {
  return (
    <section className="rounded-md border border-border p-4" aria-labelledby="breakdown-heading">
      <h2 id="breakdown-heading" className="mb-2 text-lg font-semibold">Risk breakdown</h2>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-muted">
            <th scope="col" className="py-1 font-normal">Type</th>
            <th scope="col" className="py-1 text-right font-normal">Count</th>
            <th scope="col" className="py-1 text-right font-normal">Points</th>
          </tr>
        </thead>
        <tbody>
          {score.breakdown.filter((r) => r.points > 0).map((r) => (
            <tr key={r.type} className="border-t border-border">
              <td className="py-1">{TYPE_NAMES[r.type] ?? r.type}</td>
              <td className="py-1 text-right">{r.count}</td>
              <td className="py-1 text-right">{r.points}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-text font-semibold">
            <td className="py-1">Total</td>
            <td />
            <td className="py-1 text-right">{score.score}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

function VerdictForm({ attempt, onSaved }: { attempt: AttemptRow; onSaved: (msg: string) => void }) {
  const [verdict, setVerdict] = useState(attempt.verdict ?? '');
  const [note, setNote] = useState(attempt.verdict_note ?? '');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setError(undefined);
    if (!verdict) return setError('Choose a verdict.');
    setSaving(true);
    const { error } = await supabase!.rpc('set_verdict', { p_attempt_id: attempt.id, p_verdict: verdict, p_note: note });
    setSaving(false);
    if (error) return setError(errorText(error));
    onSaved('Verdict saved.');
  };

  return (
    <section className="rounded-md border border-border p-4" aria-labelledby="verdict-heading">
      <h2 id="verdict-heading" className="mb-2 text-lg font-semibold">Verdict</h2>
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Verdict</legend>
        {VERDICTS.map((v) => (
          <label key={v.value} className="flex items-center gap-2 text-sm">
            <input type="radio" name="verdict" value={v.value} checked={verdict === v.value} onChange={() => setVerdict(v.value)} />
            {v.label}
          </label>
        ))}
      </fieldset>
      <label htmlFor="verdict-note" className="mt-3 block text-sm font-semibold">Note (optional)</label>
      <textarea id="verdict-note" className="mt-1 w-full rounded-sm border border-border-strong p-2 text-sm" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
      <p className="text-xs text-muted">{note.length} / 1000</p>
      {error && <Alert>{error}</Alert>}
      {attempt.verdict_at && <p className="mt-1 text-xs text-muted">Last saved {formatDateTime(attempt.verdict_at)}</p>}
      <Button className="mt-2" onClick={() => void save()} disabled={saving}>{saving ? 'Saving…' : 'Save verdict'}</Button>
    </section>
  );
}

function DeleteData({ sessionId, attemptId, onDeleted }: { sessionId: string; attemptId: string; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await deleteAttemptData(supabase!, sessionId, attemptId);
      setOpen(false);
      onDeleted();
    } catch (e) {
      setError(`${errorText(e as { message: string })} Nothing else was lost; try again.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-md border border-border p-4" aria-labelledby="delete-heading">
      <h2 id="delete-heading" className="mb-2 text-lg font-semibold">Delete data</h2>
      <p className="mb-2 text-sm text-muted">Removes this candidate's events, heartbeats and screenshots now, instead of after 30 days. The verdict stays.</p>
      <Button variant="danger" onClick={() => { setTyped(''); setOpen(true); }}>Delete candidate data</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Delete this candidate's data?">
        <p className="text-sm">This permanently deletes all events, heartbeats and screenshots for this attempt. It can't be undone.</p>
        <label htmlFor="confirm-delete" className="text-sm font-semibold">Type DELETE to confirm</label>
        <input id="confirm-delete" className="min-h-[36px] rounded-sm border border-border-strong px-3 text-sm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        {error && <Alert>{error}</Alert>}
        <div className="flex gap-2">
          <Button variant="danger" disabled={typed !== 'DELETE' || busy} onClick={() => void run()}>{busy ? 'Deleting…' : 'Delete'}</Button>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
        </div>
      </Dialog>
    </section>
  );
}

function Lightbox({ shots, events, index, onIndex }: { shots: Shot[]; events: EventRow[]; index?: number; onIndex: (i?: number) => void }) {
  const shot = index !== undefined ? shots[index] : undefined;
  const linked = shot ? events.filter((e) => e.screenshot_id === shot.id) : [];
  return (
    <Dialog open={shot !== undefined} onClose={() => onIndex(undefined)} title={shot ? `Screenshot at ${formatTime(shot.captured_at)}` : 'Screenshot'}>
      {shot && (
        <>
          {shot.url ? (
            <img src={shot.url} alt={`Screenshot at ${formatTime(shot.captured_at)}, ${shot.reason}`} className="max-h-[60vh] w-full rounded-lg border border-border object-contain" />
          ) : (
            <p className="text-sm text-muted">Image unavailable.</p>
          )}
          <p className="text-sm text-muted">{REASON_LONG[shot.reason]} · {formatDateTime(shot.captured_at)}</p>
          {linked.length > 0 && (
            <ul className="list-disc pl-5 text-sm">
              {linked.map((e) => (
                <li key={e.id}>{formatTime(e.occurred_at)} · {eventLabel(e.type, e.details)}</li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <Button variant="secondary" disabled={index === 0} onClick={() => onIndex((index ?? 0) - 1)}>Previous</Button>
            <Button variant="secondary" disabled={index === shots.length - 1} onClick={() => onIndex((index ?? 0) + 1)}>Next</Button>
            <Button variant="secondary" onClick={() => onIndex(undefined)}>Close</Button>
          </div>
        </>
      )}
    </Dialog>
  );
}
