// Icons from the ICU redesign (DSD v2) file, shared by the dashboard and the extension. Exact paths, 1.8 px
// stroke. Always decorative: the icon sits next to a text label, so it is aria-hidden.
import type { CSSProperties, ReactNode } from 'react';
import logoUrl from './logo.png';

const SHAPES = {
  overview: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ),
  sessions: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  review: <path d="M5 21V4M5 4h11l-2 4 2 4H5" />,
  account: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
    </>
  ),
  logout: <path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M16 8l4 4-4 4M20 12H9" />,
  monitor: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
  camera: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <circle cx="12" cy="12.5" r="3.5" />
    </>
  ),
  external: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
  copy: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </>
  ),
  alert: <path d="M12 3l10 18H2L12 3zM12 10v5M12 18h.01" />,
  check: <path d="M5 12l5 5 9-10" />,
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4-4" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  student: <path d="M2 9l10-5 10 5-10 5L2 9zM6 11.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-4.5" />,
  shield: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3zM8.5 12l2.5 2.5L16 9.5" />,
  pin: <path d="M9 3h6l-1 6 3 3H7l3-3-1-6zM12 12v9" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.8c2.2.7 3.5 2.4 3.5 5.2" />
    </>
  ),
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof SHAPES;

export function Icon({ name, size = 20, style }: { name: IconName; size?: number; style?: CSSProperties }) {
  return (
    <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none', ...style }}>
      {SHAPES[name]}
    </svg>
  );
}

/** The ICU logo (user-supplied artwork, 2026-11-15): "ICU" with the C drawn as an eye. Height sets the size. */
export function Logo({ height, alt = 'ICU' }: { height: number; alt?: string }) {
  return <img className="logo" src={logoUrl} alt={alt} height={height} style={{ height, width: 'auto', display: 'block', flex: 'none' }} />;
}
