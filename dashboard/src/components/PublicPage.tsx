import type { ReactNode } from 'react';
import { Logo } from '@icu/ui-tokens/icons';

/** Signed-out screens (design "Dashboard · Sign in"): brand, a large italic title, then the content. */
export function PublicPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '40px 24px' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
        <div className="brand" style={{ padding: '0 0 28px' }}>
          <Logo height={34} />
          <span><span>I Caught You</span></span>
        </div>
        <main className="rise">
          <h1 className="h1" style={{ fontSize: 44, marginBottom: 28 }}>{title}</h1>
          {children}
        </main>
      </div>
    </div>
  );
}
