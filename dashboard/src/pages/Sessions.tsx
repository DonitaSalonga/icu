// Sessions list and Create session dialog (R4, R5; DSD § Layout "Sessions list").
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { describeExamSite, isValidExamSite, normalizeExamSite } from '@icu/core';
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

const pad = (n: number) => String(n).padStart(2, '0');
const dateValue = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeValue = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
/** Local date (yyyy-mm-dd) + time (hh:mm) → Date, or undefined if either is missing. */
const combine = (date: string, time: string) => (date && time ? new Date(`${date}T${time}`) : undefined);

/** The exam platform type box (2026-11-15): platform names or websites, shown as removable chips. */
function PlatformInput({ value, onChange, error }: { value: string[]; onChange: (v: string[]) => void; error?: string }) {
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState<string>();
  const add = () => {
    const entry = normalizeExamSite(draft);
    if (!entry) return;
    if (!isValidExamSite(entry)) return setDraftError('Type a platform name like netacad, or a website like skillsbuild.org or docs.google.com/forms.');
    if (!value.includes(entry)) onChange([...value, entry]);
    setDraft('');
    setDraftError(undefined);
  };
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="s-platform" className="text-sm font-semibold">Exam platform</label>
      <div className="flex gap-2">
        <input
          id="s-platform"
          className={`min-h-[36px] flex-1 rounded-sm border px-3 text-sm ${draftError || error ? 'border-danger' : 'border-border-strong'}`}
          placeholder="e.g. netacad, ibm, docs.google.com/forms"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add();
            }
          }}
          aria-describedby="s-platform-hint"
          aria-invalid={draftError || error ? true : undefined}
        />
        <Button type="button" variant="secondary" onClick={add}>Add</Button>
      </div>
      <p id="s-platform-hint" className="text-xs text-muted">
        Type the platform or website students take the exam on, then press Enter. Every page of that platform counts as the exam; other websites, and other tabs, don't.
      </p>
      {draft && !draftError && isValidExamSite(normalizeExamSite(draft)) && (
        <p className="text-xs text-muted">Will monitor {describeExamSite(normalizeExamSite(draft))}.</p>
      )}
      {(draftError || error) && <p className="text-xs text-danger">{draftError ?? error}</p>}
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Exam platforms">
          {value.map((v) => (
            <li key={v} className="flex items-center gap-1 rounded-full border border-border-strong bg-surface py-0.5 pl-3 pr-1 text-sm" title={`Monitors ${describeExamSite(v)}`}>
              {v}
              <button type="button" className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-bg" aria-label={`Remove ${v}`} onClick={() => onChange(value.filter((x) => x !== v))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CreateSessionDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (name: string, code: string) => void }) {
  const now = new Date();
  const later = new Date(now.getTime() + 60 * 60_000);
  const [name, setName] = useState('');
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [startDate, setStartDate] = useState(dateValue(now));
  const [startTime, setStartTime] = useState(timeValue(now));
  const [endDate, setEndDate] = useState(dateValue(later));
  const [endTime, setEndTime] = useState(timeValue(later));
  const [warningLimit, setWarningLimit] = useState('3');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Enter a name.';
    if (platforms.length === 0) e.platforms = 'Add at least one exam platform.';
    const starts = combine(startDate, startTime);
    const ends = combine(endDate, endTime);
    if (!starts) e.starts = 'Choose a start date and time.';
    if (!ends || (starts && ends <= starts)) e.ends = 'The end must be after the start.';
    const wl = Number(warningLimit);
    if (!Number.isInteger(wl) || wl < 1 || wl > 10) e.warningLimit = 'Choose a whole number from 1 to 10.';
    return e;
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    setServerError(undefined);
    if (Object.keys(e).length) return;
    setSaving(true);
    // Risk thresholds use the server defaults (Medium from 10, High from 25; 2026-11-15 feedback).
    const { data, error } = await supabase!.rpc('create_session', {
      p_name: name.trim(),
      p_url_patterns: platforms,
      p_starts_at: combine(startDate, startTime)!.toISOString(),
      p_ends_at: combine(endDate, endTime)!.toISOString(),
      p_warning_limit: Number(warningLimit),
    });
    setSaving(false);
    if (error) return setServerError(errorText(error));
    onCreated(name.trim(), (data as { code: string }).code);
    setName('');
    setPlatforms([]);
  };

  return (
    <Dialog open={open} onClose={onClose} title="Create exam session">
      <form className="grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={(e) => void submit(e)} noValidate>
        <div className="md:col-span-2">
          <Field id="s-name" label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} error={errors.name} />
        </div>
        <div className="md:col-span-2">
          <PlatformInput value={platforms} onChange={setPlatforms} error={errors.platforms} />
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold">Starts</legend>
          <div className="grid grid-cols-2 gap-2">
            <Field id="s-start-date" label="Date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <Field id="s-start-time" label="Time" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          {errors.starts && <p className="text-xs text-danger">{errors.starts}</p>}
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold">Ends</legend>
          <div className="grid grid-cols-2 gap-2">
            <Field id="s-end-date" label="Date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            <Field id="s-end-time" label="Time" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
          {errors.ends && <p className="text-xs text-danger">{errors.ends}</p>}
        </fieldset>
        <Field id="s-limit" label="Warning limit" type="number" min={1} max={10} value={warningLimit} onChange={(e) => setWarningLimit(e.target.value)} error={errors.warningLimit} hint="Warnings before the candidate is flagged High." />
        {serverError && <div className="md:col-span-2"><Alert>{serverError}</Alert></div>}
        <div className="flex gap-2 md:col-span-2">
          <Button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create session'}</Button>
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </Dialog>
  );
}
