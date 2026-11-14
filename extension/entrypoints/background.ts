// Service worker: the only part of the extension that talks to Supabase (SDD.md § Components).
// Listeners are registered synchronously so Chrome can wake the worker for them (RESEARCH F9).
import type { Message, Response } from '@ocm/core';
import { ALARM_END, ALARM_HEARTBEAT, attemptStatus, endAttempt, joinSession, openNotice, recover, resetAttempt, startAttempt } from '../lib/attempt';
import { authState, signIn, signOut, signUp } from '../lib/auth';
import { isConfigured } from '../lib/env';
import { toErrorResponse } from '../lib/errors';
import { flush } from '../lib/queue';
import {
  ALARM_NOT_DETECTED,
  heartbeat,
  onContentEvent,
  onNotDetectedAlarm,
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
  void restrictStorageToTrustedContexts().catch((e) => console.warn('[ocm] setAccessLevel failed', e));

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

  browser.tabs.onActivated.addListener(({ tabId, windowId }) => void onTabActivated(tabId, windowId));
  browser.tabs.onCreated.addListener(() => void onTabCreated());
  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => void onTabUpdated(tabId, changeInfo, tab.url));
  browser.tabs.onRemoved.addListener((tabId) => void onTabRemoved(tabId));
  browser.windows.onFocusChanged.addListener((windowId) => {
    void onWindowFocusChanged(windowId);
    if (windowId !== browser.windows.WINDOW_ID_NONE) void onWindowStateMaybeChanged(windowId);
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
    if (alarm.name === ALARM_END) void endAttempt('time_window').catch((e) => console.warn('[ocm] auto-end failed', e));
  });

  browser.runtime.onStartup.addListener(() => void recover());
  if (isConfigured()) void recover().catch((e) => console.warn('[ocm] recover failed', e));
});
