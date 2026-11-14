// Admin wording for event types (DSD.md § Content and voice). Event identifiers never appear in the UI.
import { formatDuration } from '../ui';

type Details = Record<string, unknown>;
const urlOf = (d: Details) => `${String(d.host ?? '')}${String(d.path ?? '')}`;

const LABELS: Record<string, (d: Details) => string> = {
  exam_tab_hidden: () => 'Left exam tab',
  exam_tab_visible: (d) => `Returned to exam tab · away ${formatDuration(Number(d.away_ms ?? 0))}`,
  window_blur: () => 'Browser lost focus',
  window_focus: (d) => `Browser focused · away ${formatDuration(Number(d.away_ms ?? 0))}`,
  navigated_off_exam: (d) => `Navigated off exam: ${urlOf(d)}`,
  tab_opened: () => 'Opened a new tab',
  url_visited: (d) => `Visited ${urlOf(d)}`,
  copy: () => 'Copied on exam page',
  cut: () => 'Cut on exam page',
  paste: () => 'Pasted on exam page',
  context_menu: () => 'Right-clicked on exam page',
  fullscreen_enter: () => 'Entered fullscreen',
  fullscreen_exit: () => 'Left fullscreen',
  exam_page_not_detected: () => 'Exam page not detected within 2 min of start',
  warning_shown: (d) => `Warning ${String(d.n)} of ${String(d.limit)} shown`,
  warning_limit_reached: () => 'Warning limit reached (forces High)',
  screenshot_failed: (d) => `Screenshot failed: ${String(d.error ?? 'unknown')}`,
  extension_uninstalled: () => 'Extension uninstalled (best effort)',
  exam_page_changed: (d) => `Viewed another page on the exam platform: ${urlOf(d)}`,
  screen_share_started: () => 'Started sharing the whole screen',
  screen_share_stopped: () => 'Stopped sharing the whole screen',
  queue_overflow: (d) => `Upload queue overflowed · ${String(d.dropped_events ?? 0)} events, ${String(d.dropped_screenshots ?? 0)} screenshots dropped`,
};

/** Short names for filter chips and the risk breakdown. */
export const TYPE_NAMES: Record<string, string> = {
  exam_tab_hidden: 'Left exam tab',
  exam_tab_visible: 'Returned to exam tab',
  window_blur: 'Browser lost focus',
  window_focus: 'Browser focused',
  navigated_off_exam: 'Navigated off exam',
  tab_opened: 'New tab',
  url_visited: 'Visited site',
  copy: 'Copy',
  cut: 'Cut',
  paste: 'Paste',
  context_menu: 'Right-click',
  fullscreen_enter: 'Entered fullscreen',
  fullscreen_exit: 'Left fullscreen',
  exam_page_not_detected: 'Exam page not detected',
  warning_shown: 'Warning shown',
  warning_limit_reached: 'Warning limit reached',
  screenshot_failed: 'Screenshot failed',
  extension_uninstalled: 'Extension uninstalled',
  queue_overflow: 'Queue overflow',
  exam_page_changed: 'Other exam-platform page',
  screen_share_started: 'Screen sharing started',
  screen_share_stopped: 'Screen sharing stopped',
  monitoring_lost: 'Monitoring lost',
};

export const eventLabel = (type: string, details: Details) => LABELS[type]?.(details) ?? TYPE_NAMES[type] ?? 'Event';
