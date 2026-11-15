// The ICU demo video: 30 s at 30 fps, 16:9 (user, 2026-11-15).
import { Composition } from 'remotion';
import { Demo } from './Demo';

export const FPS = 30;
export const DURATION = 30 * FPS;

export function Root() {
  return <Composition id="ICUDemo" component={Demo} durationInFrames={DURATION} fps={FPS} width={1920} height={1080} />;
}
