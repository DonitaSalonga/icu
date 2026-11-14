import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const isConfigured = Boolean(url && key);

// Only the publishable key ships to the browser; RLS enforces access (R25).
export const supabase = isConfigured ? createClient(url!, key!) : undefined;

/** Maps RPC errors raised as ICU_* to user-facing text (DSD.md § Content and voice). */
export function errorText(error: { message: string } | null | undefined): string {
  const code = /^ICU_[A-Z_]+/.exec(error?.message ?? '')?.[0];
  const texts: Record<string, string> = {
    ICU_INVALID_INPUT: 'Check the form: every field is required and the end must be after the start.',
    ICU_NOT_ADMIN: 'This is a student account. Use the Chrome extension.',
  };
  return (code && texts[code]) || error?.message || 'Something went wrong. Check your connection and try again.';
}
