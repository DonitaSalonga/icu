// Monitoring loop in the service worker (SDD.md § Key flows F3): exam-tab binding, tab, window
// and fullscreen events, visited URLs, live warnings, and heartbeats.
// All state changes run under one lock. Functions named *Locked assume the lock is held.
import {
  decideCapture,
  decideWarning,
  initialWarningState,
  LIMIT_REACHED_TEXT,
  matchExamUrl,
  sanitizeUrl,
  shouldCaptureInterval,
  WARNING_TEXT,
  WARNING_TYPES,
  type EventType,
  type SwMessage,
} from '@icu/core';
import { NOT_DETECTED_DELAY_MS } from './env';
import { createLock } from './lock';
import { captureVisible, blobToBase64 } from './capture';
import { enqueue, enqueueShot, flush, type QueuedShot } from './queue';
import { loadAttempt, serverNow, updateAttempt, type StoredAttempt } from './state';
import { getSupabase } from './supabase';

const withLock = createLock();
const ALARM_HEARTBEAT_MIN_GAP_MS = 20_000;
export const ALARM_NOT_DETECTED = 'icu-not-detected';

const isExamUrl = (attempt: StoredAttempt, url: string | undefined) =>
  url !== undefined && matchExamUrl(url, attempt.session.url_patterns);

async function activeAttempt(): Promise<StoredAttempt | undefined> {
  const attempt = await loadAttempt();
  return attempt?.state === 'active' ? attempt : undefined;
}

export async function sendToTab(tabId: number, message: SwMessage): Promise<void> {
  try {
    await browser.tabs.sendMessage(tabId, message);
    return;
  } catch (e) {
    // Inject only when no live content script exists, so a tab never runs two copies.
    if (message.type !== 'sw.activate' || !/Receiving end does not exist/i.test(String(e))) return;
  }
  // No content script in the tab: the page loaded before the extension was installed or re-enabled
  // (SDD F5). Inject it into every frame, then activate.
  try {
    await browser.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['/content-scripts/content.js'] });
    await browser.tabs.sendMessage(tabId, message);
  } catch (e) {
    console.warn('[icu] could not reach or inject the content script in tab', tabId, e);
  }
}

// ---------------------------------------------------------------------------
// Events and warnings (R17)
// ---------------------------------------------------------------------------

async function showWarning(attempt: StoredAttempt, n: number, type: EventType, limitReached: boolean): Promise<void> {
  const limit = attempt.session.warning_limit;
  const reason = WARNING_TEXT[type] ?? '';
  const text = limitReached ? `${reason} ${LIMIT_REACHED_TEXT}` : reason;
  if (attempt.exam_tab_id !== undefined) {
    await sendToTab(attempt.exam_tab_id, { type: 'sw.showWarning', n, limit, text, limitReached });
  }
  // The notification shows even when the exam tab isn't visible (SDD F3).
  await browser.notifications
    .create(`icu-warning-${attempt.attempt_id}-${n}`, {
      type: 'basic',
      iconUrl: browser.runtime.getURL('/icon/128.png'),
      title: limitReached ? 'Exam warning limit reached' : `Exam warning ${Math.min(n, limit)} of ${limit}`,
      message: text,
      priority: 2,
    })
    .catch((e) => console.warn('[icu] notification failed', e));
}

async function enqueueEvent(attempt: StoredAttempt, type: EventType, details: Record<string, unknown>, at: number, screenshot_id?: string) {
  await enqueue({ id: crypto.randomUUID(), attempt_id: attempt.attempt_id, type, occurred_at: new Date(at).toISOString(), details, screenshot_id });
}

/** R16: captures and queues a screenshot; returns its id, or undefined after recording screenshot_failed. */
/** True when Chrome refused because the visible tab hasn't committed a page yet (e.g. a just-opened tab). */
const notYetLoaded = (error: string) => /Cannot access contents of url ""/.test(error);

async function shotFrom(attempt: StoredAttempt, id: string, reason: QueuedShot['reason'], at: number, windowId?: number): Promise<QueuedShot | { error: string }> {
  const result = await captureVisible(windowId);
  if (!result.ok) return { error: result.error };
  return {
    id,
    attempt_id: attempt.attempt_id,
    session_id: attempt.session.id,
    captured_at: new Date(at).toISOString(),
    reason,
    bytes: result.blob.size,
    visible_host: result.visible?.host,
    visible_path: result.visible?.path,
    data: await blobToBase64(result.blob),
    failures: 0,
  };
}

/**
 * R16: captures and queues a screenshot and returns its id. If the visible tab hasn't loaded yet (the
 * student is switching to a new tab), no screenshot is taken here: the site-visit capture takes the
 * loaded page a moment later. Other failures are recorded as screenshot_failed.
 */
async function takeScreenshotLocked(attempt: StoredAttempt, reason: QueuedShot['reason'], at: number, windowId?: number): Promise<string | undefined> {
  const shot = await shotFrom(attempt, crypto.randomUUID(), reason, at, windowId);
  if ('error' in shot) {
    if (!notYetLoaded(shot.error)) await enqueueEvent(attempt, 'screenshot_failed', { error: shot.error.slice(0, 200) }, at);
    return undefined;
  }
  await enqueueShot(shot);
  const site = shot.visible_host !== undefined ? `${shot.visible_host}${shot.visible_path ?? ''}` : undefined;
  await updateAttempt({ shot: { lastCaptureAt: at, lastShotId: shot.id, lastShotSite: site } });
  return shot.id;
}

/** host + path of the tab currently on screen in the last-focused browser window. */
async function visibleSite(): Promise<string | undefined> {
  try {
    const win = await browser.windows.getLastFocused({ windowTypes: ['normal'] });
    const [tab] = await browser.tabs.query({ active: true, windowId: win.id });
    if (!tab?.url) return undefined;
    const { host, path } = sanitizeUrl(tab.url);
    return `${host}${path}`;
  } catch {
    return undefined;
  }
}

async function recordEventLocked(type: EventType, details: Record<string, unknown> = {}): Promise<void> {
  const attempt = await activeAttempt();
  if (!attempt) return;
  const at = serverNow(attempt);

  // Warning-triggering events get a screenshot; events within 3 s share one (R16).
  let screenshotId: string | undefined;
  if (WARNING_TYPES.includes(type)) {
    const capture = decideCapture(attempt.shot ?? {}, at, await visibleSite());
    screenshotId = capture.kind === 'attach' ? capture.shotId : await takeScreenshotLocked(attempt, 'violation', at);
  }
  await enqueueEvent(attempt, type, details, at, screenshotId);

  const limit = attempt.session.warning_limit;
  const { decision, next } = decideWarning(attempt.warnings ?? initialWarningState(), type, at, limit);
  if (decision.kind !== 'none') {
    await updateAttempt({ warnings: next });
    await enqueueEvent(attempt, 'warning_shown', { n: decision.n, limit, reason_type: type }, at);
    if (decision.kind === 'warn_and_limit') await enqueueEvent(attempt, 'warning_limit_reached', { limit }, at);
    await showWarning(attempt, decision.n, type, decision.kind !== 'warn');
  }
  void flush();
}

/** Records an event from outside the lock (e.g. content-script clipboard events). */
export function recordEvent(type: EventType, details: Record<string, unknown> = {}): Promise<void> {
  return withLock(() => recordEventLocked(type, details));
}

// ---------------------------------------------------------------------------
// Exam tab binding (R9) and fullscreen (R13)
// ---------------------------------------------------------------------------

/**
 * Fullscreen uses the browser window (chrome.windows), not DOM fullscreen: it needs no click on the
 * page and survives page reloads between Google Forms sections (OQ1 choice, decision D6; verified in spike 6a).
 */
async function requestFullscreenLocked(attempt: StoredAttempt): Promise<void> {
  if (attempt.fullscreen_requested || attempt.exam_window_id === undefined) return;
  await updateAttempt({ fullscreen_requested: true });
  await browser.windows.update(attempt.exam_window_id, { state: 'fullscreen' }).catch((e) => console.warn('[icu] fullscreen failed', e));
}

async function bindExamTabLocked(): Promise<void> {
  const attempt = await activeAttempt();
  if (!attempt) return;
  if (attempt.exam_tab_id !== undefined) {
    const bound = await browser.tabs.get(attempt.exam_tab_id).catch(() => undefined);
    if (bound) {
      // Still bound, but after a worker restart or the extension being re-enabled the tab's content
      // script may be gone: activating re-injects it if needed (idempotent otherwise; SDD F5).
      await sendToTab(bound.id!, { type: 'sw.activate' });
      return;
    }
  }
  const [active] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  const tab = active && isExamUrl(attempt, active.url)
    ? active
    : (await browser.tabs.query({})).find((t) => isExamUrl(attempt, t.url));
  if (tab?.id === undefined) {
    await updateAttempt({ exam_tab_id: undefined, exam_window_id: undefined, hidden_at: undefined, off_exam: undefined });
    return;
  }
  const win = await browser.windows.get(tab.windowId).catch(() => undefined);
  const next = await updateAttempt({
    exam_tab_id: tab.id,
    exam_window_id: tab.windowId,
    hidden_at: undefined,
    off_exam: undefined,
    window_state: win?.state,
  });
  await browser.alarms.clear(ALARM_NOT_DETECTED);
  await sendToTab(tab.id, { type: 'sw.activate' });
  if (next) await requestFullscreenLocked(next);
}

export function bindExamTab(): Promise<void> {
  return withLock(bindExamTabLocked);
}

/** Called at Start: bind now, or arm the "exam page not detected" alarm (R9). */
export async function startMonitoring(): Promise<void> {
  await bindExamTab();
  if ((await loadAttempt())?.exam_tab_id === undefined) {
    await browser.alarms.create(ALARM_NOT_DETECTED, { when: Date.now() + NOT_DETECTED_DELAY_MS });
  }
}

/** R16: periodic screenshot, skipped right after another capture. */
export function onScreenshotAlarm(): Promise<void> {
  return withLock(async () => {
    const attempt = await activeAttempt();
    if (!attempt) return;
    const at = serverNow(attempt);
    if (!shouldCaptureInterval(attempt.shot ?? {}, at)) return;
    await takeScreenshotLocked(attempt, 'interval', at);
    void flush();
  });
}

export function onNotDetectedAlarm(): Promise<void> {
  return withLock(async () => {
    const attempt = await activeAttempt();
    if (!attempt || attempt.exam_tab_id !== undefined || attempt.not_detected_recorded) return;
    await updateAttempt({ not_detected_recorded: true });
    await recordEventLocked('exam_page_not_detected');
  });
}

/** R13: browser-window fullscreen changes of the exam window. */
export function onWindowStateMaybeChanged(windowId: number): Promise<void> {
  return withLock(async () => {
    const attempt = await activeAttempt();
    if (!attempt || windowId !== attempt.exam_window_id) return;
    const win = await browser.windows.get(windowId).catch(() => undefined);
    if (!win?.state || win.state === attempt.window_state) return;
    const was = attempt.window_state;
    await updateAttempt({ window_state: win.state });
    if (win.state === 'fullscreen') await recordEventLocked('fullscreen_enter');
    else if (was === 'fullscreen') await recordEventLocked('fullscreen_exit');
  });
}

// ---------------------------------------------------------------------------
// Tabs (R9, R10, R11)
// ---------------------------------------------------------------------------

const ignoredUrl = (url: string) => url.startsWith(browser.runtime.getURL('/')) || url === 'chrome://newtab/' || url === 'about:blank';

export function onTabCreated(): Promise<void> {
  return withLock(async () => {
    if (await activeAttempt()) await recordEventLocked('tab_opened');
  });
}

export function onTabUpdated(tabId: number, change: { status?: string; url?: string }, tabUrl: string | undefined): Promise<void> {
  return withLock(async () => {
    const attempt = await activeAttempt();
    if (!attempt) return;

    if (change.url && !ignoredUrl(change.url)) {
      const exam = isExamUrl(attempt, change.url);
      if (tabId === attempt.exam_tab_id) {
        if (!exam && !attempt.off_exam) {
          await updateAttempt({ off_exam: true });
          await recordEventLocked('navigated_off_exam', { ...sanitizeUrl(change.url) });
        } else if (exam && attempt.off_exam) {
          await updateAttempt({ off_exam: undefined });
        }
      }
    }

    // Bind the first matching tab that finishes loading if none is bound yet.
    if (attempt.exam_tab_id === undefined && change.status === 'complete' && isExamUrl(attempt, tabUrl)) {
      await bindExamTabLocked();
    }
  });
}

export function onTabRemoved(tabId: number): Promise<void> {
  return withLock(async () => {
    const attempt = await activeAttempt();
    if (attempt?.exam_tab_id !== tabId) return;
    await updateAttempt({ exam_tab_id: undefined, exam_window_id: undefined, hidden_at: undefined, off_exam: undefined });
    // Re-bind to another matching tab if one is open (SDD F3); otherwise heartbeats stop → gap.
    await bindExamTabLocked();
  });
}

/** R10: leaving and returning to the exam tab within its window. */
export function onTabActivated(tabId: number, windowId: number): Promise<void> {
  return withLock(async () => {
    const attempt = await activeAttempt();
    if (!attempt || attempt.exam_tab_id === undefined || windowId !== attempt.exam_window_id) return;
    if (tabId !== attempt.exam_tab_id && attempt.hidden_at === undefined) {
      await updateAttempt({ hidden_at: serverNow(attempt) });
      await recordEventLocked('exam_tab_hidden');
    } else if (tabId === attempt.exam_tab_id && attempt.hidden_at !== undefined) {
      const away_ms = serverNow(attempt) - attempt.hidden_at;
      await updateAttempt({ hidden_at: undefined });
      await recordEventLocked('exam_tab_visible', { away_ms });
    }
  });
}

// ---------------------------------------------------------------------------
// Site visits (R11, R16): every other website on screen gets a url_visited event with a screenshot
// ---------------------------------------------------------------------------

const SITE_REPEAT_MS = 10_000;
const MIN_CAPTURE_SPACING_MS = 600; // Chrome allows 2 captures per second (RESEARCH F6)
const siteSeen = new Map<string, number>();

/**
 * Called when a tab may have become visible with a loaded page (tab loaded, switched to, SPA navigation,
 * window focused). If it is the active tab of its window, shows a non-exam site, and that tab+site wasn't
 * recorded in the last 10 s, records url_visited with a screenshot of the page.
 */
export function onSiteMaybeVisible(tabId: number): Promise<void> {
  return withLock(async () => {
    const attempt = await activeAttempt();
    if (!attempt) return;
    const tab = await browser.tabs.get(tabId).catch(() => undefined);
    if (!tab?.active || tab.status !== 'complete' || !tab.url || ignoredUrl(tab.url) || isExamUrl(attempt, tab.url)) return;
    const { host, path } = sanitizeUrl(tab.url);
    const key = `${tabId}|${host}${path}`;
    const now = Date.now();
    if (now - (siteSeen.get(key) ?? 0) < SITE_REPEAT_MS) return;
    siteSeen.set(key, now);

    const last = attempt.shot?.lastCaptureAt;
    if (last !== undefined && serverNow(attempt) - last < MIN_CAPTURE_SPACING_MS) await new Promise((r) => setTimeout(r, MIN_CAPTURE_SPACING_MS));
    const at = serverNow(attempt);
    const http = /^https?:/.test(tab.url);
    // Reuse a warning screenshot taken moments ago of this same site (e.g. on leaving the exam tab).
    const recent = http ? decideCapture(attempt.shot ?? {}, at, `${host}${path}`) : undefined;
    const shotId = recent?.kind === 'attach' ? recent.shotId : http ? await takeScreenshotLocked(attempt, 'site_visit', at, tab.windowId) : undefined;
    await enqueueEvent(attempt, 'url_visited', { host, path }, at, shotId);
    void flush();
  });
}

// ---------------------------------------------------------------------------
// Window focus (R10)
// ---------------------------------------------------------------------------

let popupPorts = 0;

/** The extension's own popup takes focus; while it is open, focus changes aren't "leaving" (A5). */
export function onPopupConnected(port: Browser.runtime.Port): void {
  popupPorts++;
  port.onDisconnect.addListener(() => {
    popupPorts = Math.max(0, popupPorts - 1);
  });
}

export function onWindowFocusChanged(windowId: number): Promise<void> {
  return withLock(async () => {
    const attempt = await activeAttempt();
    if (!attempt || attempt.exam_window_id === undefined) return;
    if (windowId === attempt.exam_window_id) {
      if (attempt.blurred_at !== undefined) {
        const away_ms = serverNow(attempt) - attempt.blurred_at;
        await updateAttempt({ blurred_at: undefined });
        await recordEventLocked('window_focus', { away_ms });
      }
      return;
    }
    if (popupPorts > 0 || attempt.blurred_at !== undefined) return;
    await updateAttempt({ blurred_at: serverNow(attempt) });
    await recordEventLocked('window_blur');
  });
}

// ---------------------------------------------------------------------------
// Heartbeat (R14)
// ---------------------------------------------------------------------------

/**
 * Push heartbeat. 'content' comes every 15 s from the exam tab; 'alarm' is the 30 s backup for
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
    console.warn('[icu] heartbeat failed', error.message);
    return;
  }
  await updateAttempt({ last_heartbeat_at: new Date().toISOString() });
}

/** Content-script clipboard events count only on the exam page itself (R12). */
export async function onContentEvent(senderTabId: number | undefined, senderTabUrl: string | undefined, type: EventType, details: Record<string, unknown>): Promise<void> {
  const attempt = await activeAttempt();
  if (!attempt || senderTabId === undefined || senderTabId !== attempt.exam_tab_id || !isExamUrl(attempt, senderTabUrl)) return;
  if (!['copy', 'cut', 'paste', 'context_menu'].includes(type)) return;
  await recordEvent(type, details);
}
