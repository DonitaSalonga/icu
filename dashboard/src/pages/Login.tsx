// Admin sign-in / sign-up (R2; design "Dashboard · Sign in", admin step). Accounts created here are always
// admins; students use the extension (R1).
import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { PublicPage } from '../components/PublicPage';
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

  return (
    <PublicPage title="Admin">
      <section className="card" style={{ maxWidth: 440 }} aria-labelledby="as">
        <form onSubmit={(e) => void submit(e)} noValidate>
          <h2 id="as" style={{ marginBottom: 18 }}>{mode === 'signin' ? 'Admin sign in' : 'Create an admin account'}</h2>
          {mode === 'signup' && (
            <div className="field"><label htmlFor="nm">Full name</label><input id="nm" className="in" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={120} autoComplete="name" /></div>
          )}
          <div className="field"><label htmlFor="em">Email</label><input id="em" className="in" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></div>
          <div className="field"><label htmlFor="pw">Password</label><input id="pw" className="in" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} /></div>
          {error && <p className="err" role="alert">{error}</p>}
          {info && <p className="hint" role="status">{info}</p>}
          <button type="submit" className="btn p" style={{ width: '100%', marginTop: 8 }}>{mode === 'signin' ? 'Sign in' : 'Create account'}</button>
          <button type="button" className="btn g" style={{ width: '100%', marginTop: 8 }} onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(undefined); }}>
            {mode === 'signin' ? 'Create an admin account' : 'I already have an account'}
          </button>
          <button type="button" className="btn g" style={{ width: '100%', marginTop: 8 }} onClick={() => navigate('/')}>Back</button>
        </form>
      </section>
    </PublicPage>
  );
}
