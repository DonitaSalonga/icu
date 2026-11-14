// Session detail (R19, M1 subset): candidates and attempt status. Risk and verdict columns arrive in M4.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { errorText, supabase } from '../supabase';
import { Alert, formatDateTime } from '../ui';

interface AttemptRow {
  id: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  student: { full_name: string; email: string } | null;
}

export function SessionDetail() {
  const { id } = useParams();
  const [session, setSession] = useState<{ name: string; code: string }>();
  const [rows, setRows] = useState<AttemptRow[]>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    void (async () => {
      const s = await supabase!.from('exam_sessions').select('name, code').eq('id', id!).single();
      if (s.error) return setError(errorText(s.error));
      setSession(s.data);
      const a = await supabase!
        .from('attempts')
        .select('id, status, started_at, ended_at, student:profiles!attempts_student_id_fkey(full_name, email)')
        .eq('session_id', id!)
        .order('created_at');
      if (a.error) return setError(errorText(a.error));
      setRows(a.data as unknown as AttemptRow[]);
    })();
  }, [id]);

  return (
    <div className="flex flex-col gap-4">
      <Link to="/sessions" className="text-sm text-primary underline">← Sessions</Link>
      {error && <Alert>{error}</Alert>}
      {session && <h1 className="text-xl font-semibold">{session.name} <span className="font-mono text-base text-muted">{session.code}</span></h1>}
      {rows && rows.length === 0 && <p className="text-sm text-muted">No candidates have joined yet.</p>}
      {rows && rows.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead className="bg-surface">
            <tr>
              <th scope="col" className="p-2">Candidate</th>
              <th scope="col" className="p-2">Status</th>
              <th scope="col" className="p-2">Started</th>
              <th scope="col" className="p-2">Ended</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border">
                <td className="p-2">
                  <Link className="text-primary underline" to={`/sessions/${id}/attempts/${r.id}`}>{r.student?.full_name ?? 'Unknown'}</Link>
                  <div className="text-xs text-muted">{r.student?.email}</div>
                </td>
                <td className="p-2">{r.status}</td>
                <td className="p-2">{r.started_at ? formatDateTime(r.started_at) : '—'}</td>
                <td className="p-2">{r.ended_at ? formatDateTime(r.ended_at) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
