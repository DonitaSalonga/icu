// Content script: dormant unless this tab is the bound exam tab (SDD.md § Components).
// All frames: copy / cut / paste / context-menu events, type only, never clipboard content (R12, R26).
// Top frame only: the 15 s heartbeat (R14) and the warning banner (R17).
import type { EventType, Message, Response, SwMessage } from '@ocm/core';
import { createBanner, type Banner } from '../lib/banner';

const HEARTBEAT_MS = 15_000;
const CLIPBOARD_EVENTS: [string, EventType][] = [
  ['copy', 'copy'],
  ['cut', 'cut'],
  ['paste', 'paste'],
  ['contextmenu', 'context_menu'],
];

function send(message: Message): Promise<Response | undefined> {
  // Rejects when the extension is disabled or reloaded; that silence is what creates a gap.
  return browser.runtime.sendMessage(message).catch(() => undefined);
}

export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  runAt: 'document_idle',
  main(ctx) {
    const top = window.top === window;
    const frame = top ? 'top' : 'sub';
    let active = false;
    let timer: number | undefined;
    let banner: Banner | undefined;

    const onClipboard = (type: EventType) => () =>
      void send({ type: 'cs.event', event_type: type, occurred_at: new Date().toISOString(), details: { frame } });
    const listeners = CLIPBOARD_EVENTS.map(([dom, type]) => [dom, onClipboard(type)] as const);

    const start = () => {
      if (active) return;
      active = true;
      // Passive and capture: observe only, never block or change the page.
      for (const [dom, fn] of listeners) document.addEventListener(dom, fn, { capture: true, passive: true });
      if (top) {
        void send({ type: 'cs.heartbeat' });
        timer = ctx.setInterval(() => void send({ type: 'cs.heartbeat' }), HEARTBEAT_MS);
      }
    };
    const stop = () => {
      active = false;
      for (const [dom, fn] of listeners) document.removeEventListener(dom, fn, { capture: true });
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
      banner?.destroy();
      banner = undefined;
    };

    browser.runtime.onMessage.addListener((message: SwMessage) => {
      if (message.type === 'sw.activate') start();
      if (message.type === 'sw.deactivate') stop();
      if (message.type === 'sw.showWarning' && top) {
        banner ??= createBanner();
        banner.show(message.n, message.limit, message.text, message.limitReached);
      }
    });
    ctx.onInvalidated(stop);

    void send({ type: 'cs.hello', top }).then((res) => {
      if (res?.ok && (res.data as { isExamTab: boolean }).isExamTab) start();
    });
  },
});
