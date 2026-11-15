// The admin app shell from the ICU redesign (DSD v2) file: sidebar and page area (breadcrumbs removed, feedback 2026-11-15).
import { useEffect, useRef, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Menu } from '@base-ui/react/menu';
import { Icon, Logo, type IconName } from '@icu/ui-tokens/icons';
import { useAuth } from '../auth';
import { useAdminData } from '../lib/admin-data';
import { supabase } from '../supabase';
import { initials } from '../ui';

const NAV: { to: string; label: string; icon: IconName; badge?: boolean }[] = [
  { to: '/overview', label: 'Overview', icon: 'overview' },
  { to: '/sessions', label: 'Sessions', icon: 'sessions' },
  { to: '/review', label: 'Needs review', icon: 'review', badge: true },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const { needsReviewCount } = useAdminData();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const main = useRef<HTMLElement>(null);

  // A new page starts at the top.
  useEffect(() => {
    main.current?.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="app">
      <aside className="side">
        <Link className="brand" to="/overview">
          <Logo height={30} />
          <span><span>I Caught You</span></span>
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
              {/* Account menu (Base UI): keyboard and screen-reader handling for the menu. */}
              <Menu.Root>
                <Menu.Trigger className="usermenu">
                  <span className="av" aria-hidden="true">{initials(profile.full_name)}</span>
                  <p><b>{profile.full_name}</b><span>{profile.email}</span></p>
                </Menu.Trigger>
                <Menu.Portal>
                  <Menu.Positioner side="top" align="start" sideOffset={8} className="menupos">
                    <Menu.Popup className="menu">
                      <Menu.Item className="menuitem" onClick={() => navigate('/account')}><Icon name="account" /> Account</Menu.Item>
                      <Menu.Item className="menuitem" onClick={() => void supabase?.auth.signOut()}><Icon name="logout" /> Sign out</Menu.Item>
                    </Menu.Popup>
                  </Menu.Positioner>
                </Menu.Portal>
              </Menu.Root>
              <button type="button" className="iconbtn" aria-label="Sign out" onClick={() => void supabase?.auth.signOut()}>
                <Icon name="logout" />
              </button>
            </div>
          </div>
        )}
      </aside>
      <main ref={main} className="main">
        {/* Switching pages fades the new page in (".page"). */}
        <div key={pathname} className="content page">{children}</div>
      </main>
    </div>
  );
}
