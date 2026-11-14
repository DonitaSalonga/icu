// Raw attempt view (M1): events in time order and monitoring gaps from server heartbeat times (R14, R20 subset).
// The full candidate review (filters, breakdown, gallery, verdict) arrives in M4.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { findGaps, type Gap } from '@ocm/core';
import { errorText, supabase } from '../supabase';
import { Alert, formatDuration, formatTime } from '../ui';

interface EventRow {
  id: string;
  type: string;
  occurred_at: string;
  details: Record<string, unknown>;
}

type Row = { kind: 'event'; at: number; event: EventRow } | { kind: 'gap'; at: number; gap: Gap };

const LABELS: Record<string, (d: Record<string, unknown>) => string> = {
  exam_tab_hidden: () => 'Left exam tab',
  exam_tab_visible: (d) => `Returned to exam tab · away ${formatDuration(Number(d.away_ms ?? 0))}`,
};

export function AttemptReview() {
  const { id, attemptId } = useParams();
  const [rows, setRows] = useState<Row[]>();
  const [heartbeatCount, setHeartbeatCount] = useState(0);
  const [error, setError] = useState<string>();

  useEffect(() => {
    void (async () => {
      const db = supabase!;
      const [attempt, session, events, heartbeats] = await Promise.all([
        db.from('attempts').select('started_at, ended_at').eq('id', attemptId!).single(),
        db.from('exam_sessions').select('ends_at').eq('id', id!).single(),
        db.from('events').select('id, type, occurred_at, details').eq('attempt_id', attemptId!).order('occurred_at'),
        db.from('heartbeats').select('received_at').eq('attempt_id', attemptId!).order('received_at'),
      ]);
      if (attempt.error) return setError(errorText(attempt.error));
      if (session.error) return setError(errorText(session.error));
      if (events.error) return setError(errorText(events.error));
      if (heartbeats.error) return setError(errorText(heartbeats.error));

      let gaps: Gap[] = [];
      if (attempt.data.started_at) {
        // SDD F6: end = min(ended_at ?? now, session.ends_at)
        const end = Math.min(attempt.data.ended_at ? Date.parse(attempt.data.ended_at) : Date.now(), Date.parse(session.data.ends_at));
        gaps = findGaps(heartbeats.data.map((h) => new Date(h.received_at)), new Date(attempt.data.started_at), new Date(end));
      }
      setHeartbeatCount(heartbeats.data.length);
      setRows(
        [
          ...events.data.map((event): Row => ({ kind: 'event', at: Date.parse(event.occurred_at), event })),
          ...gaps.map((gap): Row => ({ kind: 'gap', at: gap.start.getTime(), gap })),
        ].sort((a, b) => a.at - b.at),
      );
    })();
  }, [id, attemptId]);

  return (
    <div className="flex flex-col gap-4">
      <Link to={`/sessions/${id}`} className="text-sm text-primary underline">← Session</Link>
      <h1 className="text-xl font-semibold">Candidate timeline</h1>
      {error && <Alert>{error}</Alert>}
      <p className="text-sm text-muted">{heartbeatCount} heartbeats received.</p>
      {rows && rows.length === 0 && <p className="text-sm text-muted">No events recorded.</p>}
      {rows && (
        <ol className="flex flex-col gap-1 text-sm">
          {rows.map((r) =>
            r.kind === 'gap' ? (
              <li key={`gap-${r.at}`} className="rounded-sm border-2 border-danger bg-gap p-2 font-semibold">
                Monitoring lost · {formatTime(r.gap.start)} – {formatTime(r.gap.end)} · {formatDuration(r.gap.durationMs)}
              </li>
            ) : (
              <li key={r.event.id} className="flex gap-3 border-b border-border p-2">
                <span className="w-20 font-mono text-muted">{formatTime(r.event.occurred_at)}</span>
                <span>{LABELS[r.event.type]?.(r.event.details) ?? r.event.type}</span>
              </li>
            ),
          )}
        </ol>
      )}
    </div>
  );
}
