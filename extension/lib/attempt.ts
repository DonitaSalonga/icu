// Join, start and end an attempt (R6–R8). SDD.md § Key flows F2, F4.
import { initialWarningState, normalizeSessionCode, type AttemptStatus, type JoinResult } from '@icu/core';
import { SCREENSHOT_PERIOD_MIN, SUPABASE_URL } from './env';
import { IcuError } from './errors';
import { ALARM_NOT_DETECTED, bindExamTab, sendToTab, startMonitoring } from './monitor';
import { flush, isUploadFailing, queueSize } from './queue';
import { clearAttempt, loadAttempt, saveAttempt, updateAttempt } from './state';
import { getSupabase } from './supabase';

export const ALARM_HEARTBEAT = 'icu-heartbeat';
export const ALARM_END = 'icu-end';
export const ALARM_SCREENSHOT = 'icu-screenshot';

export async function joinSession(code: string): Promise<JoinResult> {
  const current = await loadAttempt();
  if (current?.state === 'active') throw new IcuError('ICU_ALREADY_ACTIVE');
  const { data, error } = await getSupabase().rpc('join_session', { p_code: normalizeSessionCode(code) });
  if (error) throw error;
  // An unknown code is returned as a result so the server can count failures (R6 rate limit).
  if ((data as { error?: string }).error) throw new IcuError((data as { error: string }).error);
  const result = data as JoinResult;
  await saveAttempt({
    attempt_id: result.attempt_id,
    session: result.session,
    state: result.status === 'ended' ? 'ended' : 'joined',
    clock_offset_ms: 0,
  });
  return result;
}

export async function openNotice(): Promise<void> {
  await browser.tabs.create({ url: browser.runtime.getURL('/notice.html') });
}

export async function ensureAlarms(endsAtLocalMs: number): Promise<void> {
  if (!(await browser.alarms.get(ALARM_HEARTBEAT))) {
    await browser.alarms.create(ALARM_HEARTBEAT, { periodInMinutes: 0.5 });
  }
  if (!(await browser.alarms.get(ALARM_SCREENSHOT))) {
    await browser.alarms.create(ALARM_SCREENSHOT, { periodInMinutes: SCREENSHOT_PERIOD_MIN });
  }
  if (!(await browser.alarms.get(ALARM_END))) {
    await browser.alarms.create(ALARM_END, { when: Math.max(endsAtLocalMs, Date.now() + 1000) });
  }
}

export async function startAttempt(ageConfirmed: boolean, consentVersion: string): Promise<{ started_at: string; ends_at: string }> {
  const attempt = await loadAttempt();
  if (!attempt || attempt.state !== 'joined') throw new IcuError('ICU_NO_JOINED_ATTEMPT');
  const sentAt = Date.now();
  const { data, error } = await getSupabase().rpc('start_attempt', {
    p_attempt_id: attempt.attempt_id,
    p_consent_version: consentVersion,
    p_age_confirmed: ageConfirmed,
  });
  if (error) throw error;
  const result = data as { started_at: string; ends_at: string; server_now: string; uninstall_token: string };
  const clock_offset_ms = Date.parse(result.server_now) - (sentAt + Date.now()) / 2;
  // R15: best-effort signal if the extension is removed mid-exam. The token is opaque and single-use.
  await browser.runtime.setUninstallURL(`${SUPABASE_URL}/functions/v1/uninstall-beacon?t=${result.uninstall_token}`);
  await saveAttempt({ ...attempt, state: 'active', started_at: result.started_at, clock_offset_ms, warnings: initialWarningState() });
  await ensureAlarms(Date.parse(result.ends_at) - clock_offset_ms);
  await startMonitoring();
  return { started_at: result.started_at, ends_at: result.ends_at };
}

export async function endAttempt(reason: 'student' | 'time_window'): Promise<{ ended_at: string | null }> {
  const attempt = await loadAttempt();
  if (!attempt || attempt.state !== 'active') throw new IcuError('ICU_NO_ACTIVE_ATTEMPT');
  await flush();
  const { data, error } = await getSupabase().rpc('end_attempt', { p_attempt_id: attempt.attempt_id, p_reason: reason });
  // A student-initiated End must reach the server; at the time-window end the server caps the attempt anyway (F4).
  if (error && reason === 'student') throw error;
  const ended_at = (data as { ended_at: string | null } | null)?.ended_at ?? new Date().toISOString();
  await browser.alarms.clear(ALARM_HEARTBEAT);
  await browser.alarms.clear(ALARM_END);
  await browser.alarms.clear(ALARM_NOT_DETECTED);
  await browser.alarms.clear(ALARM_SCREENSHOT);
  await browser.runtime.setUninstallURL('');
  if (attempt.exam_tab_id !== undefined) await sendToTab(attempt.exam_tab_id, { type: 'sw.deactivate' });
  // Leave the fullscreen the extension switched on at Start (R13).
  if (attempt.exam_window_id !== undefined && attempt.fullscreen_requested) {
    await browser.windows.update(attempt.exam_window_id, { state: 'normal' }).catch(() => undefined);
  }
  await updateAttempt({ state: 'ended', ended_at, exam_tab_id: undefined, exam_window_id: undefined, hidden_at: undefined, blurred_at: undefined });
  return { ended_at };
}

export async function attemptStatus(): Promise<AttemptStatus> {
  const attempt = await loadAttempt();
  return {
    state: attempt?.state ?? 'idle',
    session: attempt?.session,
    attempt_id: attempt?.attempt_id,
    started_at: attempt?.started_at,
    ended_at: attempt?.ended_at,
    exam_tab_bound: attempt?.exam_tab_id !== undefined,
    queue_size: await queueSize(),
    last_heartbeat_at: attempt?.last_heartbeat_at,
    warnings: attempt?.state === 'active' ? { n: attempt.warnings?.count ?? 0, limit: attempt.session.warning_limit } : undefined,
    upload_failing: isUploadFailing(),
  };
}

export async function resetAttempt(): Promise<void> {
  if ((await loadAttempt())?.state === 'active') throw new IcuError('ICU_ATTEMPT_ACTIVE');
  await clearAttempt();
}

/** F5: on every service-worker start, resume an active attempt or close it if the window passed. */
export async function recover(): Promise<void> {
  const attempt = await loadAttempt();
  if (attempt?.state !== 'active') return;
  const endsAtLocal = Date.parse(attempt.session.ends_at) - attempt.clock_offset_ms;
  if (Date.now() >= endsAtLocal) {
    await endAttempt('time_window');
    return;
  }
  await ensureAlarms(endsAtLocal);
  await bindExamTab();
  void flush();
}
