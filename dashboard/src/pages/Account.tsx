// Account (design "Dashboard · Account"): who is signed in, plus Sign out. Changes no data.
import { useAuth } from '../auth';
import { supabase } from '../supabase';
import { Icon, initials } from '../ui';

export function Account() {
  const { profile } = useAuth();
  return (
    <>
      <div className="head"><div><h1 className="h1">Account</h1><p className="sub">Your examiner profile</p></div></div>
      <section className="card" style={{ maxWidth: 640 }} aria-labelledby="pr">
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 20 }}>
          <span className="av" style={{ width: 56, height: 56, fontSize: 18 }} aria-hidden="true">{initials(profile?.full_name ?? '')}</span>
          <div><h2 id="pr">{profile?.full_name}</h2><p style={{ color: 'var(--muted)' }}>{profile?.email}</p></div>
        </div>
        <hr className="hr" />
        <div className="row"><span style={{ color: 'var(--muted)' }}>Role</span><b>Admin</b></div>
        <div className="row"><span style={{ color: 'var(--muted)' }}>Time zone</span><b>Asia/Manila</b></div>
        <div className="row"><span style={{ color: 'var(--muted)' }}>Data kept for</span><b>30 days after each exam ends</b></div>
        <div style={{ marginTop: 20 }}>
          <button type="button" className="btn s" onClick={() => void supabase?.auth.signOut()}><Icon name="logout" size={18} /> Sign out</button>
        </div>
      </section>
    </>
  );
}
