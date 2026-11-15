# ICU (I Caught You): backend handoff for UI/UX work

For the agent redesigning the dashboard and the extension's screens. Use it to change how ICU looks without disconnecting it from the backend. The visual rules and test selectors are in [UI-HANDOFF.md](UI-HANDOFF.md); this file covers the connection.

**The one rule:** restyle and restructure as much as you like, but keep every call, field name, message type and error code listed here working the same. The backend lives in Supabase Cloud and is already deployed; nothing on the backend needs changing for a redesign.

## 1. How the pieces connect

```text
Dashboard (React, Vite)  ── supabase-js, publishable key ──▶  Supabase: Auth · Postgres (RLS) · Storage · Edge Functions
Extension popup / notice ── chrome.runtime messages ──▶ service worker ── supabase-js ──▶  (same Supabase project)
```

- **Dashboard:** it talks to Supabase directly with the **publishable** key. Row-level security (RLS) decides what each admin can see. An admin only ever sees the sessions they created.
- **Extension:**
  - **Only the service worker talks to Supabase** (`extension/entrypoints/background.ts` and `extension/lib/*`).
  - The popup and the notice/monitoring page are plain UI. They send typed messages to the service worker and render what comes back.
  - **Never** import `supabase` or `getSupabase` into `popup/` or `notice/` code; the extension design relies on this (it avoids two token refreshes competing).
- **Shared code:** types, labels and rules live in `packages/core` and are imported as `@icu/core`. Use them; don't copy them.

## 2. Configuration (already set up; don't change)

| File | Variables | Used by |
| --- | --- | --- |
| `.env` (gitignored; template `.env.example`) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | dashboard (`dashboard/src/supabase.ts`) |
| same `.env` | `WXT_SUPABASE_URL`, `WXT_SUPABASE_PUBLISHABLE_KEY`, `WXT_DASHBOARD_URL` | extension (`extension/lib/env.ts`) |
| `.env.test` (gitignored) | test project keys | automated tests only |

- **Projects:** `icu-main` is for development and the demo; `icu-test` is for automated tests.
- **Keys:** only publishable keys ever go into front-end code. Never add a secret or service-role key to a front-end file; `npm run check:secrets` fails the build if one appears.
- **Demo accounts:** they're in `.env.demo`. Ask the owner; don't paste the values into code or docs.

**Run locally:**
```sh
npm install
npm run dev:dashboard            # http://localhost:5173
npm run build -w extension       # then chrome://extensions → Load unpacked → extension/.output/chrome-mv3
```
After changing extension UI, rebuild and click reload on ICU at `chrome://extensions`.

## 3. Dashboard: every backend call

All of these exist today. Move them between components freely, but keep the table, column, RPC and parameter names exactly.

### Auth (`dashboard/src/auth.tsx`, `pages/Login.tsx`, `App.tsx`)
| Action | Call | Notes |
| --- | --- | --- |
| Sign in | `supabase.auth.signInWithPassword({ email, password })` | |
| Create admin account | `supabase.auth.signUp({ email, password, options: { data: { role: 'admin', full_name } } })` | `role` must be `'admin'`; a database trigger creates the profile. The role can't be changed later |
| Current user | `auth.getSession()` + `auth.onAuthStateChange`, then `from('profiles').select('id, role, full_name, email').eq('id', userId).single()` | |
| Sign out | `supabase.auth.signOut()` | |
| Guard | Routes under `/sessions` are wrapped in `AdminOnly`; a student account is turned away with "This is a student account. Use the Chrome extension." | Keep the guard |

### Routes (`dashboard/src/App.tsx`)
`/` role chooser · `/login` · `/sessions` · `/sessions/:id` · `/sessions/:id/attempts/:attemptId`

### Sessions list and create dialog (`pages/Sessions.tsx`)
| Action | Call |
| --- | --- |
| List | `from('exam_sessions').select(SESSION_COLUMNS).order('starts_at', { ascending: false })` |
| Per-session counts | `loadSummaries(session)` from `lib/data.ts`, which calls the RPC below |
| Create | `rpc('create_session', { p_name, p_url_patterns, p_starts_at, p_ends_at, p_warning_limit, p_description })` → `{ id, code }` |

`create_session` inputs:
- `p_name`: 1–120 characters.
- `p_url_patterns`: 1–10 entries. Each is a platform keyword (`netacad`), a domain (`skillsbuild.org`) or a domain plus path (`docs.google.com/forms`). Validate in the UI with `isValidExamSite` / `normalizeExamSite` and explain with `describeExamSite` (all from `@icu/core`).
- `p_starts_at` < `p_ends_at`: ISO timestamps.
- `p_warning_limit`: 1–10.
- `p_description`: optional, at most 500 characters. Shown as "Tell us about the exam".
- Risk thresholds are left at the server defaults (Medium from 10, High from 25); don't add inputs for them.

Invalid input raises `ICU_INVALID_INPUT`. Show it with `errorText(error)` from `dashboard/src/supabase.ts`.

`SESSION_COLUMNS` (in `lib/data.ts`) = `id, name, code, description, url_patterns, starts_at, ends_at, warning_limit, threshold_medium, threshold_high`, typed as `SessionRow`.

### Session detail (`pages/SessionDetail.tsx`)
| Data | Call |
| --- | --- |
| Session | `from('exam_sessions').select(SESSION_COLUMNS).eq('id', id).single()` |
| Candidates | `loadSummaries(session)` → `rpc('session_attempt_summaries', { p_session_id })`, then risk is computed in the browser with `scoreFromCounts` (`@icu/core`) |
| AI column | `loadAnalyses(attemptIds)` → `from('ai_analyses').select(AI_COLUMNS).in('attempt_id', ids)` |

Each candidate row is a `ScoredAttempt`:
- `attempt_id`, `student_id`, `full_name`, `email`;
- `status`: `joined`, `active` or `ended`;
- `started_at`, `ended_at`, `verdict`, `verdict_at`, `data_deleted_at`;
- `event_counts`: `{ [eventType]: n }`;
- `gap_count`;
- `risk`: `{ level: 'low' | 'medium' | 'high', score, breakdown, forcedHigh }`;
- `warnings`.

Show status with `attemptStatus(a, session)`, which turns an active attempt past the end time into "Ended". Sort with `RISK_ORDER`.

### Candidate review (`pages/AttemptReview.tsx`, `components/AiSuggestion.tsx`)
| Data or action | Call |
| --- | --- |
| Session | `from('exam_sessions').select(SESSION_COLUMNS)` |
| Attempt + student | `from('attempts').select('id, status, started_at, ended_at, verdict, verdict_note, verdict_at, data_deleted_at, student:profiles!attempts_student_id_fkey(full_name, email)')` |
| Timeline | `from('events').select('id, type, occurred_at, details, screenshot_id').eq('attempt_id', id).order('occurred_at')` |
| Monitoring gaps | `from('heartbeats').select('received_at')…order('received_at')`, then `findGaps` (`@icu/core`) gives the red "Monitoring lost" bars |
| Screenshots | `from('screenshots').select('id, storage_path, captured_at, reason')`, then `storage.from('screenshots').createSignedUrls(paths, 3600)` (private bucket; URLs expire after 1 hour, so re-request them) |
| Verdict | `rpc('set_verdict', { p_attempt_id, p_verdict, p_note })`. `p_verdict` is one of `cleared`, `suspicious`, `cheating_confirmed`; the note is at most 1,000 characters |
| Delete candidate data | `deleteAttemptData(supabase, sessionId, attemptId)` in `lib/deleteAttempt.ts`. It removes Storage files first, then `rpc('delete_attempt_rows')`. Keep using this helper; it's safe to retry |
| AI suggestion | `loadAnalysis(attemptId)`. While `status` is `pending`, poll every 3 s. The Re-analyze button calls `rpc('request_ai_analysis', { p_attempt_id })` (at most once per 30 s) |

Screenshot `reason` values and their labels:
- `interval`: every 60 s;
- `violation`: on a warning;
- `site_visit`: another website on screen;
- `tab_switch`: the student switched tabs.

`AiAnalysis`:
- `status`: `pending`, `done` or `failed`;
- `suggestion`: an `AI_SUGGESTION_LABELS` key;
- `probabilities`: `{ option: 0–1 }`;
- `confidence`: 0–1, shown via `confidenceLevel()`;
- `error`, `analyzed_at`.

Keep the line "A suggestion only. It can be wrong; your verdict is the decision."

## 4. Extension: messages between the UI and the service worker

The UI calls `send<T>(message)` from `extension/lib/send.ts`. It always resolves to `{ ok: true, data }` or `{ ok: false, code, message }`; show errors with `errorText(code, message)`. The message types are defined in `packages/core/src/messages.ts`.

| Message | Sent from | Returns / effect |
| --- | --- | --- |
| `{ type: 'auth.state' }` | popup | `AuthState { configured, signedIn, role?, full_name?, email? }` |
| `{ type: 'auth.signUp', email, password, full_name, role: 'student' }` | popup | `AuthState & { needsConfirmation? }` |
| `{ type: 'auth.signIn', email, password }` | popup | `AuthState`. If `role === 'admin'` the popup shows "This is an admin account. Use the dashboard." (keep that branch); the join RPC also refuses admins with `ICU_NOT_STUDENT` |
| `{ type: 'auth.signOut' }` | popup | — |
| `{ type: 'attempt.status' }` | popup, notice | `AttemptStatus` (below) |
| `{ type: 'attempt.join', code }` | popup | `JoinResult { attempt_id, status, session }` |
| `{ type: 'attempt.openNotice' }` | popup ("Continue") | Opens `notice.html`. **Send it from the exam tab**: the tab the student is on becomes the preferred exam tab |
| `{ type: 'attempt.start', age_confirmed, consent_version }` | notice | Refused with `ICU_SCREEN_SHARE_REQUIRED` unless the screen is shared first. `consent_version` must be `NOTICE_VERSION` |
| `{ type: 'screen.started' }` / `{ type: 'screen.stopped' }` | notice | Report the whole-screen share; the notice page (a small popup window, DSD v2) becomes the "ICU monitoring" window. Focusing that window isn't leaving the exam |
| `{ type: 'attempt.reshare' }` | popup ("Share screen again") | Opens `notice.html?reshare=1` |
| `{ type: 'attempt.focusExam' }` | monitoring tab ("Go to my exam") | Brings the exam tab to the front; `ICU_EXAM_NOT_OPEN` if there isn't one |
| `{ type: 'attempt.end' }` | popup ("End exam") | `{ ended_at }`; sends `monitor.stop` to the monitoring tab |
| `{ type: 'attempt.reset' }` | popup | Clears a joined or ended attempt so the student can use another code |

`AttemptStatus`:
- `state`: `idle`, `joined`, `active` or `ended`;
- `session`: `SessionSummary` with `name`, `description`, `admin_name`, `admin_email`, `starts_at`, `ends_at`, `url_patterns`, `warning_limit`;
- `attempt_id`, `started_at`, `ended_at`;
- `exam_tab_bound`: whether the exam page is open and monitored;
- `queue_size`, `last_heartbeat_at`;
- `warnings`: `{ n, limit }`;
- `upload_failing`;
- `screen_sharing`.

Show "Share screen again" when `state === 'active' && !screen_sharing`.

**Behaviour the UI must keep:**
- **Popup port:** the popup opens a runtime port named `popup` while it's open. That's what stops the popup itself from counting as "leaving the exam", so keep that code.
- **Notice page and screen share:** the notice page **holds the screen-share stream** (`lib/screen.ts`: `requestScreenShare()`, `serveFrames()`).
  - The share request must run from a user click.
  - After Start, the page must stay open: no navigating away and no full reloads. Closing it is recorded as a warning.
  - Its order is: share → `screen.started` → `attempt.start` → monitoring view.
- **Notice wording:** the privacy wording is legal content under RA 10173. If you change it, bump `NOTICE_VERSION` in `packages/core/src/notice.ts`, and keep every listed item true.
- **Warning banner:** `extension/lib/banner.ts` is plain DOM in a closed shadow root on the exam page. It's not React and must not take focus.

**Error codes the UI shows** (texts in `extension/lib/send.ts` and `dashboard/src/supabase.ts`; reword freely, but keep the codes):
- `ICU_CODE_NOT_FOUND`, `ICU_SESSION_ENDED`, `ICU_NOT_OPEN_YET`, `ICU_ALREADY_ACTIVE`, `ICU_ATTEMPT_ACTIVE`, `ICU_ATTEMPT_ENDED`;
- `ICU_CONSENT_REQUIRED`, `ICU_NOT_STUDENT`, `ICU_NOT_ADMIN`, `ICU_RATE_LIMITED`, `ICU_INVALID_INPUT`;
- `ICU_SCREEN_SHARE_REQUIRED`, `ICU_SCREEN_PERMISSION`, `ICU_SCREEN_SHARE_FAILED`, `ICU_EXAM_NOT_OPEN`;
- `ICU_NO_RESPONSE`, `ICU_NOT_CONFIGURED`.

## 5. Shared labels and rules (`@icu/core`)

| Need | Import |
| --- | --- |
| Event types, risk points, which events warn | `EVENT_TYPES`, `WEIGHTS`, `WARNING_TYPES` (`events.ts`) |
| Event wording in the timeline | `dashboard/src/lib/labels.ts` |
| Warning banner text | `WARNING_TEXT`, `LIMIT_REACHED_TEXT` (`warnings.ts`) |
| Risk level and breakdown | `scoreFromCounts` (`scoring.ts`) |
| Monitoring gaps | `findGaps` (`gaps.ts`) |
| Exam platform validation and explanation | `normalizeExamSite`, `isValidExamSite`, `describeExamSite` (`url.ts`) |
| AI labels and confidence | `AI_SUGGESTION_LABELS`, `confidenceLevel` (`ai.ts`) |
| Session code format | `normalizeSessionCode` (`code.ts`) |
| Message and data types | `messages.ts` |

If you need a new event type, screenshot reason or database column, that's a backend change (a migration, an update to the matching SQL check, and the parity test). Ask the owner instead of working around it in the UI.

## 6. Things not to break

1. **The exam platform is typed, not a URL list.** Keep the chip input, and keep the plain-words explanation from `describeExamSite`.
2. **No risk-threshold inputs.** The server defaults apply.
3. **Students never see their risk, verdicts or AI suggestions.** These exist only in the dashboard.
4. **Nothing in the UI decides guilt.** The admin's verdict is the decision.
5. **Accessibility:**
   - 0 axe violations;
   - keyboard-only flow;
   - colour always paired with text;
   - control borders use `border-border-strong`.
6. **E2E selectors:** the tests find elements by role and visible text (list in [UI-HANDOFF.md](UI-HANDOFF.md#rules-to-keep)). If you rename a button, heading, label or region, update `e2e/*.spec.ts` in the same change.

## 7. Checking that it's still connected

```sh
npm run typecheck                                   # catches renamed fields and message types
npm test                                            # shared rules
npx playwright test e2e/m4-dashboard.spec.ts        # dashboard against the real test backend (needs .env.test)
npx playwright test e2e/m5-roles-lifecycle.spec.ts  # popup + notice student flow
npx playwright test e2e/m6-accessibility.spec.ts    # axe + keyboard on every screen
npm run test:e2e                                    # everything (~14 min)
npm run build && npm run check:secrets
```

- **Real screen:** the browser tests share the **real screen** of the machine running them. They clear the test screenshots afterwards (`npm run reset:test`).
- **Manual check:**
  1. Sign in to the dashboard and create a session.
  2. Join it from the extension and start.
  3. Switch tabs once.
  4. Confirm the candidate appears with a warning, a timeline entry and a screenshot.

**Where to read more:**
- [SDD.md](SDD.md): flows F1–F10, database RPCs, event catalogue.
- [PRD.md](PRD.md): requirements R1–R35.
- [DSD.md](DSD.md): components and states.
- [QAD.md](QAD.md): tests T1–T65.
