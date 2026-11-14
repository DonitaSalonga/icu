// Whole-screen capture (decision D9, 2026-11-15). Chrome only lets the page that asked for a desktop
// share use it (verified in a prototype), so the notice page asks at Start, keeps the stream, becomes a
// pinned "ICU monitoring" tab, and answers the service worker's frame requests.
import { blobToBase64 } from './capture';
import { IcuError } from './errors';

const MAX_SIDE = 1280;

/** Opens Chrome's picker limited to "Entire screen" and returns the live stream. Needs a user click. */
export function requestScreenShare(): Promise<MediaStream> {
  return new Promise((resolve, reject) => {
    browser.desktopCapture.chooseDesktopMedia(['screen'], async (streamId) => {
      if (!streamId) return reject(new IcuError('ICU_SCREEN_SHARE_REQUIRED'));
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          // Chrome's desktop-capture constraints (not in the standard MediaTrackConstraints type).
          video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: streamId, maxWidth: 1920, maxHeight: 1080 } } as MediaTrackConstraints,
        });
        resolve(stream);
      } catch (e) {
        // macOS: Chrome needs System Settings → Privacy & Security → Screen Recording.
        reject(new IcuError(e instanceof DOMException && e.name === 'NotAllowedError' ? 'ICU_SCREEN_PERMISSION' : 'ICU_SCREEN_SHARE_FAILED'));
      }
    });
  });
}

/** Serves `monitor.grab` requests with a downscaled JPEG of the current screen. Returns a stop function. */
export function serveFrames(stream: MediaStream, onEnded: () => void): () => void {
  const track = stream.getVideoTracks()[0]!;
  // grabFrame is Chrome's ImageCapture API; TypeScript's DOM types don't include it.
  const capture = new ImageCapture(track) as unknown as { grabFrame(): Promise<ImageBitmap> };
  const listener = (message: { type?: string }, _sender: unknown, reply: (r: unknown) => void) => {
    if (message?.type !== 'monitor.grab') return;
    (async () => {
      try {
        const bmp = await capture.grabFrame();
        const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
        const canvas = new OffscreenCanvas(Math.round(bmp.width * scale), Math.round(bmp.height * scale));
        canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
        bmp.close();
        const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.5 });
        reply({ ok: true, data: await blobToBase64(blob), bytes: blob.size });
      } catch (e) {
        reply({ ok: false, error: String(e) });
      }
    })();
    return true;
  };
  browser.runtime.onMessage.addListener(listener);
  // "Stop sharing" in Chrome's bar, or the screen source going away.
  track.addEventListener('ended', onEnded);
  return () => {
    browser.runtime.onMessage.removeListener(listener);
    track.removeEventListener('ended', onEnded);
    for (const t of stream.getTracks()) t.stop();
  };
}
