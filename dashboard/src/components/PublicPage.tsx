import type { ReactNode } from 'react';
import { Logo } from '@icu/ui-tokens/icons';

/** Signed-out screens, centred on the page (feedback 2026-11-15, after the user's "Sign in or join" inspiration):
 *  brand, title and an optional subtitle, then the content. */
export function PublicPage({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="pub">
      <main className="pubcol rise">
        <div className="brand pubbrand">
          <Logo height={34} />
          <span><span>I Caught You</span></span>
        </div>
        <div>
          <h1 className="h1 pubtitle">{title}</h1>
          {subtitle && <p className="pubsub">{subtitle}</p>}
        </div>
        {children}
      </main>
    </div>
  );
}
