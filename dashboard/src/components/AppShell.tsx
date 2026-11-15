// The admin app shell from the ICU redesign (DSD v2) file: sidebar, breadcrumbs, sticky top bar, page area.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, matchPath, NavLink, useLocation } from 'react-router-dom';
import { Icon, Tile, type IconName } from '@icu/ui-tokens/icons';
import { useAuth } from '../auth';
import { useAdminData } from '../lib/admin-data';
import { supabase } from '../supabase';
import { initials } from '../ui';

const NAV: { to: string; label: string; icon: IconName; badge?: boolean }[] = [
  { to: '/overview', label: 'Overview', icon: 'overview' },
  { to: '/sessions', label: 'Sessions', icon: 'sessions' },
  { to: '/review', label: 'Needs review', icon: 'review', badge: true },
];

function Breadcrumbs() {
  const { pathname } = useLocation();
  const { sessions, attempts } = useAdminData();
  const crumbs: { label: string; to?: string }[] = [{ label: 'ICU', to: '/overview' }];
  const attemptMatch = matchPath('/sessions/:id/attempts/:attemptId', pathname);
  const sessionMatch = matchPath('/sessions/:id', pathname);
  if (attemptMatch) {
    const { id, attemptId } = attemptMatch.params;
    crumbs.push({ label: 'Sessions', to: '/sessions' });
    crumbs.push({ label: sessions.find((s) => s.id === id)?.name ?? 'Session', to: `/sessions/${id}` });
    crumbs.push({ label: attempts.find((a) => a.attempt_id === attemptId)?.full_name ?? 'Candidate' });
  } else if (sessionMatch) {
    crumbs.push({ label: 'Sessions', to: '/sessions' });
    crumbs.push({ label: sessions.find((s) => s.id === sessionMatch.params.id)?.name ?? 'Session' });
  } else if (pathname.startsWith('/sessions')) crumbs.push({ label: 'Sessions' });
  else if (pathname.startsWith('/review')) crumbs.push({ label: 'Needs review' });
  else if (pathname.startsWith('/account')) crumbs.push({ label: 'Account' });
  else crumbs.push({ label: 'Overview' });

  return (
    <nav aria-label="Breadcrumb" className="crumb">
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1;
        return (
          <span key={i} style={{ display: 'contents' }}>
            {i > 0 && <span aria-hidden="true">/</span>}
            {last || !c.to ? <span aria-current={last ? 'page' : undefined}>{c.label}</span> : <Link to={c.to}>{c.label}</Link>}
          </span>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const { needsReviewCount } = useAdminData();
  const { pathname } = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const main = useRef<HTMLElement>(null);

  // A new page starts at the top.
  useEffect(() => {
    main.current?.scrollTo(0, 0);
    setScrolled(false);
  }, [pathname]);

  return (
    <div className="app">
      <aside className="side">
        <Link className="brand" to="/overview">
          <Tile size={40} fontSize={19} />
          <span><b>ICU</b><span>I Caught You</span></span>
        </Link>
        <nav aria-label="Main">
          {NAV.map((n) => (
            <NavLink key={n.to} className="nav" to={n.to}>
              <Icon name={n.icon} />
              <span className="lbl">{n.label}</span>
              {n.badge && needsReviewCount > 0 && <span className="badge">{needsReviewCount}</span>}
            </NavLink>
          ))}
          <p className="sec">Account</p>
          <NavLink className="nav" to="/account">
            <Icon name="account" />
            <span className="lbl">Account</span>
          </NavLink>
        </nav>
        {profile && (
          <div className="userwrap">
            <div className="user">
              <span className="av" aria-hidden="true">{initials(profile.full_name)}</span>
              <p><b>{profile.full_name}</b><span>{profile.email}</span></p>
              <button type="button" className="iconbtn" aria-label="Sign out" onClick={() => void supabase?.auth.signOut()}>
                <Icon name="logout" />
              </button>
            </div>
          </div>
        )}
      </aside>
      <main ref={main} className="main" onScroll={(e) => { const s = e.currentTarget.scrollTop > 4; if (s !== scrolled) setScrolled(s); }}>
        <div className={`top ${scrolled ? 'sc' : ''}`}><Breadcrumbs /></div>
        <div className="content">{children}</div>
      </main>
    </div>
  );
}
