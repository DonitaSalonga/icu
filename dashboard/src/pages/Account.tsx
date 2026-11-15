// Account settings (feedback round 2026-11-15, inspired by a profile-settings page): who is signed in, plus Sign
// out. It shows what the backend stores (profiles: name, email, role); nothing here edits data.
import { useAuth } from '../auth';
import { supabase } from '../supabase';
import { Icon, initials } from '../ui';

export function Account() {
  const { profile } = useAuth();
  const name = profile?.full_name ?? '';
  return (
    <>
      <div className="head"><div><h1 className="h1">Account settings</h1><p className="sub">Your examiner profile</p></div></div>
      <section className="card settings" aria-label="Account settings">
        <nav className="subnav" aria-label="Account sections">
          <a href="#profile" aria-current="page">My profile</a>
          <button type="button" className="danger" onClick={() => void supabase?.auth.signOut()}><Icon name="logout" size={18} />&nbsp; Sign out</button>
        </nav>
        <div id="profile">
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>My profile</h2>
          <div className="box" style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <span className="av" style={{ width: 80, height: 80, fontSize: 26 }} aria-hidden="true">{initials(name)}</span>
            <div>
              <p style={{ fontSize: 22, fontWeight: 700 }}>{name}</p>
              <p style={{ color: 'var(--muted)', marginTop: 2 }}>Admin · Examiner</p>
              <p style={{ color: 'var(--muted)' }}>Asia/Manila</p>
            </div>
          </div>
          <div className="box">
            <h3>Personal information</h3>
            <dl className="kv">
              <div><dt>Full name</dt><dd>{name}</dd></div>
              <div><dt>Email address</dt><dd>{profile?.email}</dd></div>
              <div><dt>Role</dt><dd>Admin</dd></div>
              <div><dt>Time zone</dt><dd>Asia/Manila</dd></div>
            </dl>
          </div>
        </div>
      </section>
    </>
  );
}
