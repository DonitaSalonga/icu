// R1: the dashboard's first screen when signed out (design "Dashboard · Sign in"). Students use the extension.
import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Icon } from '@icu/ui-tokens/icons';
import { PublicPage } from '../components/PublicPage';
import { useAuth } from '../auth';

export function RoleChooser() {
  const { session } = useAuth();
  const [student, setStudent] = useState(false);
  if (session) return <Navigate to="/overview" replace />;

  if (student) {
    return (
      <PublicPage title="Sign up or sign in as" subtitle="Students take exams with the Chrome extension, not this dashboard.">
        <section className="card" aria-labelledby="install-heading">
          <h2 id="install-heading" style={{ marginBottom: 12 }}>Install the extension to take exams</h2>
          <ol style={{ margin: '0 0 20px', paddingLeft: 22 }}>
            <li>Get the ICU zip file from your examiner and unzip it.</li>
            <li>Open <code className="mono">chrome://extensions</code>, turn on Developer mode, choose Load unpacked and pick the unzipped folder.</li>
            <li>Click the extension's icon, choose “I'm a student”, and sign up or sign in.</li>
            <li>Enter the exam code from your examiner.</li>
          </ol>
          <button type="button" className="btn s" onClick={() => setStudent(false)}>Back</button>
        </section>
      </PublicPage>
    );
  }
  return (
    <PublicPage title="Sign up or sign in as" subtitle="Choose how you use ICU.">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 20 }}>
        <button type="button" className="card pick" onClick={() => setStudent(true)}>
          <span className="av" style={{ width: 48, height: 48, marginBottom: 18 }}><Icon name="student" size={24} /></span>
          <b style={{ fontSize: 20, display: 'block' }}>I'm a student</b>
          <p style={{ color: 'var(--muted)', marginTop: 8 }}>Take an exam with monitoring.</p>
        </button>
        <Link to="/login" className="card pick">
          <span className="av" style={{ width: 48, height: 48, marginBottom: 18 }}><Icon name="shield" size={24} /></span>
          <b style={{ fontSize: 20, display: 'block' }}>I'm an admin</b>
          <p style={{ color: 'var(--muted)', marginTop: 8 }}>Create exam sessions and review candidates.</p>
        </Link>
      </div>
    </PublicPage>
  );
}
