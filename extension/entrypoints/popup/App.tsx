// Popup (design "Extension · Popup" and "Extension · Student sign in"): role chooser → student sign in → join an
// exam → exam card → monitoring. R1: signed-out users first choose Student or Admin; admins use the dashboard.
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { OTPInput, REGEXP_ONLY_DIGITS_AND_CHARS } from 'input-otp';
import { Icon } from '@icu/ui-tokens/icons';
import type { AttemptStatus, AuthState, JoinResult } from '@icu/core';
import { DASHBOARD_URL } from '../../lib/env';
import { errorText, send } from '../../lib/send';
import { formatElapsed, formatTime, PopupHeader } from '../../lib/ui';

type Result = { ok: boolean; code?: string; message?: string };
type Run = (fn: () => Promise<Result>) => Promise<boolean>;

export function App() {
  const [auth, setAuth] = useState<AuthState>();
  const [status, setStatus] = useState<AttemptStatus>();
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    const a = await send<AuthState>({ type: 'auth.state' });
    if (!a.ok) return setError(errorText(a.code, a.message));
    setAuth(a.data);
    const s = await send<AttemptStatus>({ type: 'attempt.status' });
    if (s.ok) setStatus(s.data);
  }, []);

  useEffect(() => {
    // While this port is open the service worker ignores focus changes caused by the popup (A5).
    const port = browser.runtime.connect({ name: 'popup' });
    return () => port.disconnect();
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  const run: Run = async (fn) => {
    setError(undefined);
    const res = await fn();
    if (!res.ok) setError(errorText(res.code ?? '', res.message ?? ''));
    await refresh();
    return res.ok;
  };

  return (
    <div style={{ width: 360, minHeight: 600, overflow: 'hidden', background: 'var(--bg)', position: 'relative' }}>
      <PopupHeader />
      {/* Each screen fades in when it changes (".page"). */}
      <div key={!auth ? 'loading' : !auth.signedIn ? 'out' : auth.role === 'admin' ? 'admin' : status?.state ?? 'idle'} className="page">
      {!auth ? (
        <p className="hint" style={{ padding: '0 16px' }}>Loading…</p>
      ) : !auth.configured ? (
        <p className="err" role="alert" style={{ padding: '0 16px' }}>{errorText('ICU_NOT_CONFIGURED', '')}</p>
      ) : !auth.signedIn ? (
        <Signedout run={run} error={error} />
      ) : auth.role === 'admin' ? (
        <div className="card" style={{ margin: '4px 16px', padding: 22, borderRadius: 20 }}>
          <p style={{ marginBottom: 14 }}>This is an admin account. Use the dashboard.</p>
          <button type="button" className="btn p" style={{ width: '100%' }} onClick={() => void browser.tabs.create({ url: DASHBOARD_URL })}>Open dashboard</button>
          <button type="button" className="btn g" style={{ width: '100%', marginTop: 6 }} onClick={() => void run(() => send({ type: 'auth.signOut' }))}>Sign out</button>
        </div>
      ) : (
        <StudentHome status={status} run={run} error={error} />
      )}
      </div>
    </div>
  );
}

/** R1: the first screen when signed out, then student sign in / create account. */
function Signedout({ run, error }: { run: Run; error?: string }) {
  const [student, setStudent] = useState(false);
  const [create, setCreate] = useState(false);
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [fullName, setFullName] = useState('');
  const [local, setLocal] = useState<string>();
  const [info, setInfo] = useState<string>();

  if (!student) {
    return (
      <div className="page" style={{ padding: '8px 16px 0' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.02em', marginBottom: 16 }}>Sign up or sign in as</h1>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <button type="button" className="card pick" style={{ padding: 16, borderRadius: 20 }} onClick={() => setStudent(true)}>
            <span className="av" style={{ width: 36, height: 36, marginBottom: 14 }}><Icon name="student" /></span>
            <b style={{ display: 'block', fontSize: 15 }}>I'm a student</b>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 6 }}>Take an exam with monitoring.</p>
          </button>
          <button type="button" className="card pick" style={{ padding: 16, borderRadius: 20 }} onClick={() => void browser.tabs.create({ url: DASHBOARD_URL })}>
            <span className="av" style={{ width: 36, height: 36, marginBottom: 14 }}><Icon name="shield" /></span>
            <b style={{ display: 'block', fontSize: 15 }}>I'm an admin</b>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 6 }}>Opens the dashboard to create and review exams.</p>
          </button>
        </div>
      </div>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLocal(undefined);
    setInfo(undefined);
    if (!email.includes('@')) return setLocal('Enter your email address.');
    if (pw.length < 6) return setLocal('Password must be at least 6 characters.');
    if (!create) {
      await run(() => send({ type: 'auth.signIn', email, password: pw }));
      return;
    }
    // Accounts created in the extension are always students (R1, R2).
    const res = await send<{ needsConfirmation?: boolean }>({ type: 'auth.signUp', email, password: pw, full_name: fullName, role: 'student' });
    await run(async () => res);
    if (res.ok && res.data.needsConfirmation) setInfo('Check your email to confirm your account, then sign in.');
  };
  const shown = local ?? error;

  return (
    <form key={create ? 'create' : 'signin'} className="card page" style={{ margin: '4px 16px', padding: 22, borderRadius: 20 }} onSubmit={(e) => void submit(e)} noValidate>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 14 }}>{create ? 'Create a student account' : 'Student sign in'}</h1>
      {create && <div className="field"><label htmlFor="n">Full name</label><input id="n" className="in" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={120} autoComplete="name" /></div>}
      <div className="field"><label htmlFor="e">Email</label><input id="e" className="in" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></div>
      <div className="field"><label htmlFor="p">Password</label><input id="p" className="in" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete={create ? 'new-password' : 'current-password'} /></div>
      {shown && <p className="err" role="alert" style={{ margin: '-8px 0 12px' }}>{shown}</p>}
      {info && <p className="hint" role="status" style={{ margin: '-8px 0 12px' }}>{info}</p>}
      <button type="submit" className="btn p" style={{ width: '100%' }}>{create ? 'Create account' : 'Sign in'}</button>
      <button type="button" className="btn g" style={{ width: '100%', marginTop: 6 }} onClick={() => { setCreate(!create); setLocal(undefined); }}>{create ? 'I already have an account' : 'Create an account'}</button>
      <button type="button" className="btn g" style={{ width: '100%', marginTop: 2 }} onClick={() => setStudent(false)}>Back</button>
    </form>
  );
}

function StudentHome({ status, run, error }: { status?: AttemptStatus; run: Run; error?: string }) {
  const [code, setCode] = useState('');
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  if (!status) return <p className="hint" style={{ padding: '0 16px' }}>Loading…</p>;

  if (status.state === 'active') return <Monitoring status={status} run={run} error={error} />;

  if (status.state === 'ended') {
    return (
      <div style={{ padding: '24px 20px' }}>
        <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.03em', marginBottom: 8 }}>Exam ended.</h1>
        <p style={{ color: 'var(--muted)', marginBottom: 24 }}>Your examiner will review the session. You can close this window.</p>
        <button type="button" className="btn p" style={{ width: '100%' }} onClick={() => void run(() => send({ type: 'attempt.reset' }))}>Join another exam</button>
      </div>
    );
  }

  const session = status.state === 'joined' ? status.session : undefined;
  // Finding a different exam replaces the joined one (R8: one attempt at a time).
  const find = async () => {
    if (session) await send({ type: 'attempt.reset' });
    await run(() => send<JoinResult>({ type: 'attempt.join', code }));
    setCode('');
  };
  const notOpen = session ? Date.now() < Date.parse(session.starts_at) : false;

  return (
    <div style={{ padding: '4px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Join an exam</h1>
        <button type="button" className="btn g sm" onClick={() => void run(() => send({ type: 'auth.signOut' }))}>Sign out</button>
      </div>
      <form className="card" style={{ padding: 20, borderRadius: 20 }} onSubmit={(e) => { e.preventDefault(); void find(); }}>
        <label className="lab" htmlFor="code">Exam code</label>
        {/* input-otp: six boxes with paste, backspace and arrow-key handling over one real, labelled input. */}
        <OTPInput
          id="code"
          maxLength={6}
          value={code}
          onChange={(v) => setCode(v.toUpperCase())}
          pattern={REGEXP_ONLY_DIGITS_AND_CHARS}
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          pasteTransformer={(text) => text.toUpperCase().replace(/[^A-Z0-9]/g, '')}
          render={({ slots }) => (
            <div className="otp-slots" aria-hidden="true">
              {slots.map((s, i) => (
                <div key={i} className={`otp-slot ${s.isActive ? 'on' : ''}`}>
                  {s.char ?? (s.hasFakeCaret ? <span className="otp-caret" /> : null)}
                </div>
              ))}
            </div>
          )}
        />
        {error && <p className="err" role="alert">{error}</p>}
        <button type="submit" className="btn p" style={{ width: '100%', marginTop: 14 }} disabled={code.length < 6}>Find exam</button>
      </form>
      {session && (
        <div className="card rise" style={{ marginTop: 14, padding: 18, borderRadius: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <b style={{ fontSize: 16 }}>{session.name}</b>
            {notOpen ? <span className="pill">Opens {formatTime(session.starts_at)}</span> : <span className="pill live"><span className="dot" />Open now</span>}
          </div>
          <p style={{ color: 'var(--muted)', fontSize: 14, margin: '8px 0 14px' }}>
            {session.description ? `${session.description.replace(/\.?\s*$/, '.')} ` : ''}Exam platform: {session.url_patterns.join(', ')}. Examiner: {session.admin_name}
          </p>
          <button type="button" className="btn p" style={{ width: '100%' }} disabled={notOpen} onClick={() => void run(() => send({ type: 'attempt.openNotice' }))}>Continue</button>
        </div>
      )}
    </div>
  );
}

/** Active attempt: the design's "ICU monitoring" view (privacy board, monitoring state), plus Share screen again. */
function Monitoring({ status, run, error }: { status: AttemptStatus; run: Run; error?: string }) {
  const elapsed = status.started_at ? formatElapsed(Date.now() - Date.parse(status.started_at)) : '—';
  return (
    <div style={{ padding: '24px 20px' }}>
      {status.upload_failing ? (
        <span className="pill md" style={{ marginBottom: 16 }}><span className="tri" />Reconnecting…</span>
      ) : (
        <span className="pill live" style={{ marginBottom: 16 }}><span className="dot" />Monitoring</span>
      )}
      <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.03em', margin: '16px 0 8px' }}>ICU monitoring</h1>
      <p style={{ color: 'var(--muted)', marginBottom: 20 }}>
        {status.exam_tab_bound ? 'Your exam is open.' : 'Now open your exam in this browser.'} <span className="mono num">{elapsed}</span>
        {status.warnings && ` · Warnings ${status.warnings.n} of ${status.warnings.limit}`}
      </p>
      {!status.screen_sharing && (
        <div className="alertrow" role="alert" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
          <Icon name="alert" size={18} /> Screen sharing has stopped.
          <button type="button" className="btn p" style={{ width: '100%' }} onClick={() => void run(() => send({ type: 'attempt.reshare' }))}>Share screen again</button>
        </div>
      )}
      {error && <p className="err" role="alert" style={{ marginBottom: 12 }}>{error}</p>}
      <button type="button" className="btn p" style={{ width: '100%', marginBottom: 12 }} disabled={!status.exam_tab_bound} onClick={() => void run(() => send({ type: 'attempt.focusExam' }))}>
        <Icon name="monitor" size={18} /> Go to my exam
      </button>
      <button type="button" className="btn s" style={{ width: '100%' }} onClick={() => { if (window.confirm('End the exam now?')) void run(() => send({ type: 'attempt.end' })); }}>End exam</button>
      <p className="hint" style={{ marginTop: 16 }}>{status.screen_sharing ? 'Screen sharing is on. Keep the ICU monitoring window open until the exam ends.' : 'Your exam requires sharing your entire screen.'}</p>
    </div>
  );
}
