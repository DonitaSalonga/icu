import type { Response } from '@icu/core';

/** Maps thrown errors (including Supabase errors raised as ICU_* by RPCs) to a message response. */
export function toErrorResponse(error: unknown): Response<never> {
  const message = error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String((error as { message: unknown }).message) : String(error);
  const code = /^ICU_[A-Z_]+/.exec(message)?.[0] ?? 'ICU_UNEXPECTED';
  return { ok: false, code, message };
}

export class IcuError extends Error {
  constructor(code: string) {
    super(code);
  }
}
