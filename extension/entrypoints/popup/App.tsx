// Popup screens (DSD.md § Layout: sign-in → join → session summary → monitoring status).
// M1: plain sign-up with a role field; the role chooser (R1) arrives in M5.
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { AttemptStatus, AuthState, JoinResult, Role } from '@ocm/core';
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
        <SignIn run={run} />
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

function SignIn({ run }: { run: Run }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<Role>('student');
  const [info, setInfo] = useState<string>();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setInfo(undefined);
    if (mode === 'signin') {
      await run(() => send({ type: 'auth.signIn', email, password }));
      return;
    }
    const res = await send<{ needsConfirmation?: boolean }>({ type: 'auth.signUp', email, password, full_name: fullName, role });
    await run(async () => res);
    if (res.ok && res.data.needsConfirmation) setInfo('Check your email to confirm your account, then sign in.');
  };

  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => void submit(e)}>
      {mode === 'signup' && (
        <>
          <Field id="name" label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required maxLength={120} autoComplete="name" />
          <fieldset className="flex flex-col gap-1">
            <legend className="text-sm font-semibold">Sign up as</legend>
            {(['student', 'admin'] as const).map((r) => (
              <label key={r} className="flex items-center gap-2 text-sm">
                <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} />
                {r === 'student' ? 'Student' : 'Admin'}
              </label>
            ))}
          </fieldset>
        </>
      )}
      <Field id="email" label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
      <Field id="password" label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} />
      {info && <p role="status" className="text-sm">{info}</p>}
      <Button type="submit">{mode === 'signin' ? 'Sign in' : 'Create account'}</Button>
      <button type="button" className="text-sm text-primary underline" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
        {mode === 'signin' ? 'Create an account' : 'I already have an account'}
      </button>
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
        <Field id="code" label="Session code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required maxLength={8} className="min-h-[44px] rounded-sm border border-border px-3 font-mono text-code uppercase" autoComplete="off" />
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
          <span aria-hidden className="h-2 w-2 rounded-full bg-success" /> Monitoring
        </p>
        {!status.exam_tab_bound && <p className="text-sm">Open your exam page in this browser to continue.</p>}
        <dl className="grid grid-cols-2 gap-1 text-xs text-muted">
          <dt>Last heartbeat</dt>
          <dd>{status.last_heartbeat_at ? new Date(status.last_heartbeat_at).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila' }) : '—'}</dd>
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
