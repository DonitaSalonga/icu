# ICU (I Caught You) — Build guide

Phases and milestones that deliver [PRD.md](PRD.md), verified per [QAD.md](QAD.md).
Updated: 2026-11-14
Status: planned. **No build work starts until the user says "go"** (user preference, 2026-11-14).
Current milestone: M1 (in progress)

## Phases

| Phase | Milestones | Purpose |
| --- | --- | --- |
| **A. Walking skeleton and spikes** | M1 | The smallest end-to-end slice: one tab-switch event goes from the student's extension to the admin's screen. It also answers the open questions that could change the design (OQ1–OQ3, A5, hidden-tab throttling) before the rest is built on them |
| **B. Capture** | M2, M3 | All browser signals, warnings, the offline queue, then screenshots |
| **C. Review** | M4 | The complete admin dashboard: risk, timeline, gallery, verdict, delete |
| **D. Trust and privacy** | M5 | Role chooser, full privacy notice and consent, lifecycle edge cases, uninstall beacon, retention, rate limiting |
| **E. Release** | M6 | Accessibility, performance, README, secret checks, the demo rehearsal |

Dependencies: M1 → M2 → M3 → M4 → M5 → M6. M4's UI work can start once M2's events exist, while M3 is in progress. M5's retention spike results come from M1.

**User actions needed before or during M1** (Claude can't do these):
1. Create a Supabase account and two free projects, `icu-main` and `icu-test` ([F7](RESEARCH.md#findings)).
2. Provide each project's URL and publishable (anon) key for `.env`, and the `icu-test` service-role key for `.env.test`. That key is used only by the test runner and is never committed ([QAD § Environments](QAD.md#environments-and-test-data)).
3. Create one Google Form to serve as the demo exam (A2).

## Milestones

```text
Milestone M1 — Walking skeleton + spikes
Goal: A student signs in to the extension, joins with a code, clicks Start, switches tabs, and the admin sees
      exam_tab_hidden / exam_tab_visible events and heartbeats for that attempt on a bare dashboard page.
      Resolve OQ1, OQ2, OQ3, A4, A5 and hidden-tab throttling with recorded evidence.
Delivers R#: R2, R6, R8 (Start/End only), R10 (tab events only), R14 (content-script heartbeat only),
      R25 (base policies for the M1 tables), R27 (manifest). R4 and R7 are partial (minimal form; placeholder notice).
Tasks:
  1. Monorepo with npm workspaces: extension/ (WXT + React + TS), dashboard/ (Vite + React + TS + Tailwind),
     packages/core, packages/ui-tokens (tokens from DSD.md), supabase/, e2e/. Shared tsconfig, ESLint, Prettier, Vitest.
  2. Link the Supabase CLI to icu-main and icu-test (no Docker). Migration 001: profiles (+ auth trigger), exam_sessions,
     attempts, events (catalogue check), heartbeats, received_at triggers, RLS for these tables, RPCs create_session,
     join_session, start_attempt, end_attempt (SDD § Interfaces).
  3. packages/core: EVENT_TYPES, matchExamUrl, findGaps, generateSessionCode, message types; unit tests.
  4. Extension: service-worker Supabase client with a chrome.storage.local adapter (TRUSTED_CONTEXTS); attempt state
     machine persisted to storage; popup screens for sign-up/login (with a role field), code entry, Start, End;
     exam-tab binding; tabs.onActivated events; content script with cs.hello and a 15 s heartbeat; event queue (basic, no backoff).
  5. Dashboard: admin login, minimal create-session form, a page listing one attempt's raw events and heartbeats.
  6. Spikes, each written up in SDD.md and decisions.md:
     a. OQ1 fullscreen: try chrome.windows fullscreen vs DOM requestFullscreen on the Google Form; pick one.
     b. OQ2 Google Forms: check iframes, SPA navigation and the URL across pages and submit; confirm matching and the clipboard listeners.
     c. OQ3/A4: confirm pg_cron + pg_net or Supabase scheduled functions on the free tier; confirm bulk Storage removal from an Edge Function.
     d. A5: does opening the popup or clicking a notification fire windows.onFocusChanged? (T50)
     e. Hidden-tab throttling: does the 30 s alarm backup cover a hidden exam tab after 5+ min? (T51)
  7. seed:test / reset:test scripts.
Deliverables: A running skeleton (both apps plus migrations); spike findings in SDD.md "Key flows" and decisions.md;
      core unit tests.
Exit criteria T#: T1, T3, T10, T13 (tables that exist in M1; re-run in M3 for screenshots), T14, T15 (consent checks may use the placeholder notice), T16, T17,
      T28 (event assertions only; warning assertions move to M2), T50, T51; spike write-ups merged.
Risks: Supabase auth in an MV3 worker misbehaves on restart ([F8](RESEARCH.md#findings), [F9](RESEARCH.md#findings)).
      Google Forms breaks URL matching (OQ2). No free-tier scheduler (OQ3); the fallback is a manual "Run cleanup"
      admin action plus the next login triggering cleanup, recorded as a decision.
Status (planned/in progress/done): done except T50. Spikes 6a and 6b were run on a real public multi-section Google Form (headless), 6c on Supabase, and 6e as T51 (headed). T50 (the real toolbar popup) needs a person, because Playwright can't open an action popup; the popup port that implements A5 is in place.
```

```text
Milestone M2 — Full signal capture + live warnings
Goal: Every browser signal in the event catalogue is recorded during an attempt; students get live warnings;
      network drops don't lose events.
Delivers R#: R9, R10, R11, R12, R13, R14 (alarm backup, tab-closed gap), R17, R30.
Tasks:
  1. Exam-tab re-binding, navigated_off_exam, the exam_page_not_detected alarm (120 s; 5 s in test timings).
  2. windows.onFocusChanged → window_blur / window_focus with away_ms; tabs.onCreated / windows.onCreated → tab_opened;
     tabs.onUpdated → url_visited using sanitizeUrl.
  3. Content-script copy/cut/paste/context_menu in all frames (passive, type only).
  4. Fullscreen per the OQ1 decision; "Not in fullscreen" derived on the dashboard.
  5. packages/core warning policy (10 s cool-down, limit_reminder); the shadow-DOM banner (plain DOM, DSD tokens,
     role="alert"); chrome.notifications; warning_shown / warning_limit_reached events.
  6. The icu-heartbeat alarm backup (30 s, only while the exam tab exists); heartbeat source column.
  7. The offline queue: exponential backoff, caps and queue_overflow (persistence, batching and the duplicate-safe insert landed in M1).
  8. The popup status screen (state, warnings, queue size, last heartbeat).
Deliverables: The extension records every catalogue event except screenshots, uninstall and limit edge cases;
      E2E fixture site.
Exit criteria T#: T2, T6, T28, T29, T30, T31, T32, T33, T35, T38, T51.
Risks: In-page iframes on real exam sites fire clipboard events in frames the content script doesn't reach (OQ2).
      Notifications are blocked by OS settings; the banner still covers this ([IDEA.md Q8](IDEA.md#decisions-interview-q1q25)).
Status (planned/in progress/done): done (all exit tests pass. T33 and T51 run headed and are opt-in with ICU_E2E_SLOW=1)
```

```text
Milestone M3 — Screenshots
Goal: Interval and violation screenshots are captured, coalesced, downscaled, uploaded privately and linked to events.
Delivers R#: R16; R21 and R25 (Storage policies, backend part).
Tasks:
  1. Migration: screenshots table + received_at trigger; the private bucket "screenshots"; storage.objects policies (SDD § RLS).
  2. packages/core coalescer (3 s window, 600 ms spacing) + tests.
  3. Service worker: icu-screenshot alarm (60 s; 10 s in test timings); getLastFocused + captureVisibleTab JPEG;
     createImageBitmap + OffscreenCanvas downscale to 1280 px; queue order screenshot → row → events; screenshot_failed handling.
  4. Record bytes, and write a SQL query for the per-attempt storage total (for T43).
Deliverables: Screenshots in Storage with linked events; storage policy tests.
Exit criteria T#: T7, T18, T34.
Risks: OffscreenCanvas or convertToBlob behaves differently in the MV3 worker; the fallback is an offscreen document with
      reason BLOBS ([F1](RESEARCH.md#findings)). Capture of restricted pages fails ([F6](RESEARCH.md#findings)), which is expected and logged.
Status (planned/in progress/done): done (T7, T18, T34 pass; OffscreenCanvas works in the MV3 worker)
```

```text
Milestone M4 — Admin review dashboard
Goal: An admin can triage a session by risk and review one candidate's full evidence, then record a verdict or delete data.
Delivers R#: R4 (full form), R5, R18, R19, R20, R21, R22, R23.
Tasks:
  1. packages/core scoreAttempt + breakdown; WEIGHTS from SDD § Event catalogue; tests.
  2. SQL: session_attempt_summaries(session_id) with lag()-based gap counts; my_attempts view; set_verdict;
     delete_attempt_rows.
  3. Dashboard screens per DSD.md: sessions list (table/cards, empty state), create-session dialog (pattern list,
     limits, thresholds, validation), session detail (sortable table, risk + verdict badges), candidate review
     (timeline with gap rows, filter chips, breakdown, "Not in fullscreen", gallery + lightbox with signed URLs,
     verdict form, delete dialog with typed DELETE).
  4. Delete routine: list and remove Storage objects in batches of 100, then delete_attempt_rows.
Deliverables: The four dashboard screens (login exists from M1) working against real data.
Exit criteria T#: T4, T5, T8, T9, T12, T19, T20, T22, T39, T40.
Risks: The two gap implementations (SQL vs core) drift; T22 guards this. Signed-URL egress on the free tier ([F7](RESEARCH.md#findings)); thumbnails are lazy-loaded.
Status (planned/in progress/done): done (all exit tests pass)
```

```text
Milestone M5 — Roles, privacy and lifecycle
Goal: The product is safe to put in front of real volunteer students: correct roles, informed consent under RA 10173,
      bounded collection, retention, and tamper signals.
Delivers R#: R1, R3, R6 (rate limit), R7 (full notice), R8 (time-window end, restart recovery), R15, R24, R26.
Tasks:
  1. Role chooser in the popup and the dashboard; wrong-role screens; dashboard routing guards.
  2. Privacy notice page content per DSD.md "Content and voice" and SDD § Privacy; NOTICE_VERSION; the 18+ and agree checkboxes.
  3. The icu-end alarm and time_window end; runtime.onStartup recovery; scripting.executeScript re-injection.
  4. setUninstallURL with the attempt token; Edge Function uninstall-beacon + record_uninstall.
  5. Edge Function retention-cleanup + the daily schedule (mechanism chosen in the M1 spike) + shared secret; join_failures cleanup.
  6. join_failures table and the rate limit in join_session.
  7. Data-minimisation review against R26 (T45); fix anything found.
Deliverables: Complete student journey; both Edge Functions deployed to icu-main and icu-test.
Exit criteria T#: T11, T15 (with the final notice), T21, T23, T24, T25, T26, T27, T36, T37, T45.
Risks: The NPC advisory may need more than a notice (OQ4); the user checks with the adviser. setUninstallURL isn't
      delivered ([F12](RESEARCH.md#findings)), which is acceptable since it's a Could.
Status (planned/in progress/done): done (all exit tests pass; T45 review clean)
```

```text
Milestone M6 — Hardening, accessibility, docs and demo
Goal: Release quality: accessible, within budget, documented, and the two-laptop demo is rehearsed.
Delivers R#: R25 (secret check), R27 (verification), R28, R29, R31; confirms all others.
Tasks:
  1. axe integration in E2E; keyboard-only and VoiceOver passes; fix issues; verify DSD token contrast with a checker.
  2. Performance profiling and bundle-size checks; fix regressions.
  3. check:secrets script.
  4. README: prerequisites, Supabase setup (CLI link, db push, function deploy, secrets), env files, running the apps,
     loading the extension unpacked, tests, the demo checklist (resume a paused project, create the Form, two laptops),
     known limitations (IDEA.md) and known issues (S3).
  5. Dependency licence check (OQ5).
  6. Demo rehearsal: T47 and T49 on the real Google Form; T43 one-hour storage run.
Deliverables: Release-ready repository; README; recorded results of all manual tests.
Exit criteria T#: T41, T42, T43, T44, T46, T47, T48, T49, plus the release exit criteria in QAD.md (T1–T51 green or recorded).
Risks: Real-site behaviour differs from the fixture (A2); rehearse at least 3 days before the demo. Free-tier project
      paused on demo day ([F7](RESEARCH.md#findings)); the README checklist covers this.
Status (planned/in progress/done): in progress. Automated parts are done: T41, T42 and T44; licence check OQ5; README; real-page proxies for T43 and T49. Needs a person: T46 (Edge), T47 (two-laptop demo), T48 (README walkthrough on a clean machine), the full T43 and T49 runs on the demo Form, and T50.
```

```text
Milestone M7 — ICU rename + AI suggestion
Goal: Rename the app to ICU ("I Caught You") everywhere, and add a model-generated suggestion that the admin sees before deciding.
Delivers R#: R32 (and renames across R1–R31).
Tasks: migration 006 (ICU_ codes, Vault names, retention job); migration 007 (ai_analyses, trigger, sweep, Re-analyze,
       screenshot sites); Edge Function ai-analyze + _shared/analysis.ts; extension screenshot site + notice line;
       dashboard card and column; secrets TYPESAFE_API_KEY on both projects.
Exit criteria T#: T52, T53, T54, T55, plus the full regression.
Risks: model credits and pricing are unknown (RESEARCH F28); provider data retention isn't documented.
Status (planned/in progress/done): done
```

## Milestone log

- 2026-11-15: Third feedback round: fullscreen and tab-switch screenshots (R35).
  - **Found in the user's attempts on icu-main:** one attempt never went fullscreen; no attempt recorded leaving fullscreen; and tab-switch warning screenshots were grabbed before the new tab was drawn, so they showed the exam, and the site visit reused that picture.
  - **Fix:** fullscreen is retried until seen; window state is re-checked after changes and on every heartbeat; every tab switch gets its own `tab_switch` screenshot 600 ms after the switch (migration 011). Label "Tell us about the exam", no example text.
  - **Tests:** T62–T65 added; T39 updated.

- 2026-11-15: Second feedback round: start flow and exam info (R34).
  - **Bug:** at Start the window went fullscreen while the ICU monitoring tab was in front, so reaching the exam meant leaving fullscreen, which counted as a warning. **Fix:** the exam tab (the tab the student was on at Continue) is brought to the front before fullscreen; with no exam page open, fullscreen waits until one opens; the monitoring tab isn't "leaving" and has "Go to my exam".
  - **Exam info:** optional About this exam (migration 010), an Exam info panel in session detail, a platform column in the sessions list, and the platform and about text for the student in the popup and notice. Notice version 2026-11-15.2.
  - **Tests:** T60, T61 added; T12, T27 and T39 updated.

- 2026-11-15: Design feedback round, plus whole-screen capture.
  - **Dashboard:** removed the admin name from the header; URL patterns replaced by an **Exam platform** type box with chips; separate date and time boxes; risk-threshold inputs removed (server defaults 10/25).
  - **Platforms (D10):** keyword, domain or domain + path. Other tabs on the platform count as visits; exam-tab page changes are logged.
  - **Whole-screen capture (D9):** Chrome-researched, prototyped and verified. Migration 009 adds the new event types and updates `create_session` validation.
  - **Tests:** T57–T59 added; T1, T12, T27, T39 and T41 updated.
  - **Note:** in automated tests, "entire screen" is the real screen of the machine running them. Test screenshots go only to icu-test and are cleared after runs.

- 2026-11-15: Demo-run fixes on icu-main.
  - **Problem:** a claude.ai visit had no screenshot. The 3 s grouping rule attached it to the earlier ChatGPT screenshot, and screenshots were only taken on warnings.
  - **Fix:** every other website on screen now gets a `url_visited` event with its own screenshot (migration 008 adds `site_visit`), and grouping applies only when the same site is on screen.
  - **Also:** a short-lived retry that captured the wrong page was removed.
  - **Tests:** T56 added; T28 checks the visit's screenshot.

- 2026-11-14: M7 done.
  - **Renamed to ICU** across UI, manifest, packages (`@icu/*`), error codes (`ICU_*`, migration 006), Vault names and job names. Supabase project display names must be renamed in the dashboard by the owner (the CLI can't).
  - **AI suggestion built and deployed to both projects:**
    - A real Jev call on the seeded case returned `cheating_ai_or_web` at 82% with confidence 0.77, using about 690 input tokens.
    - T52–T55 pass.
    - `app_settings.ai_auto` is off in icu-test so regression runs don't spend credits.

- 2026-11-14: M6 automated work done.
  - **T41:** axe scans (WCAG 2.2 A/AA rules) of every extension and dashboard screen and dialog found 0 violations, and the keyboard-only flow passes. The token contrast check found the light border at 1.47:1, which fails WCAG 1.4.11 for control boundaries, so a new `border-strong` token (#6b7280, 4.83:1) is used for controls.
  - **T42:** the heaviest listener call took 2.6 ms (average 0.07 ms); the 1-hour candidate review was interactive in 861 ms; popup about 51 KB gzipped; content script about 2.6 KB gzipped.
  - **T44:** the `check:secrets` script works and fails on a planted key.
  - **OQ5:** all production dependencies are MIT or 0BSD.
  - **T43/T49 proxy:** 5 minutes on a real Wikipedia page gave a median screenshot of 69 KB (about 4.1 MB per hour at 60 s) and no warnings.
  - **Spikes 6a/6b on a real public 3-page Google Form:**
    - "Next" moves `/viewform` → `/formResponse` (full reload), then reloads at the same URL. Both match `docs.google.com/forms/*`, so there's no false `navigated_off_exam`.
    - Window fullscreen survives the reloads (no false `fullscreen_exit`), confirming D6.
    - The form has no iframes; copy and paste on a real field are recorded.
    - The form was never submitted.
  - **T33 (headed, through `chrome://extensions`) found a bug, now fixed:** after re-enable, recovery never re-activated the still-bound exam tab, so only alarm heartbeats resumed. A gap of 96 s was recorded for a 90 s disable.
- 2026-11-14: M5 done.
  - **Built:** migration 005 (join rate limit, uninstall, retention candidates, pg_cron + pg_net job reading Vault), Edge Functions `uninstall-beacon` and `retention-cleanup` (deployed to both projects), the role chooser in both apps, the RA 10173 privacy notice (version 2026-11-14.1), and content-script re-injection.
  - **Tests:** T21, T23, T24, T25, T26, T27, T36, T37 pass. Calling the scheduler path manually returned 200.
  - **Change (D7):** an unknown join code now returns `{error}` instead of raising, so the recorded failure isn't rolled back.

- 2026-11-14: M4 done.
  - **Built:** scoring in `packages/core`; migration 004 (summaries with a SQL gap rule, verdicts, row deletion that refuses while Storage objects remain); dashboard screens per DSD.md.
  - **Regression:** unit 74 of 74, integration 11 of 11, E2E 11 of 11. Layout checked visually from screenshots.
  - **Note:** students have no read access to `attempts` at all, which is stricter than the planned `my_attempts` view. The popup gets everything it needs from RPC responses, so the view wasn't built (T11).

- 2026-11-14: M3 done.
  - **Built:** migration 003 (screenshots, private bucket, path-scoped Storage policies), the coalescer, worker capture with downscale, and a persisted screenshot queue that uploads before linked events.
  - **Tests:** T7, T18 and T34 pass. Fixture screenshots are about 10 KB each.
  - **Bug found by T30 and fixed:** a screenshot queued during an in-flight upload was stranded until the next alarm. A flush requested mid-flush now re-runs afterwards.

- 2026-11-14: M2 built and mostly verified.
  - **Built:**
    - Warning policy in `packages/core` (T6).
    - Window focus, new tabs, visited URLs, navigated-off-exam, exam-page-not-detected, clipboard and context menu in all frames.
    - Browser-window fullscreen (D6).
    - Shadow-DOM warning banner plus notifications.
    - Queue backoff and caps.
    - Popup port so the popup itself doesn't count as leaving (A5).
  - **E2E harness:** Playwright with Chromium 159, loading the extension built against `icu-test`. 8 of 8 E2E tests pass.
  - **Findings:**
    - Headless Chromium doesn't emit the window focus-return event, so the window test runs headed.
    - On macOS, a window opened from a fullscreen exam window bounces focus back after about 0.5 s. That produces a short real `window_blur` with a warning, which is acceptable.

- 2026-11-14: Supabase set up with the CLI.
  - **Projects:** `icu-main` (ref `jrmvczctkzhmuuxclhpm`) and `icu-test` (ref `jyoxiircwkyxkxdnklrc`), free plan, `ap-southeast-1`. Migrations 001 and 002 applied to both.
  - **Tests on real Supabase (PostgreSQL 17):** integration tests T10, T11 (backend part) and T13–T17 pass, 5 of 5. Exit criteria met for these: T10, T13, T14, T15, T16, T17.
  - **Advisor hardening (migration 002):** policy helpers moved to a `private` schema; trigger functions no longer client-callable. The remaining advisor warnings are the four intended RPCs, plus leaked-password protection (not enabled).
  - **Spike 6c / OQ3 answered:** `pg_cron`, `pg_net` and `supabase_vault` are all available on the free plan (queried `pg_available_extensions` on `icu-main`).
  - **Code location:** private GitHub repo `DonitaSalonga/icu` (renamed from online-certification-monitoring on 2026-11-14); docs on `main`, code on `dev`.
  - **Still open for M1:** T1/T3 already pass; T28, T50 and T51 (browser) and spikes 6a, 6b, 6d, 6e.

- 2026-11-14: M1 started on the user's "go".
  - **Done:**
    - Workspace scaffold.
    - `packages/core` (URL matching, gaps, session codes, event catalogue, messages) with 36 passing unit tests (T1, T2, T3, T8, plus a SQL-parity test).
    - `packages/ui-tokens`.
    - Migration `20261114000001_m1_core.sql`, smoke-tested in PGlite (PostgreSQL 18 in WebAssembly) with a stand-in `auth` schema: 33 of 33 checks pass. This is not Supabase itself.
    - Extension skeleton (sign-in and sign-up, join, placeholder notice, Start and End, exam-tab binding, `exam_tab_hidden`/`exam_tab_visible`, 15 s heartbeat plus 30 s alarm backup, persisted queue). It builds and typechecks.
    - Dashboard skeleton (admin login, sessions list and create form, session detail, raw timeline with gaps). It builds and typechecks.
    - Integration tests for T10, T11 (backend part) and T13–T17, written and skipped until `.env.test` exists.
  - **Finding:** PostgreSQL 18 rejects `INSERT … ON CONFLICT (id) DO NOTHING` without a select policy, so the queue uses plain inserts instead (D4).
  - **OQ3, partly answered:** Supabase docs show `pg_cron` + `pg_net` + Vault calling an Edge Function. Free-plan availability isn't stated, so it will be checked on the project.
  - **Blocked:** applying the migration and running integration tests, E2E tests and spikes 6a–6e, until the user creates `icu-main`/`icu-test` and the demo Google Form.

- 2026-11-14: Plan created from IDEA.md Q1–Q25 and RESEARCH.md through `contextspine prompt propagate`. No code exists yet; M1 waits for the user's "go".
