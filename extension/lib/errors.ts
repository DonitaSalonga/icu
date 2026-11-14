import type { Response } from '@ocm/core';

/** Maps thrown errors (including Supabase errors raised as OCM_* by RPCs) to a message response. */
export function toErrorResponse(error: unknown): Response<never> {
  const message = error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String((error as { message: unknown }).message) : String(error);
  const code = /^OCM_[A-Z_]+/.exec(message)?.[0] ?? 'OCM_UNEXPECTED';
  return { ok: false, code, message };
}

export class OcmError extends Error {
  constructor(code: string) {
    super(code);
  }
}
