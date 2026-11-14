# online-certification-monitoring — Deep search record

Research findings answering the open questions in [IDEA.md](IDEA.md).
Updated: 2026-11-14
Status: first pass complete. Research by a Codex agent (gpt-6.1-terra, medium effort, session `01a1d991-4f39-7cb3-988a-c3869211dcdc`, 2026-11-14). Normalized by Claude, which re-checked the claims the solution depends on (marked ✔ below) against the official docs on 2026-11-14. No prototype or live testing was done.

## Scope

The seven open questions from IDEA.md:
1. Can the webcam be used in an MV3 offscreen document after a one-time permission grant?
2. Does MediaPipe run under MV3's CSP, and can it detect "looking away"?
3. What is the `captureVisibleTab` rate limit?
4. What are the Supabase free-tier limits and the screenshot capacity?
5. How can a Supabase login session be kept in an MV3 service worker?
6. How reliable are URL patterns and fullscreen detection on Google Forms and Coursera?
7. Is the uninstall hook a reliable session or tamper signal?

Also covered: competitors, market and users, legal/compliance, risks.

## Findings

Published shows the date the source states; "not stated" means none was found. Vendor rows describe their own products, not independent evaluations. ✔ means Claude re-fetched the source and confirmed the claim on 2026-11-14.

| # | Claim | Source URL | Published | Accessed | Confidence | Fact/Inference |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | ✔ MV3 offscreen documents support the `USER_MEDIA` reason for `getUserMedia()`. Only one offscreen document can be open at a time. Only `AUDIO_PLAYBACK` has a lifetime limit (closes after 30 s of silence); other reasons have none. | https://developer.chrome.com/docs/extensions/reference/api/offscreen | Not stated | 2026-11-14 | High | Fact |
| F2 | The offscreen docs don't confirm that a camera grant made on another extension page always carries over to the offscreen document on every Chrome version and OS. The flow, plus denied and revoked permissions, must be tested. | https://developer.chrome.com/docs/extensions/reference/api/offscreen | Not stated | 2026-11-14 | High | Inference |
| F3 | ✔ The default `extension_pages` CSP is `script-src 'self'; object-src 'self';`, which disables WebAssembly. `'wasm-unsafe-eval'` may be added explicitly. `'unsafe-eval'` is rejected at install. | https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy | Not stated | 2026-11-14 | High | Fact |
| F4 | ✔ Face Detector returns bounding boxes and 6 keypoints per face (both eyes, nose tip, mouth centre, both ear tragions), detects multiple faces, and has a web package (`@mediapipe/tasks-vision`). It says nothing about gaze or head pose. | https://developers.google.com/edge/mediapipe/solutions/vision/face_detector (cited by Codex as https://ai.google.dev/edge/mediapipe/solutions/vision/face_detector, which redirects here) | Not stated | 2026-11-14 | High | Fact |
| F5 | Face Landmarker returns landmarks, blendshapes and facial transformation matrices, which are usable for a head-pose estimate. Neither MediaPipe source validates a gaze-away or cheating classifier. | https://ai.google.dev/edge/api/mediapipe/python/mp/tasks/vision/FaceLandmarkerResult | Not stated | 2026-11-14 | High | Fact |
| F6 | ✔ `captureVisibleTab` is limited to 2 calls per second (`MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND`), is described as expensive, and needs `<all_urls>` or `activeTab`. It captures the visible area of the active tab in the given window, and sensitive pages are restricted. | https://developer.chrome.com/docs/extensions/reference/api/tabs | Not stated | 2026-11-14 | High | Fact |
| F7 | ✔ Supabase Free plan: 500 MB database per project, 1 GB file storage, 5 GB egress (plus 5 GB cached egress, per Codex), 2 active projects. Projects are paused after low activity over 7 days and can be resumed from the dashboard for up to a year; a few requests a day prevents pausing. | https://supabase.com/pricing ; https://supabase.com/docs/guides/platform/free-project-pausing | Not stated; pausing page updated 2026-09-22 | 2026-11-14 | High | Fact |
| F8 | Supabase Auth persists sessions and accepts a custom async storage adapter (`getItem`, `setItem`, `removeItem`). Extension service workers have no Web Storage. | https://supabase.com/docs/reference/javascript/auth ; https://supabase.com/docs/guides/auth/sessions | Not stated | 2026-11-14 | High | Fact |
| F9 | ✔ The extension service worker stops after 30 s of inactivity. Extension API events and calls, active WebSockets (Chrome 116+), and messages from an offscreen document (Chrome 109+) reset the timer. The minimum alarm period is 30 s (Chrome 120+). Timers in the worker are cancelled when it stops. | https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle ; https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers | Not stated | 2026-11-14 | High | Fact |
| F10 | Fullscreen requests need a user gesture and may fail. `fullscreenchange` and `document.fullscreenElement` track DOM fullscreen; iframe permissions affect whether it's available. | https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API/Guide | Not stated | 2026-11-14 | High | Fact |
| F11 | Chrome ignores the path part of host-permission match patterns. Content scripts don't run in every frame unless configured to. | https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns ; https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts | Not stated | 2026-11-14 | High | Fact |
| F12 | `setUninstallURL` opens a fixed HTTP(S) URL after uninstall. Its contract doesn't promise the URL is delivered, doesn't identify a session, and doesn't fire on disable. | https://developer.chrome.com/docs/extensions/reference/api/runtime | Not stated | 2026-11-14 | High | Fact |
| F13 | `chrome.storage.local` is readable by content scripts by default; its access level can be restricted to trusted extension contexts. | https://developer.chrome.com/docs/extensions/reference/api/storage | Not stated | 2026-11-14 | High | Fact |
| F14 | Supabase secret and service-role keys bypass row-level security and must stay on a trusted server, never in the extension or dashboard. | https://supabase.com/docs/guides/auth/users | Not stated | 2026-11-14 | High | Fact |
| F15 | Coursera: 197 million cumulative registered learners, 107.2 million assessments completed and 6 million professional-certificate enrollments in 2025. These are platform activity figures, not proctoring demand. | https://www.sec.gov/Archives/edgar/data/1651562/000165156226000015/cour-20251231.htm | 2026 (annual report) | 2026-11-14 | High | Fact |
| F16 | Coursera had 1,730 paid enterprise customers (business, campus, government) at the end of 2025. They are not necessarily proctoring buyers. | https://www.sec.gov/Archives/edgar/data/1651562/000165156226000006/cour-20251231xshareholde.htm | 2026 (shareholder letter) | 2026-11-14 | High | Fact |
| F17 | Respondus offers an installed LockDown Browser with optional webcam recording, automated flags and instructor review. It claims more than 1,500 institutions and 70 million assessments a year (vendor claim, 2019 figure). | https://web.respondus.com/new-features-for-respondus-monitor/ ; https://web.respondus.com/wp-content/uploads/2019/09/Respondus-Monitor.pdf | 2016; 2019 | 2026-11-14 | Medium | Fact (vendor claim) |
| F18 | Honorlock is a cloud proctoring service integrated with an institution's LMS that requires a student Chrome extension. | https://honorlock.com/legal/Honorlock_TOS_Students.pdf | Not stated | 2026-11-14 | High | Fact |
| F19 | Proctorio's release notes describe LMS integration plus extra camera and review features. These are vendor descriptions, not proof that the product works. | https://changes.proctorio.com/ | 2026-10-12 | 2026-11-14 | Medium | Fact (vendor claim) |
| F20 | A study analysed proctoring-extension reviews and surveyed 102 students about privacy and security. The sample isn't representative. | https://arxiv.org/abs/2106.05917 | 2021-06-10 | 2026-11-14 | High | Fact |
| F21 | At one university, many instructors switched to other forms of assessment instead, and those who used proctoring weighed privacy against how useful they thought it was. | https://arxiv.org/abs/2302.12936 | 2023-02-24 | 2026-11-14 | Medium | Fact |
| F22 | The US GAO reported that a disability organisation said some proctoring systems didn't work with screen readers. | https://www.gao.gov/assets/gao-22-104430.pdf | 2022 | 2026-11-14 | High | Fact |
| F23 | Philippine education-sector privacy guidance calls for explicit student consent (a parent or guardian's for minors), notices, and human validation of automated proctoring where possible. It applies only if the institution falls under it. | https://privacy.gov.ph/wp-content/uploads/2023/05/DP-Council-Education-Sector-Advisory-No.-2020-1.pdf | 2020 | 2026-11-14 | High | Fact |
| F24 | US educational use may raise FERPA questions depending on the facts. | https://studentprivacy.ed.gov/faq/i-want-use-online-tool-or-application-part-my-course-however-i-am-worried-it-violation-ferpa | Not stated | 2026-11-14 | Medium | Fact |
| F25 | **Estimate, unverified:** about 100 KB per JPEG × 60 per hour ≈ 6 MB per candidate-hour, so 1 GB holds about 160 candidate-hours. Real capacity is lower because of violation screenshots, deletion delays and other files. Storage and egress are separate limits. | F7 sources | — | 2026-11-14 | Low | Inference |

## Answers to the open questions

1. **Webcam in an offscreen document:** possible on paper (F1), but not proven end to end (F2). The pattern: open a visible extension page and request the camera there with a user click, then create an offscreen document (`USER_MEDIA`) that calls `getUserMedia` itself. Results go back to the extension through runtime messages, and the camera stops when the session ends. Test what happens on a browser restart, a denied or revoked permission, and a camera in use by another app. **Fallback:** keep a small extension page open during the exam to hold the camera stream.
2. **MediaPipe and the CSP:** allowed if `'wasm-unsafe-eval'` is added and the WASM and model files are bundled locally (F3). Face Detector covers "no face" and "multiple faces" (F4), but has no gaze or head pose. "Looking away" needs either a rough estimate from Face Detector's 6 keypoints (Inference) or Face Landmarker's transformation matrix (F5). Either way it's an experimental head-pose estimate, not validated gaze tracking.
3. **Screenshots:** limited to 2 per second (F6). Queue and merge captures, so several events in a burst share one screenshot, and record failed captures. A capture shows the active tab of the browser window. If the candidate switches to a *different app* (not a browser tab), the screenshot shows the browser, not that app (Inference from F6).
4. **Supabase capacity:** 1 GB storage, 500 MB database, 5 GB egress, and a pause after 7 days of low activity (F7). The estimate is about 160 candidate-hours of screenshots (F25), which is plenty for a demo. 30-day auto-deletion must be built as a scheduled cleanup that also deletes the Storage files.
5. **Login in the extension:** use a Supabase storage adapter backed by `chrome.storage.local` (F8), restricted to trusted contexts (F13). Token refresh runs only in the service worker. Never put a service-role key in a client (F14). This design follows the docs but hasn't been tested as a whole.
6. **URL and fullscreen detection:** Chrome ignores paths in host permissions (F11), so URL patterns must be matched in code by checking the tab's URL. Content scripts need `all_frames` to see embedded quiz frames. Fullscreen needs a user click and can't be forced (F10), so the extension asks the candidate to enter fullscreen on Start and then watches for exits. **Unverified** on real Google Forms or Coursera quizzes, since no live testing was done.
7. **Uninstall hook:** unreliable (F12). It may never arrive, and it doesn't fire on disable. Treat it as best effort, with only an opaque single-use ID in the URL (no token or personal data). The server-side heartbeat gap is the main signal, but a gap can also mean a network drop, a closed laptop, or tampering.

**Heartbeat cadence (affects Q10):** alarms can't fire more often than every 30 s (F9). But messages from an offscreen document keep the service worker running (F9), and `USER_MEDIA` offscreen documents have no lifetime limit (F1). So a 15 s heartbeat sent from the offscreen document (which already holds the webcam), with a 30 s alarm as backup, should work (Inference, untested).

## Competitors and existing solutions

- **Respondus:** an installed lockdown browser plus webcam recording and instructor review (F17).
- **Honorlock:** a student Chrome extension tied to the institution's LMS (F18).
- **Proctorio:** LMS-integrated proctoring with camera and review features (F19).

These prove that institutions buy this kind of tool. None of the sources gives independent false-positive rates, effectiveness data, or support for monitoring arbitrary third-party exam sites. Some instructors avoid proctoring by redesigning assessments instead (F21).

## Market and users

Coursera's 107.2 million assessments in 2025 (F15) and its 1,730 enterprise customers (F16) show a large amount of online assessment, and the vendors above show that supply already exists. Neither figure is a market size for *this* tool. No count of buyers, prices or willingness to pay was found. The student survey (F20) and the instructor study (F21) give direction only. No source measured AI-assisted cheating.

## Technical options and constraints

See the answers to the open questions above. In short, the chosen stack is feasible on paper, with four constraints: the 30 s alarm floor, the 2-per-second screenshot limit, the `wasm-unsafe-eval` CSP entry, and Supabase free-tier pausing. Three things need a prototype before requirements are finalised: the webcam permission flow, MediaPipe packaging, and real exam-site behaviour.

## Legal/compliance

Which jurisdiction applies is **undecided**. If the institution is in the Philippines, the education-sector privacy advisory applies: consent (a guardian's for minors), notices, and human validation (F23). In the US, FERPA and accessibility duties may apply (F22, F24). A consent checkbox and 30-day retention alone don't make the tool compliant; a real deployment would need a defined data controller, legal basis, access rules, deletion, and an appeal process. For a university demo with volunteer testers, the existing consent screen is a reasonable minimum (Inference). The licences of the MediaPipe models and dependencies have not been checked.

## Risks

- **Evidence integrity:** the candidate controls the device and extension, so uploads can be blocked, delayed or faked. Logs support human review; they don't prove cheating.
- **Fairness and accessibility:** face detection can misfire for disability, lighting, a broken camera, or normal reading. Proctoring tools have had screen-reader problems (F22). Human review and an appeal path matter.
- **Privacy:** screenshots and visited URLs can capture unrelated personal data.
- **Feasibility:** the webcam grant, MediaPipe packaging and exam-site behaviour are unproven; prototype them first.
- **Market:** there's no evidence of demand for this specific product. That's acceptable for a university project, but it keeps "Large enough" and "Urgent" weak.

## Impact on IDEA.md

Applied 2026-11-14; see IDEA.md. Follow-up decisions by the user: webcam face detection removed entirely (Q21), so findings F1–F5 and open questions 1–2 no longer affect the design; burst screenshots confirmed (Q23); jurisdiction is the Philippines (Q24), so F23 applies.
- **Real:** strengthened by the existing vendors (F17–F19) and Coursera's assessment volume (F15). Still a pass, now with medium-high confidence.
- **Large enough and Urgent:** still weak; there's no direct evidence for this niche.
- **Q7 "looking away":** Face Detector alone can't do it; an experimental head-pose estimate is needed (pending).
- **Q10 heartbeat:** sent from the offscreen document every 15 s, with a 30 s alarm as backup; the gap threshold is widened to 60 s (pending). The uninstall hook is demoted to best effort.
- **Q11 screenshots:** merged in bursts instead of exactly one per violation (pending).
- **Chosen-solution wording:** "evidence admins can trust" becomes "evidence for human review".
- **New open questions:** which jurisdiction applies, and the dependency licences.

## External brief

Not used. The research was done by a Codex agent with web access instead of an external tool.

## External results

Codex's raw output was normalized into the sections above on 2026-11-14. Every source URL it cited is kept in the Findings table. Its raw answer is kept in the Codex session log `~/.codex/sessions/2026/11/14/rollout-2026-11-14T18-19-01-01a1d991-4f39-7cb3-988a-c3869211dcdc.jsonl` and isn't duplicated here.
