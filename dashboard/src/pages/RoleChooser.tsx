// R1: the dashboard's first screen when signed out. Students use the extension, not the dashboard.
import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../auth';

export function RoleChooser() {
  const { session } = useAuth();
  const [student, setStudent] = useState(false);
  if (session) return <Navigate to="/sessions" replace />;

  const option = 'flex flex-col items-start gap-1 rounded-md border border-border-strong p-6 text-left hover:bg-surface';
  if (student) {
    return (
      <section className="flex max-w-xl flex-col gap-3" aria-labelledby="install-heading">
        <h1 id="install-heading" className="text-xl font-semibold">Install the extension to take exams</h1>
        <p>Students take exams with the Chrome extension, not this dashboard.</p>
        <ol className="list-decimal pl-6">
          <li>Get the extension folder from your examiner (or build it with <code>npm run build -w extension</code>).</li>
          <li>Open <code>chrome://extensions</code>, turn on Developer mode and choose Load unpacked.</li>
          <li>Click the extension's icon, choose “I'm a student”, and sign up or sign in.</li>
          <li>Enter the session code from your examiner.</li>
        </ol>
        <button className="self-start text-sm text-primary underline" onClick={() => setStudent(false)}>Back</button>
      </section>
    );
  }
  return (
    <section className="flex max-w-xl flex-col gap-4" aria-labelledby="chooser-heading">
      <h1 id="chooser-heading" className="text-xl font-semibold">Sign up or sign in as</h1>
      <button className={option} onClick={() => setStudent(true)}>
        <span className="text-lg font-semibold">I'm a student</span>
        <span className="text-sm text-muted">Take an exam with monitoring.</span>
      </button>
      <Link className={option} to="/login">
        <span className="text-lg font-semibold">I'm an admin</span>
        <span className="text-sm text-muted">Create exam sessions and review candidates.</span>
      </Link>
    </section>
  );
}
