// The demo video: seven scenes cut to the music's beat (beats.ts), clean and calm, with on-screen captions.
// It uses the app's own stylesheet, logo, icons and avatars so it looks like ICU.
import '@icu/ui-tokens/icu.css';
import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { AbsoluteFill, Audio, cancelRender, continueRender, delayRender, interpolate, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { beatFrame, SCENES, type SceneId } from './beats';
import { CreateSession, Intro, Outro, Review, StudentJoin, TabSwitch, Verdict, type Beat } from './scenes';
import { DURATION } from './timing';

const COMPONENTS: Record<SceneId, ComponentType<{ b: Beat }>> = {
  intro: Intro, create: CreateSession, join: StudentJoin, switch: TabSwitch, review: Review, verdict: Verdict, outro: Outro,
};
/** Frames two scenes overlap while one fades into the next. */
const FADE = 10;

/** Holds the render until Satoshi (loaded from Fontshare by icu.css) is ready, so no frame uses a fallback font. */
function useSatoshi() {
  const [handle] = useState(() => delayRender('Loading Satoshi'));
  useEffect(() => {
    Promise.all([document.fonts.load('700 48px Satoshi'), document.fonts.load('500 24px Satoshi'), document.fonts.load('400 16px Satoshi')])
      .then(() => continueRender(handle))
      .catch((e: unknown) => cancelRender(e));
  }, [handle]);
}

/** Cross-fades a scene in and out over FADE frames, with a slight settle in scale. */
function Fade({ length, first, last, children }: { length: number; first: boolean; last: boolean; children: ReactNode }) {
  const frame = useCurrentFrame();
  const fadeIn = first ? 1 : interpolate(frame, [0, FADE], [0, 1], { extrapolateRight: 'clamp' });
  const fadeOut = last ? 1 : interpolate(frame, [length - FADE, length], [1, 0], { extrapolateLeft: 'clamp' });
  const scale = first ? 1 : interpolate(frame, [0, FADE * 2], [0.985, 1], { extrapolateRight: 'clamp' });
  return <AbsoluteFill style={{ opacity: Math.min(fadeIn, fadeOut), transform: `scale(${scale})` }}>{children}</AbsoluteFill>;
}

export function Demo() {
  useSatoshi();
  return (
    <AbsoluteFill style={{ background: 'var(--bg)', fontFamily: 'Satoshi, system-ui, sans-serif', color: 'var(--ink)' }}>
      <Audio src={staticFile('music.mp3')} volume={(f) => interpolate(f, [0, 6, DURATION - 60, DURATION], [0, 0.9, 0.9, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} />
      {SCENES.map((scene, i) => {
        const start = i === 0 ? 0 : beatFrame(scene.beat);
        const next = SCENES[i + 1];
        const end = next ? beatFrame(next.beat) + FADE : DURATION;
        const Scene = COMPONENTS[scene.id];
        const b: Beat = (j) => beatFrame(scene.beat + j) - start;
        return (
          <Sequence key={scene.id} from={start} durationInFrames={end - start} name={scene.id}>
            <Fade length={end - start} first={i === 0} last={!next}>
              <Scene b={b} />
            </Fade>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}
