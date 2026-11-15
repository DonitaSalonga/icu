// Dashboard routes (SDD.md § Dashboard routes; DSD v2 adds /overview, /review and /account).
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import { AppShell } from './components/AppShell';
import { PublicPage } from './components/PublicPage';
import { AdminDataProvider } from './lib/admin-data';
import { Account } from './pages/Account';
import { AttemptReview } from './pages/AttemptReview';
import { Login } from './pages/Login';
import { Overview } from './pages/Overview';
import { Review } from './pages/Review';
import { RoleChooser } from './pages/RoleChooser';
import { SessionDetail } from './pages/SessionDetail';
import { Sessions } from './pages/Sessions';
import { isConfigured, supabase } from './supabase';

/** R3: only admins use the dashboard. */
function AdminLayout() {
  const { loading, session, profile } = useAuth();
  if (loading) return <PublicPage title="Loading…"><span /></PublicPage>;
  if (!session) return <Navigate to="/" replace />;
  if (profile?.role !== 'admin') {
    return (
      <PublicPage title="Admin">
        <section className="card" style={{ maxWidth: 440 }}>
          <p className="err" role="alert" style={{ marginTop: 0, marginBottom: 18 }}>This is a student account. Use the Chrome extension.</p>
          <button type="button" className="btn s" onClick={() => void supabase?.auth.signOut()}>Sign out</button>
        </section>
      </PublicPage>
    );
  }
  return (
    <AdminDataProvider>
      <AppShell><Outlet /></AppShell>
    </AdminDataProvider>
  );
}

export function App() {
  if (!isConfigured) {
    return (
      <PublicPage title="Setup needed">
        <p className="err" role="alert">Missing Supabase settings. Copy .env.example to .env, fill it in, and restart (see README).</p>
      </PublicPage>
    );
  }
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RoleChooser />} />
        <Route path="/login" element={<Login />} />
        <Route element={<AdminLayout />}>
          <Route path="/overview" element={<Overview />} />
          <Route path="/sessions" element={<Sessions />} />
          <Route path="/sessions/:id" element={<SessionDetail />} />
          <Route path="/sessions/:id/attempts/:attemptId" element={<AttemptReview />} />
          <Route path="/review" element={<Review />} />
          <Route path="/account" element={<Account />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
