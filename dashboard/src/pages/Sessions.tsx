// Sessions list and Create session dialog (R4, R5; DSD § Layout "Sessions list").
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { isValidExamPattern } from '@ocm/core';
import { loadSummaries, SESSION_COLUMNS, sessionStatus, type SessionRow } from '../lib/data';
import { errorText, supabase } from '../supabase';
import { Alert, Button, Dialog, Field, formatDateTime } from '../ui';

type Row = SessionRow & { candidates: number; high: number };

export function Sessions() {
  const [rows, setRows] = useState<Row[]>();
  const [error, setError] = useState<string>();
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{ name: string; code: string }>();

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase!.from('exam_sessions').select(SESSION_COLUMNS).order('starts_at', { ascending: false });
      if (error) throw error;
      const withCounts = await Promise.all(
        (data as SessionRow[]).map(async (s) => {
          const attempts = await loadSummaries(s);
          return { ...s, candidates: attempts.length, high: attempts.filter((a) => a.risk.level === 'high').length };
        }),
      );
      setRows(withCounts);
    } catch (e) {
      setError(errorText(e as { message: string }));
    }
  }, []);

  useEffect(() => void load(), [load]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Exam sessions</h1>
        <Button onClick={() => setCreating(true)}>Create session</Button>
      </div>
      {created && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-md bg-risk-low-bg p-4 text-sm text-risk-low-fg">
          <span>“{created.name}” created. Give students this code:</span>
          <span className="font-mono text-code">{created.code}</span>
          <Button variant="secondary" onClick={() => void navigator.clipboard.writeText(created.code)}>Copy code</Button>
        </div>
      )}
      {error && <Alert>{error}</Alert>}
      {!rows && !error && <p className="text-sm text-muted">Loading…</p>}
      {rows?.length === 0 && (
        <div className="flex flex-col items-start gap-3 rounded-md border border-border p-6">
          <p className="text-sm">No sessions yet. Create one, then give students its code.</p>
          <Button onClick={() => setCreating(true)}>Create session</Button>
        </div>
      )}
      {rows && rows.length > 0 && (
        <>
          <table className="hidden w-full text-left text-sm md:table">
            <thead className="bg-surface">
              <tr>
                {['Name', 'Code', 'Window', 'Status', 'Candidates', 'High risk'].map((h) => (
                  <th key={h} scope="col" className="p-2">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-b border-border hover:bg-surface">
                  <td className="p-2"><Link className="text-primary underline" to={`/sessions/${s.id}`}>{s.name}</Link></td>
                  <td className="p-2 font-mono">{s.code}</td>
                  <td className="p-2">{formatDateTime(s.starts_at)} – {formatDateTime(s.ends_at)}</td>
                  <td className="p-2">{sessionStatus(s)}</td>
                  <td className="p-2">{s.candidates}</td>
                  <td className="p-2">{s.high}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="flex flex-col gap-3 md:hidden">
            {rows.map((s) => (
              <li key={s.id} className="rounded-md border border-border p-4 text-sm shadow-1">
                <Link className="font-semibold text-primary underline" to={`/sessions/${s.id}`}>{s.name}</Link>
                <p className="font-mono">{s.code} · {sessionStatus(s)}</p>
                <p className="text-muted">{formatDateTime(s.starts_at)} – {formatDateTime(s.ends_at)}</p>
                <p>{s.candidates} candidates · {s.high} high risk</p>
              </li>
            ))}
          </ul>
        </>
      )}
      <CreateSessionDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(name, code) => {
          setCreating(false);
          setCreated({ name, code });
          void load();
        }}
      />
    </div>
  );
}

const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

function CreateSessionDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (name: string, code: string) => void }) {
  const now = new Date();
  const [name, setName] = useState('');
  const [patterns, setPatterns] = useState(['https://docs.google.com/forms/*']);
  const [startsAt, setStartsAt] = useState(toLocalInput(now));
  const [endsAt, setEndsAt] = useState(toLocalInput(new Date(now.getTime() + 60 * 60_000)));
  const [warningLimit, setWarningLimit] = useState('3');
  const [medium, setMedium] = useState('10');
  const [high, setHigh] = useState('25');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Enter a name.';
    patterns.forEach((p, i) => {
      if (!isValidExamPattern(p)) e[`pattern${i}`] = 'Use the form https://site.com/path/* (scheme, host, optional path).';
    });
    if (!startsAt) e.starts = 'Choose a start time.';
    if (!endsAt || (startsAt && new Date(endsAt) <= new Date(startsAt))) e.ends = 'The end must be after the start.';
    const wl = Number(warningLimit);
    if (!Number.isInteger(wl) || wl < 1 || wl > 10) e.warningLimit = 'Choose a whole number from 1 to 10.';
    const m = Number(medium);
    const h = Number(high);
    if (!Number.isInteger(m) || m <= 0) e.medium = 'Must be a whole number above 0.';
    if (!Number.isInteger(h) || h <= m) e.high = 'Must be a whole number above the Medium threshold.';
    return e;
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    setServerError(undefined);
    if (Object.keys(e).length) return;
    setSaving(true);
    const { data, error } = await supabase!.rpc('create_session', {
      p_name: name.trim(),
      p_url_patterns: patterns.map((p) => p.trim()),
      p_starts_at: new Date(startsAt).toISOString(),
      p_ends_at: new Date(endsAt).toISOString(),
      p_warning_limit: Number(warningLimit),
      p_threshold_medium: Number(medium),
      p_threshold_high: Number(high),
    });
    setSaving(false);
    if (error) return setServerError(errorText(error));
    onCreated(name.trim(), (data as { code: string }).code);
    setName('');
  };

  return (
    <Dialog open={open} onClose={onClose} title="Create exam session">
      <form className="grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={(e) => void submit(e)} noValidate>
        <div className="md:col-span-2">
          <Field id="s-name" label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} error={errors.name} />
        </div>
        <fieldset className="flex flex-col gap-2 md:col-span-2">
          <legend className="text-sm font-semibold">Exam URL patterns</legend>
          <p className="text-xs text-muted">Use * as a wildcard, e.g. https://docs.google.com/forms/* . Monitoring applies only to matching pages.</p>
          {patterns.map((p, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="flex-1">
                <Field
                  id={`s-pattern-${i}`}
                  label={`Pattern ${i + 1}`}
                  value={p}
                  onChange={(e) => setPatterns(patterns.map((x, j) => (j === i ? e.target.value : x)))}
                  error={errors[`pattern${i}`]}
                />
              </div>
              {patterns.length > 1 && (
                <Button type="button" variant="secondary" className="mt-6" aria-label={`Remove pattern ${i + 1}`} onClick={() => setPatterns(patterns.filter((_, j) => j !== i))}>
                  Remove
                </Button>
              )}
            </div>
          ))}
          {patterns.length < 10 && (
            <Button type="button" variant="secondary" className="self-start" onClick={() => setPatterns([...patterns, 'https://'])}>Add pattern</Button>
          )}
        </fieldset>
        <Field id="s-start" label="Starts" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} error={errors.starts} />
        <Field id="s-end" label="Ends" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} error={errors.ends} />
        <Field id="s-limit" label="Warning limit" type="number" min={1} max={10} value={warningLimit} onChange={(e) => setWarningLimit(e.target.value)} error={errors.warningLimit} hint="Warnings before the candidate is flagged High." />
        <div />
        <Field id="s-medium" label="Medium risk from score" type="number" min={1} value={medium} onChange={(e) => setMedium(e.target.value)} error={errors.medium} />
        <Field id="s-high" label="High risk from score" type="number" min={2} value={high} onChange={(e) => setHigh(e.target.value)} error={errors.high} />
        {serverError && <div className="md:col-span-2"><Alert>{serverError}</Alert></div>}
        <div className="flex gap-2 md:col-span-2">
          <Button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create session'}</Button>
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </Dialog>
  );
}
