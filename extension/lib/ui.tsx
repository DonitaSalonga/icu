// Small shared UI pieces for extension pages, following DSD.md § Components.
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { describeExamSite, type SessionSummary } from '@icu/core';

export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  const styles = {
    primary: 'bg-primary text-primary-on hover:bg-primary-hover',
    secondary: 'border border-border-strong bg-bg text-text hover:bg-surface',
    danger: 'bg-danger text-primary-on hover:opacity-90',
  }[variant];
  return <button className={`min-h-[44px] rounded-md px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`} {...props} />;
}

export function Field({ label, id, error, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; id: string; error?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-semibold">{label}</label>
      <input
        id={id}
        className={`min-h-[44px] rounded-sm border px-3 text-sm ${error ? 'border-danger' : 'border-border-strong'}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
      />
      {error && <p id={`${id}-error`} className="text-xs text-danger">{error}</p>}
    </div>
  );
}

export function Alert({ children }: { children: ReactNode }) {
  return <p role="alert" className="rounded-md bg-risk-high-bg p-3 text-sm text-risk-high-fg">{children}</p>;
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });
}

/** Where to take the exam and what it is (2026-11-15), so the student knows which site to open. */
export function ExamAbout({ session }: { session: SessionSummary }) {
  return (
    <>
      {session.description && <p className="whitespace-pre-line">{session.description}</p>}
      <p>
        Exam platform:{' '}
        {session.url_patterns.map((p, i) => (
          <span key={p} title={describeExamSite(p)}>{i > 0 && ', '}<strong>{p}</strong></span>
        ))}
      </p>
    </>
  );
}
