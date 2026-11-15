// Admin sign-in / sign-up (R2; design "Dashboard · Sign in", admin step). Accounts created here are always
// admins; students use the extension (R1).
import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Logo } from '@icu/ui-tokens/icons';
import { useAuth } from '../auth';
import { supabase } from '../supabase';

export function Login() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string>();
  const [info, setInfo] = useState<string>();

  if (session) return <Navigate to="/overview" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(undefined);
    setInfo(undefined);
    if (!supabase) return;
    if (!email.includes('@')) return setError('Enter your email address.');
    if (!password) return setError('Enter your password.');
    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
      return;
    }
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { role: 'admin', full_name: fullName } } });
    if (error) setError(error.message);
    else if (!data.session) setInfo('Check your email to confirm your account, then sign in.');
  };

  const signin = mode === 'signin';
  const toggle = () => { setMode(signin ? 'signup' : 'signin'); setError(undefined); setInfo(undefined); };

  // Centred card with the brand on top (feedback 2026-11-15, after the user's sign-in inspiration; no Google button).
  return (
    <div className="pub">
      <main className="card authcard rise">
        <div className="brand pubbrand">
          <Logo height={34} />
          <span><span>I Caught You</span></span>
        </div>
        <form onSubmit={(e) => void submit(e)} noValidate aria-labelledby="as">
          <h1 id="as">{signin ? 'Admin sign in' : 'Create an admin account'}</h1>
          {!signin && (
            <div className="field"><label className="sr" htmlFor="nm">Full name</label><input id="nm" className="in" placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={120} autoComplete="name" /></div>
          )}
          <div className="field"><label className="sr" htmlFor="em">Email</label><input id="em" className="in" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></div>
          <div className="field"><label className="sr" htmlFor="pw">Password</label><input id="pw" className="in" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={signin ? 'current-password' : 'new-password'} /></div>
          {error && <p className="err" role="alert">{error}</p>}
          {info && <p className="hint" role="status">{info}</p>}
          <button type="submit" className="btn p" style={{ width: '100%', marginTop: 10 }}>{signin ? 'Sign in' : 'Create account'}</button>
        </form>
        <p className="authfoot">
          {signin ? "Don't have an account? " : 'Already have an account? '}
          <button type="button" className="linkbtn" onClick={toggle}>{signin ? 'Create an admin account' : 'Sign in'}</button>
        </p>
        <p className="authfoot" style={{ marginTop: 8 }}>
          <button type="button" className="linkbtn" style={{ fontWeight: 500, color: 'var(--muted)' }} onClick={() => navigate('/')}>Back</button>
        </p>
      </main>
    </div>
  );
}
