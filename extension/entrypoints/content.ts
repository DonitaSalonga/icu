// Content script: dormant unless this tab is the bound exam tab (SDD.md § Components).
// M1: top-frame heartbeat every 15 s (R14). Clipboard listeners in all frames arrive in M2.
import type { Message, Response, SwMessage } from '@ocm/core';

const HEARTBEAT_MS = 15_000;

function send(message: Message): Promise<Response | undefined> {
  // Rejects when the extension is disabled or reloaded; that silence is what creates a gap.
  return browser.runtime.sendMessage(message).catch(() => undefined);
}

export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  runAt: 'document_idle',
  main(ctx) {
    if (window.top !== window) return;

    let timer: number | undefined;
    const start = () => {
      if (timer !== undefined) return;
      void send({ type: 'cs.heartbeat' });
      timer = ctx.setInterval(() => void send({ type: 'cs.heartbeat' }), HEARTBEAT_MS);
    };
    const stop = () => {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
    };

    browser.runtime.onMessage.addListener((message: SwMessage) => {
      if (message.type === 'sw.activate') start();
      if (message.type === 'sw.deactivate') stop();
    });

    void send({ type: 'cs.hello', top: true }).then((res) => {
      if (res?.ok && (res.data as { isExamTab: boolean }).isExamTab) start();
    });
  },
});
