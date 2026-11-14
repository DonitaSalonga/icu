// Dashboard routes (SDD.md § Dashboard routes).
import type { ReactNode } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import { AttemptReview } from './pages/AttemptReview';
import { Login } from './pages/Login';
import { RoleChooser } from './pages/RoleChooser';
import { SessionDetail } from './pages/SessionDetail';
import { Sessions } from './pages/Sessions';
import { isConfigured, supabase } from './supabase';
import { Alert, Button } from './ui';

function Shell({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between px-6 py-3">
          <Link to="/sessions" className="text-lg font-semibold" aria-label="ICU, I Caught You, home">
            ICU <span className="text-sm font-normal text-muted">I Caught You</span>
          </Link>
          {profile && (
            <Button variant="secondary" onClick={() => void supabase?.auth.signOut()}>Sign out</Button>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-[1280px] px-6 py-6">{children}</main>
    </div>
  );
}

/** R3: only admins use the dashboard. */
function AdminOnly({ children }: { children: ReactNode }) {
  const { loading, session, profile } = useAuth();
  if (loading) return <p className="text-sm text-muted">Loading…</p>;
  if (!session) return <Navigate to="/" replace />;
  if (profile?.role !== 'admin') {
    return (
      <div className="flex max-w-md flex-col gap-3">
        <Alert>This is a student account. Use the Chrome extension.</Alert>
        <Button variant="secondary" onClick={() => void supabase?.auth.signOut()}>Sign out</Button>
      </div>
    );
  }
  return <>{children}</>;
}

export function App() {
  if (!isConfigured) {
    return (
      <Shell>
        <Alert>Missing Supabase settings. Copy .env.example to .env, fill it in, and restart (see README).</Alert>
      </Shell>
    );
  }
  return (
    <BrowserRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<RoleChooser />} />
          <Route path="/login" element={<Login />} />
          <Route path="/sessions" element={<AdminOnly><Sessions /></AdminOnly>} />
          <Route path="/sessions/:id" element={<AdminOnly><SessionDetail /></AdminOnly>} />
          <Route path="/sessions/:id/attempts/:attemptId" element={<AdminOnly><AttemptReview /></AdminOnly>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  );
}
