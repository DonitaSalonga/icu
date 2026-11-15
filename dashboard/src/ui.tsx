// Shared dashboard UI pieces, built from the ICU redesign (DSD v2) file's classes (packages/ui-tokens/icu.css).
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { RiskLevel } from '@icu/core';
import { Icon } from '@icu/ui-tokens/icons';

export { Icon };

/** Overlays sit in the app frame, outside the scrolling page, as in the design (scrim, dialog, toast, lightbox). */
export function Overlay({ children }: { children: ReactNode }) {
  const host = document.querySelector('.app') ?? document.body;
  return createPortal(children, host);
}

const RISK = {
  high: { cls: 'hi', shape: 'sq', text: 'High' },
  medium: { cls: 'md', shape: 'tri', text: 'Medium' },
  low: { cls: 'lo', shape: 'dot', text: 'Low' },
} as const;

/** Risk level with a shape and text, never colour alone. */
export function RiskPill({ level, score }: { level: RiskLevel; score?: number }) {
  const r = RISK[level];
  return (
    <span className={`pill ${r.cls}`}>
      <span className={r.shape} />
      {r.text}
      {score !== undefined && ` · ${score}`}
    </span>
  );
}

export function StatusPill({ status }: { status: 'Upcoming' | 'Active' | 'Ended' }) {
  if (status === 'Active') return <span className="pill live"><span className="dot" />Live</span>;
  return <span className="pill">{status}</span>;
}

/** Segmented control with a sliding thumb (design "seg"); buttons are toggles with aria-pressed. */
export function Seg<T extends string>({ label, options, value, onChange }: { label: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const pos = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div className={`seg n${options.length}`} role="group" aria-label={label}>
      <span className={`thumb p${pos}`} aria-hidden="true" />
      {options.map((o) => (
        <button key={o.value} type="button" className={o.value === value ? 'on' : ''} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Dialog (design "scrim" + "dlg"). Focus moves into the dialog, Tab stays inside, Esc closes, and focus
 * returns to whatever opened it. It is always rendered so the open/close transitions play.
 */
export function Dialog({ open, onClose, titleId, children }: { open: boolean; onClose: () => void; titleId: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open) {
      opener.current = document.activeElement as HTMLElement | null;
      el.querySelector<HTMLElement>('input, textarea, select, button')?.focus();
    } else if (opener.current) {
      opener.current.focus();
      opener.current = null;
    }
  }, [open]);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
    if (e.key !== 'Tab' || !ref.current) return;
    const items = [...ref.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, textarea, select')];
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  };
  return (
    <Overlay>
      <div className={`scrim ${open ? 'open' : ''}`} onClick={onClose} />
      <div ref={ref} className={`dlg ${open ? 'open' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-hidden={!open} onKeyDown={onKeyDown} {...(open ? {} : { inert: '' })}>
        {children}
        <button type="button" className="iconbtn x" aria-label="Close" onClick={onClose}><Icon name="close" /></button>
      </div>
    </Overlay>
  );
}

/** Toast (design "toast"): slides up for 3.2 s. */
export function Toast({ message, onDone }: { message?: string; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [message, onDone]);
  return (
    <Overlay>
      <div className={`toast ${message ? 'show' : ''}`} role="status" aria-live="polite">
        <Icon name="check" size={18} />
        <span>{message}</span>
      </div>
    </Overlay>
  );
}

export function Alert({ children }: { children: ReactNode }) {
  return <p className="err" role="alert">{children}</p>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><b>{title}</b>{children}</div>;
}

export function Loading() {
  return <div className="empty" role="status"><b>Loading…</b></div>;
}

export const VERDICTS = [
  { value: 'cleared', label: 'Cleared' },
  { value: 'suspicious', label: 'Suspicious' },
  { value: 'cheating_confirmed', label: 'Cheating confirmed' },
] as const;

const TZ = 'Asia/Manila';
/** "Nov 15, 2026, 3:30 PM" */
export const formatDateTime = (iso: string) => new Date(iso).toLocaleString('en-US', { timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
/** "Nov 15, 3:30 PM" */
export const formatShort = (iso: string) => new Date(iso).toLocaleString('en-US', { timeZone: TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
/** "15:30:16" */
export const formatTime = (iso: string | Date) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: TZ, hour12: false });
export const formatDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric' });

const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
const monthDay = (iso: string) => new Date(iso).toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric' });
/** "3:25 – 4:55 PM" (AM/PM shown once when both ends share it). */
export function timeRange(startIso: string, endIso: string): string {
  const a = clock(startIso);
  const b = clock(endIso);
  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)} – ${b}` : `${a} – ${b}`;
}
/** "Nov 15 · 3:25 – 4:55 PM" (sessions table). */
export const scheduleDot = (s: { starts_at: string; ends_at: string }) => `${monthDay(s.starts_at)} · ${timeRange(s.starts_at, s.ends_at)}`;
/** "Nov 15, 3:25 – 4:55 PM" (overview). */
export const scheduleComma = (s: { starts_at: string; ends_at: string }) => `${monthDay(s.starts_at)}, ${timeRange(s.starts_at, s.ends_at)}`;
/** "Nov 15, 2026, 3:25 PM – 4:55 PM" (exam info). */
export const scheduleFull = (s: { starts_at: string; ends_at: string }) => `${formatDateTime(s.starts_at)} – ${clock(s.ends_at)}`;

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min ${s % 60} s`;
  return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
}

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || '?';
