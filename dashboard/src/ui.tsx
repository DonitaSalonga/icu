// Shared dashboard UI pieces (DSD.md § Components).
import { useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import type { RiskLevel } from '@ocm/core';

type Variant = 'primary' | 'secondary' | 'danger';

export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const styles = {
    primary: 'bg-primary text-primary-on hover:bg-primary-hover',
    secondary: 'border border-border bg-bg text-text hover:bg-surface',
    danger: 'bg-danger text-primary-on hover:opacity-90',
  }[variant];
  return <button className={`min-h-[36px] rounded-md px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`} {...props} />;
}

export function Field({ label, id, error, hint, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; id: string; error?: string; hint?: string }) {
  const describedBy = [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-semibold">{label}</label>
      <input
        id={id}
        className={`min-h-[36px] rounded-sm border px-3 text-sm ${error ? 'border-danger' : 'border-border'}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...props}
      />
      {hint && <p id={`${id}-hint`} className="text-xs text-muted">{hint}</p>}
      {error && <p id={`${id}-error`} className="text-xs text-danger">{error}</p>}
    </div>
  );
}

export function Alert({ children }: { children: ReactNode }) {
  return <p role="alert" className="rounded-md bg-risk-high-bg p-3 text-sm text-risk-high-fg">{children}</p>;
}

/** Risk level with icon shape and text, never colour alone (DSD § Accessibility). */
export function RiskBadge({ level, score }: { level: RiskLevel; score?: number }) {
  const map = {
    low: { icon: '●', text: 'Low', cls: 'bg-risk-low-bg text-risk-low-fg' },
    medium: { icon: '▲', text: 'Medium', cls: 'bg-risk-med-bg text-risk-med-fg' },
    high: { icon: '■', text: 'High', cls: 'bg-risk-high-bg text-risk-high-fg' },
  }[level];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${map.cls}`}>
      <span aria-hidden>{map.icon}</span>
      {map.text}
      {score !== undefined && <span className="font-normal">· {score}</span>}
    </span>
  );
}

export const VERDICTS = [
  { value: 'cleared', label: 'Cleared', cls: 'bg-risk-low-bg text-risk-low-fg' },
  { value: 'suspicious', label: 'Suspicious', cls: 'bg-risk-med-bg text-risk-med-fg' },
  { value: 'cheating_confirmed', label: 'Cheating confirmed', cls: 'bg-risk-high-bg text-risk-high-fg' },
] as const;

export function VerdictBadge({ verdict }: { verdict: string | null }) {
  const v = VERDICTS.find((x) => x.value === verdict);
  if (!v) return <span className="inline-flex rounded-full border border-border px-2 py-0.5 text-xs text-muted">Not reviewed</span>;
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${v.cls}`}>{v.label}</span>;
}

/** Modal dialog on the native <dialog> element: focus is trapped, Esc closes, focus returns to the trigger. */
export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="dialog-title" className="w-[min(640px,calc(100vw-32px))] rounded-lg p-0 shadow-3 backdrop:bg-black/40">
      <div className="flex flex-col gap-4 p-6">
        <h2 id="dialog-title" className="text-lg font-semibold">{title}</h2>
        {children}
      </div>
    </dialog>
  );
}

export function Toast({ message, onDone }: { message?: string; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, 5000);
    return () => clearTimeout(t);
  }, [message, onDone]);
  if (!message) return null;
  return (
    <div role="status" className="fixed bottom-4 right-4 rounded-md bg-text px-4 py-3 text-sm text-bg shadow-2">
      {message}
    </div>
  );
}

const TZ = 'Asia/Manila';
export const formatDateTime = (iso: string) => new Date(iso).toLocaleString('en-PH', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' });
export const formatTime = (iso: string | Date) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: TZ, hour12: false });
export const formatDate = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { timeZone: TZ, dateStyle: 'medium' });

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min ${s % 60} s`;
  return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
}
