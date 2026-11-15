// First-run welcome page (design "Extension · Welcome"), opened once after install by the background script.
import { useEffect, useState } from 'react';
import { Icon, Tile } from '@icu/ui-tokens/icons';

export function Welcome() {
  const [pinned, setPinned] = useState(false);

  // Step 1 also ticks by itself once ICU is on the toolbar (Chrome 91+: action.getUserSettings).
  useEffect(() => {
    const check = () => void browser.action.getUserSettings?.().then((s) => s?.isOnToolbar && setPinned(true)).catch(() => undefined);
    check();
    const timer = setInterval(check, 1000);
    return () => clearInterval(timer);
  }, []);

  // Opening the popup from a page needs Chrome 127+; older versions simply don't open it.
  const openIcu = () => void (browser.action as unknown as { openPopup?: () => Promise<void> }).openPopup?.().catch(() => undefined);

  return (
    <div style={{ width: 900, maxWidth: '100%', minHeight: 800, margin: '0 auto', padding: '72px 56px', background: 'var(--bg)' }}>
      <main className="rise">
        <div style={{ marginBottom: 24 }}><Tile size={48} fontSize={19} /></div>
        <h1 className="h1" style={{ fontSize: 52, marginBottom: 12 }}>Welcome to ICU</h1>
        <p style={{ color: 'var(--muted)', fontSize: 18, marginBottom: 36 }}>Three quick steps and you're ready to join your exam.</p>
        <section className="card" style={{ borderRadius: 28, marginBottom: 20, display: 'flex', gap: 20, alignItems: 'flex-start' }}>
          <span className="av" style={{ width: 52, height: 52, fontSize: 17, flex: 'none' }} aria-hidden="true">{pinned ? '✓' : '1'}</span>
          <div style={{ flex: 1 }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}><Icon name="pin" size={22} /> Pin ICU</h2>
            <p style={{ color: 'var(--muted)' }}>Click the puzzle-piece icon at the top right of Chrome, then the pin next to ICU, so it stays on your toolbar.</p>
            <button type="button" className="btn s sm" style={{ marginTop: 14 }} aria-pressed={pinned} onClick={() => setPinned(!pinned)}>{pinned ? 'Pinned' : "I've pinned it"}</button>
          </div>
        </section>
        <section className="card" style={{ borderRadius: 28, marginBottom: 28, display: 'flex', gap: 20, alignItems: 'flex-start' }}>
          <span className="av" style={{ width: 52, height: 52, fontSize: 17, flex: 'none' }} aria-hidden="true">2</span>
          <div style={{ flex: 1 }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}><Icon name="student" size={22} /> Sign in</h2>
            <p style={{ color: 'var(--muted)' }}>Click the ICU icon and choose “I'm a student”.</p>
            <button type="button" className="btn p sm" style={{ marginTop: 14 }} onClick={openIcu}>Open ICU</button>
          </div>
        </section>
        <p style={{ color: 'var(--muted)' }}>You can close this tab.</p>
      </main>
    </div>
  );
}
