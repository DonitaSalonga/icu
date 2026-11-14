// Event catalogue: the single home for event types, weights and warning types.
// SDD.md § Event catalogue. The SQL check constraint in supabase/migrations must list the
// same types; test/sql-parity.test.ts enforces this.

export const EVENT_TYPES = [
  'exam_tab_hidden',
  'exam_tab_visible',
  'window_blur',
  'window_focus',
  'navigated_off_exam',
  'tab_opened',
  'url_visited',
  'copy',
  'cut',
  'paste',
  'context_menu',
  'fullscreen_enter',
  'fullscreen_exit',
  'exam_page_not_detected',
  'warning_shown',
  'warning_limit_reached',
  'screenshot_failed',
  'extension_uninstalled',
  'queue_overflow',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

/** Risk points per event (R18). Monitoring gaps add GAP_WEIGHT each. */
export const WEIGHTS: Record<EventType, number> = {
  exam_tab_hidden: 2,
  exam_tab_visible: 0,
  window_blur: 2,
  window_focus: 0,
  navigated_off_exam: 3,
  tab_opened: 1,
  url_visited: 0,
  copy: 1,
  cut: 1,
  paste: 3,
  context_menu: 1,
  fullscreen_enter: 0,
  fullscreen_exit: 2,
  exam_page_not_detected: 8,
  warning_shown: 0,
  warning_limit_reached: 0,
  screenshot_failed: 0,
  extension_uninstalled: 8,
  queue_overflow: 0,
};

export const GAP_WEIGHT = 8;

/** Events that show a live warning to the student (R17). */
export const WARNING_TYPES: readonly EventType[] = [
  'exam_tab_hidden',
  'window_blur',
  'navigated_off_exam',
  'paste',
  'fullscreen_exit',
];

export function isEventType(value: string): value is EventType {
  return (EVENT_TYPES as readonly string[]).includes(value);
}
