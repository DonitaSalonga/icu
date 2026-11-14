// Admin sign-in / sign-up (R2). Accounts created here are always admins; students use the extension (R1).
import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { supabase } from '../supabase';
import { Alert, Button, Field } from '../ui';

export function Login() {
  const { session } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string>();
  const [info, setInfo] = useState<string>();

  if (session) return <Navigate to="/sessions" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(undefined);
    setInfo(undefined);
    if (!supabase) return;
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
    <form className="flex max-w-sm flex-col gap-3" onSubmit={(e) => void submit(e)}>
      <h1 className="text-xl font-semibold">{mode === 'signin' ? 'Admin sign in' : 'Create an admin account'}</h1>
      {mode === 'signup' && <Field id="name" label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required maxLength={120} autoComplete="name" />}
      <Field id="email" label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
      <Field id="password" label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} />
      {error && <Alert>{error}</Alert>}
      {info && <p role="status" className="text-sm">{info}</p>}
      <Button type="submit">{mode === 'signin' ? 'Sign in' : 'Create account'}</Button>
      <button type="button" className="self-start text-sm text-primary underline" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
        {mode === 'signin' ? 'Create an admin account' : 'I already have an account'}
      </button>
      <Link to="/" className="self-start text-sm text-primary underline">Back</Link>
    </form>
  );
}
