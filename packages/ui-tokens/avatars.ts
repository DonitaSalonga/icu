// Six student avatars (user-supplied illustrations, 2026-11-15). Each student always gets the same one:
// the attempt or student id picks one of the six, so the faces "circulate" across a list.
import a1 from './avatars/student-1.png';
import a2 from './avatars/student-2.png';
import a3 from './avatars/student-3.png';
import a4 from './avatars/student-4.png';
import a5 from './avatars/student-5.png';
import a6 from './avatars/student-6.png';

const AVATARS = [a1, a2, a3, a4, a5, a6];

function hash(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

export function avatarFor(id: string): string {
  return AVATARS[hash(id) % AVATARS.length]!;
}

/** The Overview pastel (icu.css class) for a session, the same one on every page. */
export function pastelFor(id: string): 'yellow' | 'pink' | 'sage' | 'blue' {
  return (['yellow', 'pink', 'sage', 'blue'] as const)[hash(id) % 4]!;
}
