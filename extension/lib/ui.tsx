// Shared pieces for extension pages, built from the ICU redesign (DSD v2) file's classes (packages/ui-tokens/icu.css).
import { Logo } from '@icu/ui-tokens/icons';

const TZ = 'Asia/Manila';

/** Popup header (design "Extension · Popup"): tile, "ICU", "I Caught You". */
export function PopupHeader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 16px 12px' }}>
      <Logo height={24} />
      <span style={{ color: 'var(--muted)' }}>I Caught You</span>
    </div>
  );
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { timeZone: TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** "00:12:04" */
export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, '0')).join(':');
}
