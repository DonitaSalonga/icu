# ICU (I Caught You) — Idea intake

Problem screening and solution choice for the idea pipeline. The app is named **ICU, "I Caught You"** (decision D8).
Updated: 2026-11-14
Status: solution chosen; research applied ([RESEARCH.md](RESEARCH.md)); design complete. No build until the user says "go".
Source: design interview with the user, 2026-11-14 (Q1–Q25).

## Problem statement

Organisations that give online certification tests on third-party platforms (Coursera, Google Forms, LMS quizzes) can't see what candidates do in their browser during the test. Candidates can switch to AI assistants or search engines, or paste answers, and nothing records it. The result is untrustworthy certificates and no evidence for examiners to review. This is a university project that builds a browser-based monitoring tool to detect and record that behaviour for human review.

## Problem screening

| Test | Verdict pass/weak/fail | Evidence | Confidence |
| --- | --- | --- | --- |
| Real | pass | Institutions already buy proctoring: Respondus, Honorlock, Proctorio (RESEARCH F17–F19). Coursera recorded 107.2 million completed assessments in 2025 (F15). | medium-high |
| Large enough | weak | Online assessment volume is large (F15, F16), but no market size, buyer count or willingness to pay was found for this specific tool. | low |
| Significant | pass | Cheating devalues the certificate and creates academic-integrity risk; examiners currently have no evidence to act on. | medium |
| Relevant | pass | The user is building it as a university project; the scope fits a student-sized team. | high |
| Urgent | weak | **Assumption:** widely available AI assistants make in-browser cheating easier than before. Research found no source measuring this. | low |

Gate: no test failed. "Large enough" and "Urgent" stay weak after research (no direct evidence for this niche); the user chose to proceed (university project, not a commercial launch).

## Target users

- **Student (candidate):** takes an online test on a third-party site with the Chrome extension running.
- **Admin (examiner):** creates exam sessions, reviews flagged candidates, and records verdicts in a web dashboard.

## Possible solutions

1. **Own exam platform with built-in monitoring.** Full control of the test page and easy to build, but it can't monitor tests hosted elsewhere. Rejected: the user wants to monitor third-party tests.
2. **Chrome extension plus hosted backend and admin dashboard.** Monitors any exam site in Chromium browsers; the backend lets admins review remotely. Can't stop uninstalls or see other devices, so tampering is detected, not prevented. **Chosen.**
3. **Desktop lockdown app.** Can see processes and block other apps, but much more work and OS-specific. Rejected as too big for the project.
4. **Extension with no backend (log-file export).** Simplest, but candidates could edit or delete the log. Rejected as not credible.

## Chosen solution and reason

Option 2. It's the only option that monitors third-party exam sites, runs entirely in the browser, and gives admins remote evidence for human review (it supports a decision; it doesn't prove cheating), at a size a university project can deliver.

### Decisions (interview Q1–Q25)

| # | Decision | Reason |
| --- | --- | --- |
| Q1 | Monitor tests on third-party sites; the candidate side is a browser extension only | User's choice |
| Q3 | Warn the candidate live, log every event, and let the admin decide; no auto-termination | False positives (popups, network drops) make auto-termination unfair |
| Q4 | Two roles: student and admin; no live proctor | Live video streaming adds lots of complexity for little value |
| Q5 | Supabase as the backend, plus an admin web dashboard | Remote review with almost no backend code |
| Q6 | Chrome / Chromium only, Manifest V3 | MV3 is required; Edge, Brave and Opera work too |
| Q7 | Signals: leaving the exam tab or window, new tabs and visited URLs, copy/paste/right-click, fullscreen exit, screenshots. No webcam or face detection (removed by the user, Q21) | Browser-only signals; screenshots provide visual evidence |
| Q8 | Warnings shown as a banner on the exam page and as a Chrome notification | The banner is where the candidate is looking; notifications can be disabled |
| Q9 | The admin creates a session (name, URL pattern, time window, warning limit) and gets a code; the student logs in, enters the code, consents, and clicks Start; monitoring runs only during the session | Ties evidence to real accounts; monitoring is strictly bounded |
| Q10 | Heartbeat every ~15 s; an "exam page not detected" flag. The uninstall hook is best effort only, with an opaque ID and no personal data (RESEARCH F12). Heartbeat (Q22): push-based, timeout-based failure detection. The exam-page content script sends an "I'm still here" API call every 15 s, with a 30 s `chrome.alarms` backup (alarms can't fire more often, RESEARCH F9), and the dashboard records "monitoring lost" for any gap over 60 s. Closing the exam tab also stops it. Supabase Presence was rejected because its events aren't saved | Chrome can't block uninstalls, so tampering is detected instead |
| Q11 | Screenshot every 60 s and on violations; compressed JPEG in Supabase Storage; auto-deleted after 30 days by a scheduled cleanup. Chrome allows only 2 captures per second, so events in a burst share one screenshot and failed captures are logged (RESEARCH F6; confirmed by the user, Q23) | Evidence for review, with limited retention |
| Q12 | Consent screen before Start, written as a privacy notice: what is collected, why, who sees it, the 30-day retention, and how to ask for deletion | Privacy, the Philippine rules (Q24), and a good talking point for graders |
| Q13 | Fixed weights per event type; Low/Medium/High thresholds adjustable per session; admin verdict: Cleared / Suspicious / Cheating confirmed, with a note | Simple, explainable scoring |
| Q14 | Extension: WXT, TypeScript, React. Backend: Supabase. Dashboard: React, Vite, Tailwind. One monorepo | See the stack reasons below |
| Q15 | No detection of other or banned extensions | User removed it from scope |
| Q16 | Four dashboard screens: login, sessions list with Create Session form, session detail, candidate review | No analytics page |
| Q17 | Done means the two-laptop demo scenario below, a README, and tests for the risk scoring and event logic | Agreed definition of done |
| Q18 | The first screen asks "Sign up as Student or Admin"; users choose their own role | User's choice; see the limitations |
| Q19 | Supabase Cloud free tier only, with no Docker or local Supabase | User's choice |
| Q21 | Webcam face detection removed entirely: no camera, no MediaPipe, no offscreen document for the camera | User's choice, after research showed "looking away" needed an experimental head-pose estimate; also less personal data under the Philippine rules |
| Q24 | Jurisdiction is the Philippines: the Data Privacy Act of 2012 (RA 10173) and the National Privacy Commission's education-sector advisory on online proctoring apply (RESEARCH F23). Explicit consent, a privacy notice, and human review of every flag (the admin verdict) are required | The user's university is in the Philippines |
| Q25 | The consent screen asks students to confirm they are 18 or older; guardian consent for minors is out of scope | University students are almost all adults; the Philippine guidance requires guardian consent for minors (RESEARCH F23) |
| Q26–Q34 | **AI suggestion** (R32): after each exam, one request to TypeSafe's Jev model with one Choice question (five options: three cheating reasons, needs review, likely fine), sent an anonymous timeline with no name, email or IDs. Screenshots are described by the site they showed, never as pixels or OCR text. It runs automatically when the exam ends, and the admin has Re-analyze. It's a suggestion only: the admin decides. If unavailable, the rule-based risk stays. The privacy notice has a generic line naming no service | User's choice. Speeds up review while keeping the human decision required by the NPC advisory (RESEARCH F23) |
| Name | **ICU, "I Caught You"** | User's choice |
| Q20 | The role chooser appears in both apps. In the extension, Admin opens the dashboard; on the dashboard, Student shows "install the extension". Each app rejects the wrong role | Whichever app someone opens first, they get sent to the right place |

### Stack reasons (Q14)

- **TypeScript + MV3:** MV3 is required for new Chrome extensions, and types catch mistakes in messages between the extension's parts.
- **WXT:** handles manifest generation, hot reload and bundling for the service worker, content script and popup.
- **React:** shared between the popup and the dashboard.
- **Supabase:** Postgres for relational data (admin → sessions → candidates → events → screenshots), plus login, file storage, and access rules.
- **Vite + Tailwind:** quick to build the dashboard, and free to host on Vercel.

Alternatives were considered: Node/Express or FastAPI/Django with Postgres (more backend code to show off), PocketBase, Vue/Svelte, and plain JavaScript.

### Features

**Student (Chrome extension)**
- A role chooser on first launch, then student sign-up or login with Supabase.
- Join an exam with a session code, then a consent screen that must be accepted before Start.
- During the session, on the exam's URL pattern, the extension records:
  - leaving the exam tab or window, and new tabs with their URLs;
  - copy, paste and right-click;
  - exiting fullscreen;
  - a screenshot every 60 s and on violations (events in a burst share one).
- Live warnings ("Warning 1 of 3") as a banner and a notification.
- A heartbeat, an uninstall hook, and an "exam page not detected" flag.

**Admin (web dashboard)**
- A role chooser and admin sign-up or login.
- A sessions list and a Create Session form: name, URL pattern, time window, warning limit, risk thresholds, and a generated code.
- Session detail: a candidate table with risk badges.
- Candidate review:
  - a timeline with red monitoring-gap bars;
  - a screenshot gallery;
  - event filters and a risk breakdown by type;
  - a verdict form;
  - deleting a candidate's data early.

**Out of scope:** candidates under 18, webcam and face detection, live video proctoring, auto-terminating exams, microphone monitoring, banned-extension detection, Firefox, Chrome Web Store publishing, admin invites, Docker or local Supabase.

### Definition of done (Q17)

The demo uses two laptops, one for the student and one for the admin:
1. The admin creates a session, and the student joins with the code.
2. The student takes a Google Forms "exam" while switching to ChatGPT and pasting text.
3. The student sees the warnings live.
4. The student disables the extension for about a minute, and a "monitoring lost" gap appears.
5. The admin sees each event with a screenshot and a High risk badge, then marks the candidate "Cheating confirmed".

Also required: a README with setup steps, and automated tests for the risk scoring and event logic.

### Known limitations

- Any user can sign up as an admin (Q18). The access rules mean a self-made admin sees only sessions they created, never anyone else's.
- The extension can't see phones, other people in the room, other devices, other browsers, or incognito windows. With no webcam, nothing covers phones or helpers; the "exam page not detected" flag only partly covers other browsers.
- Tampering is detected, not prevented.
- Screenshots of the focused window can capture private, non-exam content. The consent screen and the 30-day retention reduce this risk.
- Capturing screenshots of other tabs needs permission on all websites. That's fine for loading the extension unpacked, but it would face Chrome Web Store review.
- Supabase free-tier projects pause after 7 days of low activity. Resume the project in the Supabase dashboard before the demo (RESEARCH F7).
- If the candidate switches to another app, not another browser tab, the screenshot shows the browser window, not that app (RESEARCH F6).
- Proctoring tools have had screen-reader problems (RESEARCH F22). Assistive tools may trigger focus or paste events; the admin's human review is the safeguard.
- Logs and heartbeat gaps support a human decision; they don't prove cheating, because a gap can also mean a network drop or a closed laptop.

## Open questions for deep search

The first pass answered questions 1–7; see [RESEARCH.md](RESEARCH.md#answers-to-the-open-questions). Still open:
1. Prototype before requirements: behaviour on real Google Forms and Coursera quiz pages (URL matching, frames, fullscreen), and the heartbeat under MV3's service-worker lifecycle (not tested live).
2. Philippine compliance details: does the university need a Privacy Impact Assessment or a named Data Protection Officer contact in the privacy notice for a demo with volunteer testers? (Unverified; ask the adviser.)
3. Are the licences of the dependencies compatible with the project?

## Assumptions

- The demo runs on Chromium browsers on laptops.
- Exam sites stay reachable with a fixed URL pattern for the whole session.
- Graders value a working end-to-end demo over a backend written from scratch (this is why Supabase was chosen).
- "Large enough" and "Urgent" rest on adjacent evidence, not on demand for this specific tool (see RESEARCH.md).
