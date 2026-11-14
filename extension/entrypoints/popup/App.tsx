// Popup screens (DSD.md § Layout: sign-in → join → session summary → monitoring status).
// R1: signed-out users first choose Student or Admin; admins are sent to the dashboard.
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { AttemptStatus, AuthState, JoinResult } from '@ocm/core';
import { DASHBOARD_URL } from '../../lib/env';
import { errorText, send } from '../../lib/send';
import { Alert, Button, Field, formatTime } from '../../lib/ui';

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

  const run = async (fn: () => Promise<{ ok: boolean; code?: string; message?: string }>) => {
    setError(undefined);
    const res = await fn();
    if (!res.ok) setError(errorText(res.code ?? '', res.message ?? ''));
    await refresh();
    return res.ok;
  };

  return (
    <main className="flex min-h-[200px] flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Exam monitoring</h1>
        {auth?.signedIn && status?.state !== 'active' && (
          <button className="text-sm text-primary underline" onClick={() => void run(() => send({ type: 'auth.signOut' }))}>
            Sign out
          </button>
        )}
      </header>
      {error && <Alert>{error}</Alert>}
      {!auth ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : !auth.configured ? (
        <Alert>{errorText('OCM_NOT_CONFIGURED', '')}</Alert>
      ) : !auth.signedIn ? (
        <RoleChooser run={run} />
      ) : auth.role === 'admin' ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm">This is an admin account. Use the dashboard.</p>
          <Button onClick={() => void browser.tabs.create({ url: DASHBOARD_URL })}>Open dashboard</Button>
        </div>
      ) : (
        <StudentHome status={status} run={run} name={auth.full_name ?? ''} />
      )}
    </main>
  );
}

type Run = (fn: () => Promise<{ ok: boolean; code?: string; message?: string }>) => Promise<boolean>;

/** R1: the first screen when signed out. Admins don't use the extension, so Admin opens the dashboard. */
function RoleChooser({ run }: { run: Run }) {
  const [student, setStudent] = useState(false);
  if (student) return <SignIn run={run} onBack={() => setStudent(false)} />;
  const option = 'flex flex-col items-start gap-1 rounded-md border border-border-strong p-4 text-left hover:bg-surface';
  return (
    <div className="flex flex-col gap-3" role="group" aria-labelledby="chooser-heading">
      <h2 id="chooser-heading" className="text-base font-semibold">Sign up or sign in as</h2>
      <button className={option} onClick={() => setStudent(true)}>
        <span className="font-semibold">I'm a student</span>
        <span className="text-sm text-muted">Take an exam with monitoring.</span>
      </button>
      <button className={option} onClick={() => void browser.tabs.create({ url: DASHBOARD_URL })}>
        <span className="font-semibold">I'm an admin</span>
        <span className="text-sm text-muted">Opens the dashboard to create and review exams.</span>
      </button>
    </div>
  );
}

function SignIn({ run, onBack }: { run: Run; onBack: () => void }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [info, setInfo] = useState<string>();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setInfo(undefined);
    if (mode === 'signin') {
      await run(() => send({ type: 'auth.signIn', email, password }));
      return;
    }
    // Accounts created in the extension are always students (R1, R2).
    const res = await send<{ needsConfirmation?: boolean }>({ type: 'auth.signUp', email, password, full_name: fullName, role: 'student' });
    await run(async () => res);
    if (res.ok && res.data.needsConfirmation) setInfo('Check your email to confirm your account, then sign in.');
  };

  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => void submit(e)}>
      <h2 className="text-base font-semibold">{mode === 'signin' ? 'Student sign in' : 'Create a student account'}</h2>
      {mode === 'signup' && (
        <Field id="name" label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required maxLength={120} autoComplete="name" />
      )}
      <Field id="email" label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
      <Field id="password" label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} />
      {info && <p role="status" className="text-sm">{info}</p>}
      <Button type="submit">{mode === 'signin' ? 'Sign in' : 'Create account'}</Button>
      <button type="button" className="text-sm text-primary underline" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
        {mode === 'signin' ? 'Create an account' : 'I already have an account'}
      </button>
      <button type="button" className="text-sm text-primary underline" onClick={onBack}>Back</button>
    </form>
  );
}

function StudentHome({ status, run, name }: { status?: AttemptStatus; run: Run; name: string }) {
  const [code, setCode] = useState('');
  if (!status) return <p className="text-sm text-muted">Loading…</p>;

  if (status.state === 'idle') {
    return (
      <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void run(() => send<JoinResult>({ type: 'attempt.join', code })); }}>
        <p className="text-sm">Signed in as {name}.</p>
        <Field id="code" label="Session code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required maxLength={8} className="min-h-[44px] rounded-sm border border-border-strong px-3 font-mono text-code uppercase" autoComplete="off" />
        <Button type="submit">Join exam</Button>
      </form>
    );
  }

  const session = status.session!;
  const summary = (
    <section className="rounded-md border border-border bg-surface p-3 text-sm">
      <p className="font-semibold">{session.name}</p>
      <p className="text-muted">Examiner: {session.admin_name} ({session.admin_email})</p>
      <p className="text-muted">{formatTime(session.starts_at)} – {formatTime(session.ends_at)}</p>
    </section>
  );

  if (status.state === 'joined') {
    const notOpen = Date.now() < Date.parse(session.starts_at);
    return (
      <div className="flex flex-col gap-3">
        {summary}
        {notOpen && <p className="text-sm">This exam opens at {formatTime(session.starts_at)}.</p>}
        <Button disabled={notOpen} onClick={() => void run(() => send({ type: 'attempt.openNotice' }))}>Continue</Button>
        <Button variant="secondary" onClick={() => void run(() => send({ type: 'attempt.reset' }))}>Use a different code</Button>
      </div>
    );
  }

  if (status.state === 'active') {
    return (
      <div className="flex flex-col gap-3">
        {summary}
        <p className="flex items-center gap-2 text-sm font-semibold">
          {status.upload_failing ? (
            <><span aria-hidden className="h-2 w-2 rounded-full bg-risk-med-fg" /> Reconnecting…</>
          ) : (
            <><span aria-hidden className="h-2 w-2 rounded-full bg-success" /> Monitoring</>
          )}
        </p>
        {!status.exam_tab_bound && <p className="text-sm">Open your exam page in this browser to continue.</p>}
        <dl className="grid grid-cols-2 gap-1 text-xs text-muted">
          <dt>Last heartbeat</dt>
          <dd>{status.last_heartbeat_at ? new Date(status.last_heartbeat_at).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila' }) : '—'}</dd>
          <dt>Warnings</dt>
          <dd>{status.warnings ? `${status.warnings.n} of ${status.warnings.limit}` : '—'}</dd>
          <dt>Events waiting to upload</dt>
          <dd>{status.queue_size}</dd>
        </dl>
        <Button variant="danger" onClick={() => { if (confirm('End the exam? Monitoring stops.')) void run(() => send({ type: 'attempt.end' })); }}>
          End exam
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {summary}
      <p className="text-sm font-semibold">Exam ended.</p>
      <Button variant="secondary" onClick={() => void run(() => send({ type: 'attempt.reset' }))}>Join another exam</Button>
    </div>
  );
}
