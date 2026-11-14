// Popup and notice page → service worker messaging with typed responses.
import type { Message, Response } from '@icu/core';

export async function send<T>(message: Message): Promise<Response<T>> {
  try {
    const res = (await browser.runtime.sendMessage(message)) as Response<T> | undefined;
    return res ?? { ok: false, code: 'ICU_NO_RESPONSE', message: 'No response from the extension.' };
  } catch (error) {
    return { ok: false, code: 'ICU_NO_RESPONSE', message: String(error) };
  }
}

/** User-facing text for error codes (DSD.md § Content and voice). */
export function errorText(code: string, fallback: string): string {
  const texts: Record<string, string> = {
    ICU_NOT_CONFIGURED: 'This build has no Supabase settings. Add them to .env and rebuild (see README).',
    ICU_CODE_NOT_FOUND: 'Code not found. Check the code with your examiner.',
    ICU_SESSION_ENDED: 'This exam has ended.',
    ICU_NOT_OPEN_YET: 'This exam has not started yet.',
    ICU_ALREADY_ACTIVE: 'You already have an exam in progress.',
    ICU_ATTEMPT_ACTIVE: 'End your exam before doing this.',
    ICU_ATTEMPT_ENDED: 'You already finished this exam.',
    ICU_CONSENT_REQUIRED: 'Confirm you are 18 or older and agree to the notice to start.',
    ICU_NOT_STUDENT: 'This is an admin account. Use the dashboard.',
    ICU_NO_RESPONSE: 'The extension did not respond. Try again.',
    ICU_RATE_LIMITED: 'Too many wrong codes. Wait 10 minutes, then try again.',
  };
  return texts[code] ?? (fallback || 'Something went wrong. Check your connection and try again.');
}
