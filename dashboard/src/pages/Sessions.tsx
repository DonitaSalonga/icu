// Sessions list and minimal create form (R4, R5). M4 adds the full form and candidate counts.
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { isValidExamPattern } from '@ocm/core';
import { errorText, supabase } from '../supabase';
import { Alert, Button, Field, formatDateTime } from '../ui';

interface SessionRow {
  id: string;
  name: string;
  code: string;
  starts_at: string;
  ends_at: string;
}

const statusOf = (s: SessionRow) => {
  const now = Date.now();
  if (now < Date.parse(s.starts_at)) return 'Upcoming';
  if (now < Date.parse(s.ends_at)) return 'Active';
  return 'Ended';
};

export function Sessions() {
  const [rows, setRows] = useState<SessionRow[]>();
  const [error, setError] = useState<string>();
  const [created, setCreated] = useState<string>();

  const load = useCallback(async () => {
    const { data, error } = await supabase!.from('exam_sessions').select('id, name, code, starts_at, ends_at').order('starts_at', { ascending: false });
    if (error) setError(errorText(error));
    else setRows(data);
  }, []);

  useEffect(() => void load(), [load]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Exam sessions</h1>
      <CreateSession onCreated={(code) => { setCreated(code); void load(); }} />
      {created && (
        <p role="status" className="rounded-md bg-risk-low-bg p-3 text-sm text-risk-low-fg">
          Session created. Give students this code: <span className="font-mono text-code">{created}</span>
        </p>
      )}
      {error && <Alert>{error}</Alert>}
      {rows && rows.length === 0 && <p className="text-sm text-muted">No sessions yet. Create your first one above.</p>}
      {rows && rows.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead className="bg-surface">
            <tr>
              <th scope="col" className="p-2">Name</th>
              <th scope="col" className="p-2">Code</th>
              <th scope="col" className="p-2">Window</th>
              <th scope="col" className="p-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className="border-b border-border">
                <td className="p-2"><Link className="text-primary underline" to={`/sessions/${s.id}`}>{s.name}</Link></td>
                <td className="p-2 font-mono">{s.code}</td>
                <td className="p-2">{formatDateTime(s.starts_at)} – {formatDateTime(s.ends_at)}</td>
                <td className="p-2">{statusOf(s)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function CreateSession({ onCreated }: { onCreated: (code: string) => void }) {
  const [name, setName] = useState('');
  const [pattern, setPattern] = useState('https://docs.google.com/forms/*');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [error, setError] = useState<string>();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(undefined);
    if (!isValidExamPattern(pattern)) return setError('The URL pattern must look like https://docs.google.com/forms/*');
    const { data, error } = await supabase!.rpc('create_session', {
      p_name: name,
      p_url_patterns: [pattern.trim()],
      p_starts_at: new Date(startsAt).toISOString(),
      p_ends_at: new Date(endsAt).toISOString(),
    });
    if (error) return setError(errorText(error));
    onCreated((data as { code: string }).code);
  };

  return (
    <form className="grid max-w-3xl grid-cols-1 gap-3 rounded-md border border-border p-4 md:grid-cols-2" onSubmit={(e) => void submit(e)}>
      <Field id="s-name" label="Name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
      <div className="flex flex-col gap-1">
        <Field id="s-pattern" label="Exam URL pattern" value={pattern} onChange={(e) => setPattern(e.target.value)} required />
        <p className="text-xs text-muted">Use * as a wildcard, e.g. https://docs.google.com/forms/*</p>
      </div>
      <Field id="s-start" label="Starts" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
      <Field id="s-end" label="Ends" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required />
      {error && <div className="md:col-span-2"><Alert>{error}</Alert></div>}
      <div><Button type="submit">Create session</Button></div>
    </form>
  );
}
