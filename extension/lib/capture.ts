// Screenshot capture in the service worker (R16, SDD.md § Key flows F3 "Screenshots").
// Captures the visible tab of the last-focused browser window, downscales to ≤ 1280 px on the
// longest side and re-encodes as JPEG quality 0.5 to stay within the storage budget (R29).

import { sanitizeUrl, type SanitizedUrl } from '@icu/core';

const MAX_SIDE = 1280;

/** `visible`: the site the screenshot shows, sanitized like visited URLs (host + path only; D8). */
export type CaptureResult = { ok: true; blob: Blob; visible?: SanitizedUrl } | { ok: false; error: string };

export async function captureVisible(windowId?: number): Promise<CaptureResult> {
  try {
    const win = windowId !== undefined ? await browser.windows.get(windowId) : await browser.windows.getLastFocused({ windowTypes: ['normal'] });
    if (win.id === undefined) return { ok: false, error: 'no browser window' };
    const [tab] = await browser.tabs.query({ active: true, windowId: win.id });
    const dataUrl = await browser.tabs.captureVisibleTab(win.id, { format: 'jpeg', quality: 50 });
    const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return { ok: true, blob: await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.5 }), visible: tab?.url ? sanitizeUrl(tab.url) : undefined };
  } catch (error) {
    // e.g. restricted pages such as chrome:// or the Chrome Web Store (RESEARCH F6)
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function base64ToBlob(data: string, type = 'image/jpeg'): Blob {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}
