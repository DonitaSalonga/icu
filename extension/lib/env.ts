// Build-time configuration from the repository-root .env (see .env.example).
export const SUPABASE_URL: string = import.meta.env.WXT_SUPABASE_URL ?? '';
export const SUPABASE_PUBLISHABLE_KEY: string = import.meta.env.WXT_SUPABASE_PUBLISHABLE_KEY ?? '';
export const DASHBOARD_URL: string = import.meta.env.WXT_DASHBOARD_URL ?? 'http://localhost:5173';

export const isConfigured = (): boolean => SUPABASE_URL !== '' && SUPABASE_PUBLISHABLE_KEY !== '';

/** E2E builds shorten slow timers (QAD.md § Test strategy). Heartbeat and gap timings never change. */
export const TEST_TIMINGS = import.meta.env.WXT_OCM_TEST_TIMINGS === '1';

/** R9: exam_page_not_detected delay. Chrome alarms can't fire sooner than 30 s (RESEARCH F9). */
export const NOT_DETECTED_DELAY_MS = TEST_TIMINGS ? 30_000 : 120_000;

/** R16: interval screenshot period in minutes (alarms allow ≥ 0.5). */
export const SCREENSHOT_PERIOD_MIN = TEST_TIMINGS ? 0.5 : 1;
