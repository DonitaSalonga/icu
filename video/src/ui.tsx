// Shared pieces for the scenes: calm entrances, the step caption, a browser window and a pointer.
// Everything reuses the app's own classes from icu.css so the video matches ICU.
import type { CSSProperties, ReactNode } from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** 0 → 1 with a soft, well-damped spring starting at `at` (clean and calm: no bounce). */
export function useEnter(at: number, durationInFrames = 18) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - at, fps, durationInFrames, config: { damping: 200 } });
}

/** Linear progress between two frames, clamped. */
export function useProgress(from: number, to: number) {
  return interpolate(useCurrentFrame(), [from, to], [0, 1], clamp);
}

/** Fades and lifts its children in at `at`. */
export function Rise({ at, children, distance = 16, style }: { at: number; children: ReactNode; distance?: number; style?: CSSProperties }) {
  const p = useEnter(at);
  return <div style={{ opacity: p, transform: `translateY(${(1 - p) * distance}px)`, ...style }}>{children}</div>;
}

/** Text typed out between two frames. */
export function Typed({ text, from, to }: { text: string; from: number; to: number }) {
  const n = Math.round(useProgress(from, to) * text.length);
  return <>{text.slice(0, n)}</>;
}

/** A quick press: the element dips to 96 % on the beat and settles back. */
export function usePress(at: number) {
  const frame = useCurrentFrame();
  return interpolate(frame, [at - 2, at, at + 6], [1, 0.96, 1], clamp);
}

/** The step caption at the top of each scene: a numbered pill and one short line. */
export function Caption({ step, text, at = 4 }: { step?: number; text: string; at?: number }) {
  const p = useEnter(at, 22);
  return (
    <div style={{ position: 'absolute', top: 70, left: 0, right: 0, display: 'flex', justifyContent: 'center', opacity: p, transform: `translateY(${(1 - p) * 12}px)` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '14px 28px 14px 14px', borderRadius: 99, background: 'var(--surface)', boxShadow: '0 1px 2px rgba(60,40,20,.06), 0 12px 32px rgba(60,40,20,.08)' }}>
        {step !== undefined && (
          <span style={{ width: 48, height: 48, borderRadius: 99, background: 'var(--accent)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 24, fontWeight: 700 }}>{step}</span>
        )}
        <span style={{ fontSize: 34, fontWeight: 600, letterSpacing: '-.01em', color: 'var(--ink)' }}>{text}</span>
      </div>
    </div>
  );
}

/** A soft pastel disc behind the scene, in the Overview colours (decorative). */
export function Glow({ color, x, y, size = 900 }: { color: 'yellow' | 'pink' | 'sage' | 'blue'; x: number; y: number; size?: number }) {
  const p = useEnter(0, 30);
  return <div style={{ position: 'absolute', left: x - size / 2, top: y - size / 2, width: size, height: size, borderRadius: '50%', background: `var(--p-${color})`, opacity: 0.4 * p, filter: 'blur(100px)' }} />;
}

/** A plain browser window with optional tabs; content is laid out at 1× and the whole window is scaled. */
export function Window({ width, height, scale = 1, tabs, active = 0, url, children, style }: { width: number; height: number; scale?: number; tabs?: string[]; active?: number; url?: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ width: width * scale, height: height * scale, ...style }}>
      <div style={{ width, height, transform: `scale(${scale})`, transformOrigin: 'top left', borderRadius: 18, overflow: 'hidden', background: 'var(--surface)', boxShadow: '0 2px 4px rgba(60,40,20,.05), 0 30px 80px rgba(60,40,20,.14)', border: '1px solid var(--line)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 'none', display: 'flex', alignItems: 'flex-end', gap: 6, height: 46, padding: '0 14px', background: 'var(--sunken)' }}>
          <div style={{ display: 'flex', gap: 7, alignSelf: 'center', marginRight: 12 }}>
            {['#e9776d', '#e9be5b', '#7fbd6a'].map((c) => <span key={c} style={{ width: 12, height: 12, borderRadius: 99, background: c }} />)}
          </div>
          {tabs?.map((t, i) => (
            <div key={t} style={{ height: 36, padding: '0 18px', display: 'flex', alignItems: 'center', gap: 8, borderRadius: '10px 10px 0 0', background: i === active ? 'var(--surface)' : 'transparent', color: i === active ? 'var(--ink)' : 'var(--muted)', fontSize: 14, fontWeight: 600, maxWidth: 260, whiteSpace: 'nowrap' }}>{t}</div>
          ))}
        </div>
        {url && (
          <div style={{ flex: 'none', padding: '8px 14px', borderBottom: '1px solid var(--line)' }}>
            <div style={{ height: 30, borderRadius: 99, background: 'var(--bg)', display: 'flex', alignItems: 'center', padding: '0 14px', fontSize: 14, color: 'var(--muted)' }}>{url}</div>
          </div>
        )}
        <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>{children}</div>
      </div>
    </div>
  );
}

/** A mouse pointer (decorative). */
export function Pointer({ x, y, down = false }: { x: number; y: number; down?: boolean }) {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" style={{ position: 'absolute', left: x, top: y, transform: `scale(${down ? 0.88 : 1})`, filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.25))' }}>
      <path d="M4 2l15 10-7 1.5L8.5 21z" fill="#1d1a17" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}
