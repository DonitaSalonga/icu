// Sessions list and Create session dialog (R4, R5; design "Dashboard · Sessions" and "Create session").
import { useMemo, useRef, useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { describeExamSite, isValidExamSite, normalizeExamSite } from '@icu/core';
import { useAdminData } from '../lib/admin-data';
import { sessionStatus } from '../lib/data';
import { errorText, supabase } from '../supabase';
import { Alert, Dialog, Icon, notify, scheduleDot, Seg, StatusPill } from '../ui';

type Filter = 'all' | 'live' | 'upcoming' | 'ended';
const STATUS_OF: Record<Filter, string | undefined> = { all: undefined, live: 'Active', upcoming: 'Upcoming', ended: 'Ended' };

export function Sessions() {
  const { loading, error, sessions, attempts, reload } = useAdminData();
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const rows = useMemo(
    () =>
      sessions.map((s) => {
        const mine = attempts.filter((a) => a.session.id === s.id);
        return { ...s, candidates: mine.length, high: mine.filter((a) => a.risk.level === 'high').length };
      }),
    [sessions, attempts],
  );
  const shown = rows.filter((s) => {
    const want = STATUS_OF[filter];
    if (want && sessionStatus(s) !== want) return false;
    const q = query.trim().toLowerCase();
    return !q || s.name.toLowerCase().includes(q) || s.url_patterns.join(' ').toLowerCase().includes(q);
  });

  return (
    <>
      <div className="head">
        <div><h1 className="h1">Sessions</h1><p className="sub">Exam sessions you created</p></div>
        <CreateSessionDialog
          open={creating}
          onOpenChange={setCreating}
          trigger={<button type="button" className="btn p"><Icon name="plus" size={18} /> Create session</button>}
          onCreated={() => {
            setCreating(false);
            setFilter('all');
            setQuery('');
            notify('Session created.');
            void reload();
          }}
        />
      </div>
      {error && <Alert>{error}</Alert>}
      <section className="card" aria-label="Sessions">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <Seg<Filter> label="Session status" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'live', label: 'Live' }, { value: 'upcoming', label: 'Upcoming' }, { value: 'ended', label: 'Ended' }]} />
          <div style={{ position: 'relative', flex: 1, maxWidth: 360, minWidth: 220 }}>
            <span style={{ position: 'absolute', left: 14, top: 13, color: 'var(--muted)' }}><Icon name="search" size={18} /></span>
            <label htmlFor="q" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>Search sessions</label>
            <input id="q" className="in" style={{ paddingLeft: 42 }} placeholder="Search sessions" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>
        <div className="tw">
          <table className="t">
            <thead><tr>{['Name', 'Exam platform', 'Schedule', 'Status', 'Candidates', 'High risk'].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td><Link className="lk" to={`/sessions/${r.id}`}>{r.name}</Link><small>{r.description?.split('\n')[0] || 'No description'}</small></td>
                  <td><span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{r.url_patterns.map((p) => <span key={p} className="chip" title={describeExamSite(p)}>{p}</span>)}</span></td>
                  <td className="num" style={{ whiteSpace: 'nowrap' }}>{scheduleDot(r)}</td>
                  <td><StatusPill status={sessionStatus(r)} /></td>
                  <td className="num">{r.candidates}</td>
                  <td className="num">{r.high}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading && <div className="empty" role="status"><b>Loading…</b></div>}
        {!loading && rows.length === 0 && <div className="empty"><b>No sessions yet</b>Create one, then give students its code.</div>}
        {!loading && rows.length > 0 && shown.length === 0 && <div className="empty"><b>No sessions match</b>Try another filter or search.</div>}
      </section>
    </>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');
const dateValue = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeValue = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
/** Local date (yyyy-mm-dd) + time (hh:mm) → Date, or undefined if either is missing. */
const combine = (date: string, time: string) => (date && time ? new Date(`${date}T${time}`) : undefined);

function CreateSessionDialog({ open, onOpenChange, trigger, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; trigger: ReactElement; onCreated: () => void }) {
  const nameRef = useRef<HTMLInputElement>(null);
  const now = new Date();
  const later = new Date(now.getTime() + 60 * 60_000);
  const [name, setName] = useState('');
  const [plat, setPlat] = useState('');
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [about, setAbout] = useState('');
  const [d1, setD1] = useState(dateValue(now));
  const [t1, setT1] = useState(timeValue(now));
  const [d2, setD2] = useState(dateValue(later));
  const [t2, setT2] = useState(timeValue(later));
  const [limit, setLimit] = useState('3');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const addPlat = () => {
    const entry = normalizeExamSite(plat);
    if (!entry) return;
    if (!isValidExamSite(entry)) return setError('Type a platform name like netacad, or a website like skillsbuild.org or docs.google.com/forms.');
    if (!platforms.includes(entry)) setPlatforms([...platforms, entry]);
    setPlat('');
    setError(undefined);
  };

  const create = async () => {
    setError(undefined);
    const starts = combine(d1, t1);
    const ends = combine(d2, t2);
    const wl = Number(limit);
    if (!name.trim()) return setError('Enter a name.');
    if (platforms.length === 0) return setError('Add at least one exam platform.');
    if (!starts || !ends || ends <= starts) return setError('The end must be after the start.');
    if (!Number.isInteger(wl) || wl < 1 || wl > 10) return setError('Choose a warning limit from 1 to 10.');
    setSaving(true);
    // Risk thresholds use the server defaults (Medium from 10, High from 25).
    const { error } = await supabase!.rpc('create_session', {
      p_name: name.trim(),
      p_url_patterns: platforms,
      p_starts_at: starts.toISOString(),
      p_ends_at: ends.toISOString(),
      p_warning_limit: wl,
      p_description: about.trim() || null,
    });
    setSaving(false);
    if (error) return setError(errorText(error));
    onCreated();
    setName('');
    setPlatforms([]);
    setPlat('');
    setAbout('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Create exam session" trigger={trigger} initialFocus={nameRef}>
      <div className="field"><label htmlFor="n">Name</label><input ref={nameRef} id="n" className="in" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></div>
      <div className="field">
        <label htmlFor="pl">Exam platform</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input id="pl" className="in" placeholder="e.g. netacad, ibm, docs.google.com/forms" value={plat} onChange={(e) => setPlat(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPlat(); } }} />
          <button type="button" className="btn s" onClick={addPlat}>Add</button>
        </div>
        <div role="list" aria-label="Exam platforms" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {platforms.map((p) => (
            <span key={p} role="listitem" className="chip" title={`Monitors ${describeExamSite(p)}`}>
              {p}
              <button type="button" aria-label={`Remove ${p}`} onClick={() => setPlatforms(platforms.filter((x) => x !== p))}><Icon name="close" size={14} /></button>
            </span>
          ))}
        </div>
        <p className="hint">Type the platform or website students take the exam on, then press Enter. Every page of that platform counts as the exam; other websites, and other tabs, don't.</p>
      </div>
      <div className="field">
        <label htmlFor="ab">Tell us about the exam <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optional)</span></label>
        <textarea id="ab" className="in" value={about} onChange={(e) => setAbout(e.target.value.slice(0, 500))} />
        <p className="hint">Students see this before they start. {about.length} / 500</p>
      </div>
      <div className="two">
        <div>
          <p className="lab">Starts</p>
          <div className="two" style={{ gap: 8 }}>
            <div><label htmlFor="d1" className="hint" style={{ margin: '0 0 4px', display: 'block' }}>Date</label><input id="d1" className="in" type="date" value={d1} onChange={(e) => setD1(e.target.value)} /></div>
            <div><label htmlFor="t1" className="hint" style={{ margin: '0 0 4px', display: 'block' }}>Time</label><input id="t1" className="in" type="time" value={t1} onChange={(e) => setT1(e.target.value)} /></div>
          </div>
        </div>
        <div>
          <p className="lab">Ends</p>
          <div className="two" style={{ gap: 8 }}>
            <div><label htmlFor="d2" className="hint" style={{ margin: '0 0 4px', display: 'block' }}>Date</label><input id="d2" className="in" type="date" value={d2} onChange={(e) => setD2(e.target.value)} /></div>
            <div><label htmlFor="t2" className="hint" style={{ margin: '0 0 4px', display: 'block' }}>Time</label><input id="t2" className="in" type="time" value={t2} onChange={(e) => setT2(e.target.value)} /></div>
          </div>
        </div>
      </div>
      <div className="field" style={{ marginTop: 18, maxWidth: 240 }}>
        <label htmlFor="lim">Warning limit</label>
        <input id="lim" className="in" type="number" min={1} max={10} value={limit} onChange={(e) => setLimit(e.target.value)} />
        <p className="hint">Warnings before the candidate is flagged High.</p>
      </div>
      {error && <p className="err" role="alert" style={{ marginBottom: 12 }}>{error}</p>}
      <div className="actions">
        <button type="button" className="btn s" onClick={() => onOpenChange(false)}>Cancel</button>
        <button type="button" className="btn p" disabled={!name.trim() || saving} onClick={() => void create()}>{saving ? 'Creating…' : 'Create session'}</button>
      </div>
    </Dialog>
  );
}
