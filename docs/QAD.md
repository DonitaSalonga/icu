# online-certification-monitoring — QA and test plan

How the requirements in [PRD.md](PRD.md) and the design in [SDD.md](SDD.md) are verified.
Updated: 2026-11-14
Status: draft for user review. None of these tests exist yet; they are written during the milestones in [BUILD.md](BUILD.md).

## Test strategy

| Level | Tool | What | Where it runs | Why |
| --- | --- | --- | --- | --- |
| **Unit** | Vitest | `packages/core`: URL matching, URL sanitising, gap detection, risk scoring, warning policy, coalescer, code generation | Local, `npm test -w packages/core`; no network | These pure rules decide what the admin sees ([SDD § packages/core](SDD.md#packagescore-functions)). They are fast, so they run on every change |
| **Integration** | Vitest + supabase-js | RLS policies, RPCs, triggers, Storage policies, Edge Functions, against the real **test** Supabase project with seeded users | Local, `npm run test:integration` | Access control is enforced only in Postgres (R25) and can't be mocked meaningfully |
| **E2E** | Playwright (persistent Chromium context loading `extension/.output/chrome-mv3`) + `@axe-core/playwright` | Real extension and dashboard flows against a local fixture exam page and the test project | Local, headed Chromium, `npm run test:e2e` | Proves the Chrome API behaviour that RESEARCH couldn't confirm ([RESEARCH § Answers](RESEARCH.md#answers-to-the-open-questions)) |
| **Manual** | Checklists in this file | The demo on Google Forms with two laptops, the browser-restart edge cases, keyboard and screen-reader passes, the privacy review | Demo laptops, Chrome stable | Third-party sites and assistive technology can't be automated reliably (A2, [F22](RESEARCH.md#findings)) |
| **Non-functional** | DevTools Performance, build-size output, SQL storage queries, a grep script | Performance budgets, storage budget, secret leakage | Local | R25, R29 |

**Test-only timing:** E2E builds set `VITE_OCM_TEST_TIMINGS=1`, which shortens the `exam_page_not_detected` delay from 120 s to 5 s and the screenshot interval from 60 s to 10 s. The heartbeat (15 s) and the gap threshold (60 s) are **never** shortened, so T33 tests the real values. Each test using shortened timings says so.

## Environments and test data

| Environment | Supabase project | Used for | Notes |
| --- | --- | --- | --- |
| **Dev/demo** | `ocm-main` (free tier) | Development and the final demo | Resume it the day before the demo if it's paused ([F7](RESEARCH.md#findings)) |
| **Test** | `ocm-test` (free tier) | Integration and E2E | This uses the second free project slot ([F7](RESEARCH.md#findings): 2 active projects). Migrations are applied with `supabase db push --linked` (CLI only, no Docker, [IDEA.md Q19](IDEA.md#decisions-interview-q1q25)) |
| **Fixture exam site** | — | E2E | `e2e/fixtures/exam/` served by Playwright's `webServer` at `http://localhost:4173`. The exam page is `/exam/form.html`, and `/other/page.html` is the "cheating" site. The session pattern is `http://localhost:4173/exam/*` |
| **Real exam site** | `ocm-main` | Manual demo T47 | A Google Form owned by the team, pattern `https://docs.google.com/forms/*` (A2) |

**Seed data** (`npm run seed:test`, idempotent): admins `admin-a@test.local` and `admin-b@test.local`, and students `student-1@test.local` and `student-2@test.local`, with passwords from `.env.test`. Users are created through the Auth Admin API with the test project's service-role key.
- The key is used only by the test runner, never by either app ([F14](RESEARCH.md#findings)).
- `.env.test` is gitignored and never committed.

**Reset** (`npm run reset:test`): truncates `events`, `heartbeats`, `screenshots`, `attempts`, `exam_sessions` and `join_failures`, empties the `screenshots` bucket, and keeps the seeded users. It runs before every integration and E2E suite. Tests that need old data (T21) insert rows with backdated `ended_at` through the service role.

## Test cases

| ID | Verifies | Type | Steps | Pass criteria |
| --- | --- | --- | --- | --- |
| T1 | R9 | Unit | Run `matchExamUrl` over a table: exact host, `*` in the host and path, `*` scheme, query and fragment present, a different host, a `chrome://` URL, an invalid URL | Each case returns the expected boolean; the query and fragment never affect the result |
| T2 | R11, R26 | Unit | `sanitizeUrl` on URLs with a query, a fragment, user info, ports, and non-HTTP schemes | The output never contains `?`, `#` or `@` credentials; `host` and `path` are correct |
| T3 | R14 | Unit | `findGaps` with: no heartbeats; regular 15 s beats; one 90 s hole; a hole of exactly 60 s; a late first beat (leading gap); an early stop (trailing gap); an unsorted input | Holes over 60 s are gaps and a hole of exactly 60 s is not; leading and trailing gaps are included; durations are exact to the millisecond |
| T4 | R18 | Unit | `scoreAttempt` with one event of each type in `EVENT_TYPES` and with 0, 1 and 3 gaps | The score equals the weight table in [SDD § Event catalogue](SDD.md#event-catalogue) plus 8 per gap |
| T5 | R18 | Unit | Scores of `threshold_medium − 1`, `threshold_medium`, `threshold_high − 1` and `threshold_high`, plus a low score containing `warning_limit_reached` | Levels are low, medium, medium and high; the override gives high |
| T6 | R17 | Unit | Warning policy with limit 3 and a 10 s cool-down: warning events at t = 0, 3, 11, 25, 40 s; also non-warning events | Decisions: warn(1), none (cool-down), warn(2), warn_and_limit(3), limit_reminder; non-warning types always return none |
| T7 | R16 | Unit | Coalescer with a 3 s window and 600 ms spacing: 5 triggers within 3 s, then a trigger at +3.5 s, then 10 triggers 100 ms apart | One capture for the first burst with 4 attaches; a new capture at 3.5 s; never two captures less than 600 ms apart |
| T8 | R4 | Unit | `generateSessionCode` 10,000 times with a seeded random function | Every code has 6 characters from the 32-character alphabet; none contain I, O, 0 or 1 |
| T9 | R18, R20 | Unit | `scoreAttempt` breakdown for a mixed event list | Σ breakdown points = score; counts per type are correct |
| T10 | R2 | Integration | Sign up a new student and a new admin with metadata; then each calls `update profiles set role = …` on itself | Profiles exist with the right role and full name; the role updates are rejected or affect 0 rows |
| T11 | R3, R25 | Integration | admin-a calls `join_session`; student-1 calls `create_session` and selects from `exam_sessions`, `attempts`, `events` | `OCM_NOT_STUDENT`; `OCM_NOT_ADMIN`; the student's selects return 0 rows apart from their own attempts through `my_attempts` |
| T12 | R4 | Integration | `create_session` with valid input; with `ends_at ≤ starts_at`; with an empty pattern list; with `warning_limit` 0 and 11; create 50 sessions | Valid input returns an id and code; the invalid cases give `OCM_INVALID_INPUT`; all 50 codes are unique |
| T13 | R5, R25 | Integration | admin-a and admin-b each create a session; each selects `exam_sessions`, `attempts`, `events`, `heartbeats`, `screenshots` | Each admin sees only rows for their own session |
| T14 | R6 | Integration | student-1 calls `join_session` with an unknown code, an ended session, a future session (then `start_attempt`), and a valid code twice | `OCM_CODE_NOT_FOUND`; `OCM_SESSION_ENDED`; the join succeeds but the start gives `OCM_NOT_OPEN_YET`; the same `attempt_id` comes back both times |
| T15 | R7, R8 | Integration | `start_attempt` with `age_confirmed = false`; then valid; then `start_attempt` on a second session while the first is active | `OCM_CONSENT_REQUIRED`; success stores `consent_at`, `consent_version`, `age_confirmed`, `started_at`; then `OCM_ALREADY_ACTIVE` |
| T16 | R8, R25, R30 | Integration | As student-1, insert events before the start, during the attempt, after the end within 1 h, after the end beyond 1 h (backdated), and with `occurred_at` outside the window. Insert heartbeats after the end. Try update and delete on events | Only the during-attempt and within-grace inserts succeed; heartbeats after the end are rejected; update and delete affect 0 rows |
| T17 | R14 | Integration | Insert a heartbeat and an event that each supply `received_at = '2000-01-01'` | The stored `received_at` is within 5 s of the server's `now()` |
| T18 | R21, R25 | Integration | student-1 uploads to their own attempt path and to another attempt's path; admin-b requests a signed URL for admin-a's object; admin-a requests a signed URL with expiry 3600 | Own path succeeds and the other fails; admin-b is denied; admin-a's URL loads, and its expiry is ≤ 1 h |
| T19 | R22 | Integration | admin-a calls `set_verdict` on their attempt; admin-b on the same attempt; student-1 selects verdict columns | Success with `verdict_by` and `verdict_at` set; `OCM_NOT_SESSION_ADMIN`; the student can't see verdict fields |
| T20 | R23 | Integration | Seed an attempt with events, heartbeats and 3 screenshots; run the dashboard's delete routine as admin-a | 0 rows remain in the 3 tables for the attempt; 0 objects under its prefix; `data_deleted_at` is set; as admin-b, the routine is denied |
| T21 | R24 | Integration | Seed attempts that ended 31 days ago and 29 days ago, with data and objects; call `retention-cleanup` with the secret, then without it | With the secret, the 31-day attempt's data and objects are gone and the 29-day attempt is untouched; without it, the response is 401 and nothing is deleted |
| T22 | R14, R19 | Integration | Seed heartbeats with 0, 1 and 3 holes; compare `session_attempt_summaries` gap counts with `findGaps` on the same data | The counts are equal in every case (the "one rule, two implementations" check, [SDD F6](SDD.md#f6-admin-review-r18r23)) |
| T23 | R15 | Integration | Call `uninstall-beacon` with a valid active token twice, with a random token, and with no token | The first call inserts exactly one `extension_uninstalled` event; the later calls insert nothing; every response has the same status and body |
| T24 | R6 | Integration | student-1 calls `join_session` 11 times with bad codes within 10 minutes, then once with a valid code | Calls 1–10 give `OCM_CODE_NOT_FOUND`; call 11 and the valid call are rate-limited (`OCM_RATE_LIMITED`) |
| T25 | R1 | E2E | Fresh profile: open the popup → chooser; choose Admin → a new tab with the dashboard. Open the dashboard → chooser; choose Student → install message; choose Admin → login | Each screen appears as described in R1, and no sign-up form appears on the wrong path |
| T26 | R3 | E2E | Sign in to the extension as admin-a; sign in to the dashboard as student-1 | The extension shows "This is an admin account. Use the dashboard." with no Join form; the dashboard shows the student message and loads no data |
| T27 | R6, R7, R8 | E2E | As student-1: login → enter code → summary → Continue → notice page. Try Start with 0, 1 and 2 boxes ticked; then Start | Start is enabled only with both boxes ticked; the attempt is `active`; the popup shows "Monitoring" |
| T28 | R10, R17 | E2E | During an active attempt on the fixture exam tab, switch to another tab for about 5 s and return; alt-tab-equivalent by focusing a second window for about 3 s and returning | Events `exam_tab_hidden` and `exam_tab_visible` (with `away_ms` within ±1 s), and `window_blur` and `window_focus`; the banner shows "Warning 1 of 3…" and a notification is created within 2 s of the first action |
| T29 | R9, R11 | E2E | Navigate the exam tab to `/other/page.html?secret=1#x`; open a new tab to the same URL | `navigated_off_exam` and `url_visited` have host `localhost:4173` and path `/other/page.html` with no query or fragment; `tab_opened` is recorded |
| T30 | R12, R26 | E2E | On the exam page (top frame and an iframe), do copy, cut, paste and right-click; do the same on a non-exam tab | 4 events of each type from the exam tab with `frame` set; none from the other tab; no event details contain the clipboard text |
| T31 | R13 | E2E | Enter fullscreen through the chosen mechanism (OQ1), exit it; in a second attempt, never enter it | The first gives `fullscreen_enter` then `fullscreen_exit` with a warning; the second has no `fullscreen_exit`, and the review shows "Not in fullscreen" |
| T32 | R9 | E2E (shortened timing) | Start with no matching tab open; wait 5 s | Exactly one `exam_page_not_detected` event |
| T33 | R14 | E2E (real timing) | Active attempt for 2 min; then disable the extension at `chrome://extensions` for 90 s and re-enable it; then close the exam tab for 75 s and reopen it | Heartbeat intervals during normal operation are 15 ± 5 s; review shows one gap of about 90 s (±15 s) and one of about 75 s (±15 s) |
| T34 | R16 | E2E (shortened timing) | Run idle for 35 s; then trigger 5 warning events within 3 s | About 3–4 interval screenshots (10 s interval); the burst gives exactly one violation screenshot linked to all 5 events; no `screenshot_failed` with a rate-limit error |
| T35 | R17 | E2E | With limit 3, trigger 4 warning events at least 11 s apart | Banners say "Warning 1 of 3" to "Warning 3 of 3", plus the limit-reached message; one `warning_limit_reached`; a 4th event is still recorded (monitoring continues) |
| T36 | R8 | E2E | A session with `ends_at` = now + 60 s; start; wait 75 s; then switch tabs | The attempt is `ended` with `end_reason = time_window`; the popup says the exam ended; no events or heartbeats after `ended_at` |
| T37 | R8 | E2E | During an active attempt, close the Playwright persistent context and relaunch it with the same user-data directory; wait 30 s | Monitoring resumes: new heartbeats arrive within 30 s of the relaunch, and the downtime shows as a gap |
| T38 | R30 | E2E | During an active attempt, `context.setOffline(true)` for 120 s while switching tabs and pasting; then go back online | All queued events are uploaded with their original `occurred_at`; the review shows a gap covering the offline period |
| T39 | R4, R5, R19, R20, R21 | E2E | As admin-a: create a session through the form; check the list and status; open session detail after T28–T35 data exists; sort by risk; open candidate review; toggle each filter; open a screenshot from an event and from the gallery | The list shows the session with the right status and counts; the High candidate is first; the timeline is ordered, with gap bars; the filters work without reloading; the breakdown total equals the badge score; the screenshot opens with its linked events |
| T40 | R22, R23 | E2E | Set the verdict to Suspicious with a note, then change it to Cheating confirmed; run Delete data with the typed `DELETE` confirmation | Session detail shows the latest verdict; after the delete, the review shows "Data deleted on <date>" and the gallery is empty |
| T41 | R28 | E2E + manual | Run axe on every dashboard route, the popup screens, the notice page and the fixture page with the banner showing. Manual: complete T27 and T39 using only the keyboard; VoiceOver pass over the banner and candidate review | No serious or critical axe violations; every step works by keyboard; VoiceOver announces the banner text without moving focus |
| T42 | R29 | Non-functional | Profile the exam tab during T28/T30 actions in DevTools; time candidate review for a 1-hour seeded attempt; read the build size report | Every content-script handler ≤ 5 ms; review interactive ≤ 2 s; popup ≤ 200 KB gzipped, content script ≤ 20 KB gzipped |
| T43 | R16, R29 | Non-functional (manual, 1 h) | Run a real 1-hour attempt on the Google Form with normal use (real timing), then query `sum(bytes)` and the median of `screenshots.bytes` | Total ≤ 10 MB; median ≤ 150 KB |
| T44 | R25 | Non-functional | `npm run check:secrets` greps `extension/.output` and `dashboard/dist` for the actual secret-key values of both projects (from `.env.test` and the Supabase CLI) and for `sb_secret_` followed by at least 10 key characters. A bare `sb_secret_` or `service_role` isn't a finding: supabase-js contains those as string literals (seen 2026-11-14) | No matches (the script exits 0) |
| T45 | R7, R26 | Manual review | Compare the privacy notice text, the event catalogue in `packages/core`, and all `chrome.*` and DOM listeners in the extension source | Every collected item is in the notice; nothing in the code collects outside the R26 list |
| T46 | R27 | Manual | Check `manifest.json`; install the unpacked build on current Chrome stable; also try Edge (best effort) | `minimum_chrome_version` is `"120"`; T47 passes on Chrome stable; the Edge result is recorded |
| T47 | R27; success metrics M-demo, M-detect, M-triage | Manual (two laptops, Google Forms) | Run the [IDEA.md demo script](IDEA.md#definition-of-done-q17): create the session; join; take the Form while switching to ChatGPT and pasting; disable the extension for about 70 s; review; set the verdict. An unfamiliar person does the triage step | Every action appears on the timeline; the gap appears; the candidate is High; the reviewer finds the ChatGPT screenshot within 60 s; no manual database edits are needed |
| T48 | R31 | Manual | A team member follows the README from a fresh clone on a clean machine, through to running `npm test` and the demo | It completes without help; any missing step is logged as an S2 defect |
| T49 | Success metric M-false-flags | Manual (15 min) | Answer a Google Form normally without leaving it, starting in fullscreen | Low risk, 0 warnings |
| T50 | R10 (A5) | E2E + manual | During an active attempt, open and close the extension popup 3 times; show a Chrome notification and click it | No `window_blur`, `exam_tab_hidden` or warning caused by the popup; the notification-click result is recorded in [SDD § Key flows](SDD.md#key-flows) |
| T51 | R14 | E2E (real timing, 7 min) | During an active attempt, keep another tab active (the exam tab hidden) for 6 minutes, which brings in Chrome's hidden-tab timer throttling | There's no gap over 60 s during the hidden period: alarm-sourced heartbeats fill in (the `source = 'alarm'` count is > 0) |

## Entry and exit criteria

**Entry** (before a milestone's tests start):
- The milestone's code builds (`npm run build`) with no TypeScript errors.
- The test project's migrations are up to date (`supabase db push --linked` reports no changes).
- `npm run seed:test` and `npm run reset:test` succeed.
- For E2E: the extension build exists at `extension/.output/chrome-mv3`.

**Exit for a milestone:** every test listed in that milestone's exit criteria in [BUILD.md](BUILD.md) passes, there are no open S1 or S2 defects in its scope, and the results are recorded in the BUILD milestone log.

**Exit for the demo (release):**
- All unit and integration tests (T1–T24) pass.
- All E2E tests (T25–T41, T50, T51) pass on Chrome stable.
- Manual tests T43, T45–T49 have been run and recorded.
- There are no open S1 or S2 defects; S3 defects are listed in the README's known issues.
- The coverage table below has no gaps.

## Defect severity levels

| Severity | Definition | Examples | Response |
| --- | --- | --- | --- |
| **S1, Critical** | Privacy or security breach, data loss, or the demo can't run | One admin sees another admin's data; a service-role key is in a bundle; data is collected before Start or after the end; clipboard text is stored | Stop work; fix before anything else; add a regression test |
| **S2, Major** | A Must requirement fails, or evidence is wrong | A tab switch isn't recorded; a false gap appears in normal use; the wrong risk level; delete leaves files behind | Fix within the current milestone; it blocks milestone exit |
| **S3, Minor** | A Should or Could requirement fails, or there's a workaround | An axe "moderate" issue; the review takes 3 s; the uninstall beacon doesn't fire | Fix before the demo if time allows; otherwise list it in the README's known issues |
| **S4, Cosmetic** | Visual or copy issues with no functional effect | Spacing, a typo, alignment | Batch the fixes in M6 |

## Coverage

| Requirement | Tests |
| --- | --- |
| R1 | T25 |
| R2 | T10 |
| R3 | T11, T26 |
| R4 | T8, T12, T39 |
| R5 | T13, T39 |
| R6 | T14, T24, T27 |
| R7 | T15, T27, T45 |
| R8 | T15, T16, T27, T36, T37 |
| R9 | T1, T29, T32 |
| R10 | T28, T50 |
| R11 | T2, T29 |
| R12 | T30 |
| R13 | T31 |
| R14 | T3, T17, T22, T33, T51 |
| R15 | T23 |
| R16 | T7, T34, T43 |
| R17 | T6, T28, T35 |
| R18 | T4, T5, T9 |
| R19 | T22, T39 |
| R20 | T9, T39 |
| R21 | T18, T39 |
| R22 | T19, T40 |
| R23 | T20, T40 |
| R24 | T21 |
| R25 | T11, T13, T16, T18, T44 |
| R26 | T2, T30, T45 |
| R27 | T46, T47 |
| R28 | T41 |
| R29 | T42, T43 |
| R30 | T16, T38 |
| R31 | T48 (plus the existence of T1–T24 as the automated suite) |
