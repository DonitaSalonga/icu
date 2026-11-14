// Service worker: the only part of the extension that talks to Supabase (SDD.md § Components).
// Listeners are registered synchronously so Chrome can wake the worker for them (RESEARCH F9).
import type { Message, Response } from '@icu/core';
import { ALARM_END, ALARM_HEARTBEAT, ALARM_SCREENSHOT, attemptStatus, endAttempt, joinSession, openNotice, openReshare, recover, resetAttempt, startAttempt } from '../lib/attempt';
import { authState, signIn, signOut, signUp } from '../lib/auth';
import { isConfigured } from '../lib/env';
import { toErrorResponse } from '../lib/errors';
import { flush } from '../lib/queue';
import {
  ALARM_NOT_DETECTED,
  heartbeat,
  onContentEvent,
  onNotDetectedAlarm,
  onScreenshotAlarm,
  onScreenStarted,
  onScreenStopped,
  onSiteMaybeVisible,
  onPopupConnected,
  onTabActivated,
  onTabCreated,
  onTabRemoved,
  onTabUpdated,
  onWindowFocusChanged,
  onWindowStateMaybeChanged,
} from '../lib/monitor';
import { loadAttempt } from '../lib/state';
import { restrictStorageToTrustedContexts } from '../lib/supabase';

async function handle(message: Message, sender: Browser.runtime.MessageSender): Promise<unknown> {
  switch (message.type) {
    case 'auth.state':
      return authState();
    case 'auth.signUp':
      return signUp(message.email, message.password, message.full_name, message.role);
    case 'auth.signIn':
      return signIn(message.email, message.password);
    case 'auth.signOut':
      return signOut();
    case 'attempt.join':
      return joinSession(message.code);
    case 'attempt.openNotice':
      return openNotice();
    case 'attempt.start':
      return startAttempt(message.age_confirmed, message.consent_version);
    case 'attempt.end':
      return endAttempt('student');
    case 'attempt.status':
      return attemptStatus();
    case 'attempt.reset':
      return resetAttempt();
    case 'attempt.reshare':
      return openReshare();
    case 'screen.started':
      return onScreenStarted(sender.tab?.id);
    case 'screen.stopped':
      return onScreenStopped();
    case 'cs.hello': {
      const attempt = await loadAttempt();
      return { isExamTab: attempt?.state === 'active' && sender.tab?.id !== undefined && sender.tab.id === attempt.exam_tab_id };
    }
    case 'cs.heartbeat':
      return heartbeat('content', sender.tab?.id);
    case 'cs.event':
      return onContentEvent(sender.tab?.id, sender.tab?.url, message.event_type, message.details);
  }
}

export default defineBackground(() => {
  void restrictStorageToTrustedContexts().catch((e) => console.warn('[icu] setAccessLevel failed', e));

  browser.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
    handle(message, sender)
      .then((data): Response => ({ ok: true, data }))
      .catch(toErrorResponse)
      .then(sendResponse);
    return true; // keep the channel open for the async response
  });

  browser.runtime.onConnect.addListener((port) => {
    if (port.name === 'popup') onPopupConnected(port);
  });

  // Site visits: give the page a moment to render before capturing it.
  const siteSoon = (tabId: number, ms: number) => setTimeout(() => void onSiteMaybeVisible(tabId), ms);

  browser.tabs.onActivated.addListener(({ tabId, windowId }) => {
    void onTabActivated(tabId, windowId);
    siteSoon(tabId, 400);
  });
  browser.tabs.onCreated.addListener(() => void onTabCreated());
  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    void onTabUpdated(tabId, changeInfo, tab.url);
    if (changeInfo.status === 'complete') siteSoon(tabId, 400);
    // In-app navigation (single-page sites like claude.ai change the URL without reloading).
    else if (changeInfo.url && tab.status === 'complete') siteSoon(tabId, 1200);
  });
  browser.tabs.onRemoved.addListener((tabId) => void onTabRemoved(tabId));
  browser.windows.onFocusChanged.addListener((windowId) => {
    void onWindowFocusChanged(windowId);
    if (windowId === browser.windows.WINDOW_ID_NONE) return;
    void onWindowStateMaybeChanged(windowId);
    void browser.tabs.query({ active: true, windowId }).then(([tab]) => tab?.id !== undefined && siteSoon(tab.id, 400));
  });
  browser.windows.onBoundsChanged.addListener((win) => {
    if (win.id !== undefined) void onWindowStateMaybeChanged(win.id);
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_HEARTBEAT) {
      void heartbeat('alarm');
      void flush(); // safety net for the offline queue (R30)
    }
    if (alarm.name === ALARM_NOT_DETECTED) void onNotDetectedAlarm();
    if (alarm.name === ALARM_SCREENSHOT) void onScreenshotAlarm();
    if (alarm.name === ALARM_END) void endAttempt('time_window').catch((e) => console.warn('[icu] auto-end failed', e));
  });

  browser.runtime.onStartup.addListener(() => void recover());
  if (isConfigured()) void recover().catch((e) => console.warn('[icu] recover failed', e));
});
