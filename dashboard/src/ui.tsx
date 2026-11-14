// Shared dashboard UI pieces (DSD.md § Components). M1 keeps these minimal.
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' }) {
  const styles = variant === 'primary' ? 'bg-primary text-primary-on hover:bg-primary-hover' : 'border border-border bg-bg hover:bg-surface';
  return <button className={`min-h-[36px] rounded-md px-4 text-sm font-semibold disabled:opacity-50 ${styles} ${className}`} {...props} />;
}

export function Field({ label, id, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; id: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-semibold">{label}</label>
      <input id={id} className="min-h-[36px] rounded-sm border border-border px-3 text-sm" {...props} />
    </div>
  );
}

export function Alert({ children }: { children: ReactNode }) {
  return <p role="alert" className="rounded-md bg-risk-high-bg p-3 text-sm text-risk-high-fg">{children}</p>;
}

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'medium' });

export const formatTime = (iso: string | Date) =>
  new Date(iso).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour12: false });

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min ${s % 60} s`;
  return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
}
