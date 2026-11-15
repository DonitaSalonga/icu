// The beat grid of the music ("Inspired" by Kevin MacLeod, public/music.mp3), measured with librosa on
// 2026-11-15: first beat at 0.07 s, then one beat every 0.4997 s (about 120 BPM). Every scene starts on a
// bar line (4 beats), and moves inside a scene land on beats or half-beats.
import { FPS } from './timing';

const FIRST_BEAT_S = 0.07;
const BEAT_S = 0.4997;

/** Frame of beat k of the song (k may be fractional for half-beats). */
export const beatFrame = (k: number) => Math.round((FIRST_BEAT_S + BEAT_S * k) * FPS);

/** Scenes in order, each starting on a beat. The last one runs to the end of the video. */
export const SCENES = [
  { id: 'intro', beat: 0 },
  { id: 'create', beat: 8 },
  { id: 'join', beat: 16 },
  { id: 'switch', beat: 24 },
  { id: 'review', beat: 36 },
  { id: 'verdict', beat: 48 },
  { id: 'outro', beat: 54 },
] as const;

export type SceneId = (typeof SCENES)[number]['id'];
