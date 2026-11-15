// Placeholder until the scenes are built: the intro card, to prove the pipeline (fonts, logo, render).
// It uses the app's own stylesheet and logo so the video looks like ICU.
import '@icu/ui-tokens/icu.css';
import { useEffect, useState } from 'react';
import { AbsoluteFill, cancelRender, continueRender, delayRender, interpolate, useCurrentFrame } from 'remotion';
import { Logo } from '@icu/ui-tokens/icons';

/** Holds the render until Satoshi (loaded from Fontshare by icu.css) is ready, so no frame uses a fallback font. */
function useSatoshi() {
  const [handle] = useState(() => delayRender('Loading Satoshi'));
  useEffect(() => {
    Promise.all([document.fonts.load('700 48px Satoshi'), document.fonts.load('400 24px Satoshi')])
      .then(() => continueRender(handle))
      .catch((e: unknown) => cancelRender(e));
  }, [handle]);
}

export function Demo() {
  useSatoshi();
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });
  const rise = interpolate(frame, [0, 20], [24, 0], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ background: 'var(--bg)', alignItems: 'center', justifyContent: 'center', fontFamily: 'Satoshi, system-ui, sans-serif' }}>
      <div style={{ opacity, transform: `translateY(${rise}px)`, display: 'grid', justifyItems: 'center', gap: 28 }}>
        <Logo height={150} />
        <p style={{ fontSize: 44, fontWeight: 500, color: 'var(--muted)', margin: 0 }}>It catches the tab switch. A person makes the call.</p>
      </div>
    </AbsoluteFill>
  );
}
