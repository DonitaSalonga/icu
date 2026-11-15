# ICU (I Caught You) — UI/UX handoff

Read before changing how ICU looks or reads. How the screens connect to the backend (every call, message and error code to keep) is in [BACKEND-HANDOFF.md](BACKEND-HANDOFF.md). Behaviour, data and privacy rules are in [SDD.md](SDD.md) and [PRD.md](PRD.md); the visual rules are in [DSD.md](DSD.md). **DSD v2 (2026-11-15)** is the approved target design: warm theme, sidebar dashboard (Overview, Sessions, Needs review, Account), expandable popup cards, consent popout window, welcome page. Its last section lists what it changes outside the visuals. Keep both in sync if you change them.

## Where the UI lives

| Surface | Files | Notes |
| --- | --- | --- |
| Extension popup (360 px) | `extension/entrypoints/popup/App.tsx` | Role chooser, student sign-in, join, monitoring status, End exam. Opens a `popup` port so the popup doesn't count as "leaving the exam" (keep it) |
| Privacy notice + monitoring tab | `extension/entrypoints/notice/Notice.tsx` (also `lib/screen.ts`) | After Start this page holds the whole-screen share and stays open, pinned, as "ICU monitoring"; don't navigate away from it or the share stops. Legal content under RA 10173. Wording changes need `NOTICE_VERSION` bumped in `packages/core/src/notice.ts`, and every listed item must stay true to what is collected (QAD T45) |
| Warning banner | `extension/lib/banner.ts` | Plain DOM in a closed shadow root on the exam page. No React, no page CSS. Must not take focus or block the page; `role="alert"` |
| Shared extension UI | `extension/lib/ui.tsx` | Button, Field, Alert |
| Dashboard pages | `dashboard/src/pages/*.tsx` | RoleChooser, Login, Sessions (with create dialog), SessionDetail, AttemptReview |
| Dashboard components | `dashboard/src/ui.tsx`, `dashboard/src/components/AiSuggestion.tsx` | Badges, Dialog (native `<dialog>`), Toast, AI card |
| Labels and wording | `dashboard/src/lib/labels.ts`, `packages/core/src/ai.ts`, `packages/core/src/warnings.ts` | Event and AI-suggestion wording |
| Design system | `packages/ui-tokens/icu.css` (the design file's stylesheet; Satoshi loads from Fontshare), `packages/ui-tokens/icons.tsx` (its icons, `Icon` and `Tile`) | Both apps import only `icu.css`; pages use its classes (`card`, `btn p/s/g/d`, `pill hi/md/lo/live`, `seg`, `t`, `dlg`, `toast`, …). There's no Tailwind in the pages any more. Libraries: **Sonner** (toasts, `notify()` in `dashboard/src/ui.tsx`), **Base UI** (create-session `Dialog`, account `Menu` in `AppShell.tsx`), **input-otp** (exam code boxes in the popup), styled by the additions at the end of `icu.css` |

## Rules to keep

- **Wording:** the AI suggestion is a suggestion. Keep "your verdict is the decision"; never present the tool as deciding guilt (Philippine NPC advisory, RESEARCH F23).
- **Colour:** risk, verdict and AI badges always pair colour with text (and an icon for risk).
- **Accessibility:** WCAG 2.2 AA. Visible focus, labels on every input, keyboard-only use, 24 px minimum targets, reduced motion respected.
- **Test selectors:** the E2E tests find elements by role and visible text, e.g. buttons "I'm a student", "Sign in", "Find exam", "Continue", "I agree & share screen", "Share entire screen", "Share screen again", "Go to my exam", "End exam", "Create session", "Save verdict", "Hold to delete candidate data", "Re-analyze", "Screenshot"; headings "Good morning/afternoon/evening, {name}" (Overview), "Sessions", "Needs review", "Account settings", "Admin sign in", "Privacy & terms", "AI suggestion", "Risk breakdown", "ICU monitoring", "Welcome to ICU"; fields "Email", "Password", "Exam code", "Exam platform", "Tell us about the exam", "Name", "Date", "Time"; document "Privacy notice text"; lists "Exam platforms", "Exam sessions" and "Candidates to review" (row cards, each row clickable); region "Exam info"; navigation "Main" (no breadcrumbs since feedback round 3); text "Now open your exam in this browser." If you rename text, update `e2e/*.spec.ts` in the same change.

## Checks before handing back

```sh
npm run typecheck
npm test                                   # unit
npx playwright test e2e/m6-accessibility.spec.ts   # axe + keyboard (needs .env.test)
npm run test:e2e                           # full browser suite (~13 min)
npm run build && npm run check:secrets
```
Design changes must keep **0 axe violations** and the keyboard-only flow passing.
