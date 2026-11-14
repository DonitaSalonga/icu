// Exam-tab binding, tab events and heartbeats in the service worker (SDD.md § Key flows F3).
// M1 scope: exam_tab_hidden / exam_tab_visible (R10) and heartbeats with the alarm backup (R14).
import { matchExamUrl, type EventType, type SwMessage } from '@ocm/core';
import { createLock } from './lock';
import { enqueue, flush } from './queue';
import { loadAttempt, serverNow, updateAttempt, type StoredAttempt } from './state';
import { getSupabase } from './supabase';

const withLock = createLock();
const ALARM_HEARTBEAT_MIN_GAP_MS = 20_000;

const isExamUrl = (attempt: StoredAttempt, url: string | undefined) =>
  url !== undefined && matchExamUrl(url, attempt.session.url_patterns);

async function activeAttempt(): Promise<StoredAttempt | undefined> {
  const attempt = await loadAttempt();
  return attempt?.state === 'active' ? attempt : undefined;
}

export async function recordEvent(type: EventType, details: Record<string, unknown> = {}): Promise<void> {
  const attempt = await activeAttempt();
  if (!attempt) return;
  await enqueue({
    id: crypto.randomUUID(),
    attempt_id: attempt.attempt_id,
    type,
    occurred_at: new Date(serverNow(attempt)).toISOString(),
    details,
  });
  void flush();
}

export async function sendToTab(tabId: number, message: SwMessage): Promise<void> {
  try {
    await browser.tabs.sendMessage(tabId, message);
  } catch {
    // No content script in that tab yet (e.g. the page loaded before install). Re-injection is M5;
    // the heartbeat alarm backup still runs meanwhile.
    console.warn('[ocm] could not reach content script in tab', tabId);
  }
}

/** R9 (M1 part): bind the active tab if it matches, otherwise the first matching tab. */
export function bindExamTab(): Promise<void> {
  return withLock(async () => {
    const attempt = await activeAttempt();
    if (!attempt) return;
    if (attempt.exam_tab_id !== undefined) {
      const bound = await browser.tabs.get(attempt.exam_tab_id).catch(() => undefined);
      if (bound && isExamUrl(attempt, bound.url)) return;
    }
    const [active] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
    const tab = active && isExamUrl(attempt, active.url)
      ? active
      : (await browser.tabs.query({})).find((t) => isExamUrl(attempt, t.url));
    await updateAttempt({ exam_tab_id: tab?.id, exam_window_id: tab?.windowId, hidden_at: undefined });
    if (tab?.id !== undefined) await sendToTab(tab.id, { type: 'sw.activate' });
  });
}

export async function onTabUpdated(tabId: number, status: string | undefined, url: string | undefined): Promise<void> {
  const attempt = await activeAttempt();
  if (!attempt || attempt.exam_tab_id !== undefined) return;
  if (status === 'complete' && isExamUrl(attempt, url)) {
    await bindExamTab();
    if ((await loadAttempt())?.exam_tab_id === tabId) await heartbeat('content', tabId);
  }
}

export function onTabRemoved(tabId: number): Promise<void> {
  return withLock(async () => {
    const attempt = await activeAttempt();
    if (attempt?.exam_tab_id === tabId) {
      await updateAttempt({ exam_tab_id: undefined, exam_window_id: undefined, hidden_at: undefined });
    }
  });
}

/** R10: leaving and returning to the exam tab within its window. */
export function onTabActivated(tabId: number, windowId: number): Promise<void> {
  return withLock(async () => {
    const attempt = await activeAttempt();
    if (!attempt || attempt.exam_tab_id === undefined || windowId !== attempt.exam_window_id) return;
    if (tabId !== attempt.exam_tab_id && attempt.hidden_at === undefined) {
      await updateAttempt({ hidden_at: serverNow(attempt) });
      await recordEvent('exam_tab_hidden');
    } else if (tabId === attempt.exam_tab_id && attempt.hidden_at !== undefined) {
      const away_ms = serverNow(attempt) - attempt.hidden_at;
      await updateAttempt({ hidden_at: undefined });
      await recordEvent('exam_tab_visible', { away_ms });
    }
  });
}

/**
 * R14: push heartbeat. 'content' comes every 15 s from the exam tab; 'alarm' is the 30 s backup for
 * when Chrome throttles the hidden exam tab. No exam tab → no heartbeat, so closing it creates a gap.
 */
export async function heartbeat(source: 'content' | 'alarm', senderTabId?: number): Promise<void> {
  const attempt = await activeAttempt();
  if (!attempt || attempt.exam_tab_id === undefined) return;
  if (source === 'content' && senderTabId !== attempt.exam_tab_id) return;
  if (source === 'alarm') {
    const last = attempt.last_heartbeat_at ? Date.parse(attempt.last_heartbeat_at) : 0;
    if (Date.now() - last < ALARM_HEARTBEAT_MIN_GAP_MS) return;
    const tab = await browser.tabs.get(attempt.exam_tab_id).catch(() => undefined);
    if (!tab) return;
  }
  const { error } = await getSupabase().from('heartbeats').insert({ attempt_id: attempt.attempt_id, source });
  if (error) {
    console.warn('[ocm] heartbeat failed', error.message);
    return;
  }
  await updateAttempt({ last_heartbeat_at: new Date().toISOString() });
}
