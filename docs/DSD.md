# ICU (I Caught You) — Design system

Visual and interaction rules implementing the requirements in [PRD.md](PRD.md).
Updated: 2026-11-14
Status: draft for user review.

The product has four UI surfaces, and all of them use these rules:

| Surface | Where | Size | R# |
| --- | --- | --- | --- |
| **Popup** | Extension toolbar popup | 360 px wide, height up to 600 px | R1–R3, R6, R8 |
| **Notice page** | Extension page opened in a full tab | Fluid, content column of at most 720 px | R7 |
| **Warning banner** | Injected into the exam page inside a closed shadow root (so the page's CSS can't affect it) | Full width, fixed to the top | R13, R17 |
| **Dashboard** | Web app, four screens (login, sessions, session detail, candidate review) | Responsive from 360 px, designed for ≥ 1280 px | R1–R5, R19–R23 |

Both apps use Tailwind CSS ([SDD.md § Technology choices](SDD.md#technology-choices)). The tokens below are CSS custom properties mapped into the Tailwind theme in one shared preset, `packages/ui-tokens`. Components never use raw colour values.

## Design principles

1. **Clarity beats decoration.** This is an evidence tool. Every screen answers one question: "Which exam?", "Do I agree?", "Who needs review?" or "What happened, when?". There are no illustrations or decorative gradients.
2. **Calm, not punitive.** Students are presumed honest. Warnings state facts ("You left the exam tab") without accusing anyone. Admin wording says "flag" and "review", never "caught" ([IDEA.md Q3](IDEA.md#decisions-interview-q1q25), R17, R22).
3. **Never get in the way of the exam.** The banner never covers form inputs for long, never steals focus, and never blocks clicks outside itself (R17, R29).
4. **Risk is never shown by colour alone.** Every risk or status colour comes with a text label and an icon shape (R18, R28).
5. **Show the evidence next to the claim.** Every flag on the timeline links to its screenshot and raw time (R20, R21).

## Tokens

The theme is light only in v1. Dark mode is a Could, and it would add a second set of colour values under `[data-theme="dark"]` without changing any token names.

### Colour

All text and background pairs must reach 4.5:1 contrast (3:1 for large text and UI boundaries). **Verified 2026-11-14** by computing WCAG contrast for every pair: text and icon pairs are 5.02:1 to 17.74:1 (lowest: success green on white). The light border failed as a control boundary (1.47:1), so `--color-border-strong` was added.

| Token | Value | Use | R# |
| --- | --- | --- | --- |
| `--color-bg` | `#FFFFFF` | Page background | all |
| `--color-surface` | `#F9FAFB` (gray-50) | Cards, table header | all |
| `--color-border` | `#D1D5DB` (gray-300) | Dividers only (1.47:1, decorative) | all |
| `--color-border-strong` | `#6B7280` (gray-500) | Boundaries of inputs, outlined buttons, chips, option cards (4.83:1, meets WCAG 1.4.11's 3:1) | R28 |
| `--color-text` | `#111827` (gray-900) | Body text | all |
| `--color-text-muted` | `#4B5563` (gray-600) | Secondary text, timestamps | all |
| `--color-primary` | `#1D4ED8` (blue-700) | Primary buttons, links, focus ring | all |
| `--color-primary-hover` | `#1E40AF` (blue-800) | Hover and pressed | all |
| `--color-on-primary` | `#FFFFFF` | Text on primary | all |
| `--color-risk-low-bg` / `-fg` | `#DCFCE7` / `#166534` (green-100 / green-800) | Low badge | R18, R19 |
| `--color-risk-med-bg` / `-fg` | `#FEF3C7` / `#92400E` (amber-100 / amber-800) | Medium badge, warning banner | R17–R19 |
| `--color-risk-high-bg` / `-fg` | `#FEE2E2` / `#991B1B` (red-100 / red-800) | High badge | R18, R19 |
| `--color-danger` | `#B91C1C` (red-700) | Destructive buttons, errors, gap bars | R14, R20, R23 |
| `--color-gap` | `#FCA5A5` (red-300) at full opacity, with a `--color-danger` 2 px border | Monitoring-gap bars on the timeline | R14, R20 |
| `--color-success` | `#15803D` (green-700) | Success toasts, "Cleared" verdict | R22 |

Verdict colours reuse the risk tokens: Cleared uses low, Suspicious uses medium, Cheating confirmed uses high.

### Type

The system font stack: `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`. Monospace (codes, timestamps, URLs): `ui-monospace, "SF Mono", Menlo, Consolas, monospace`. No web fonts are loaded, which keeps the extension self-contained and avoids network calls during exams (R26).

| Token | Size / line height | Weight | Use |
| --- | --- | --- | --- |
| `--text-xs` | 12 / 16 px | 400 | Badges, captions |
| `--text-sm` | 14 / 20 px | 400 | Tables, popup body, banner |
| `--text-base` | 16 / 24 px | 400 | Notice page body, dashboard body |
| `--text-lg` | 18 / 28 px | 600 | Section headings, popup title |
| `--text-xl` | 24 / 32 px | 600 | Page titles |
| `--text-code` | 20 / 28 px mono | 600 | Session code display (R4, R6) |

### Spacing

A 4 px base: `--space-1` 4, `-2` 8, `-3` 12, `-4` 16, `-6` 24, `-8` 32, `-12` 48 px. The popup uses 16 px padding; dashboard cards use 24 px.

### Radius

`--radius-sm` 4 px (badges, inputs), `--radius-md` 8 px (buttons, cards), `--radius-lg` 12 px (dialogs, gallery thumbnails), `--radius-full` 9999 px (status dots).

### Elevation

| Token | Value | Use |
| --- | --- | --- |
| `--shadow-0` | none | Flat surfaces, table rows |
| `--shadow-1` | `0 1px 2px rgb(0 0 0 / 0.06)` | Cards |
| `--shadow-2` | `0 4px 12px rgb(0 0 0 / 0.12)` | Warning banner, toasts, popovers |
| `--shadow-3` | `0 12px 32px rgb(0 0 0 / 0.18)` | Dialogs, screenshot lightbox |

The banner uses z-index `2147483647` (the maximum) inside its shadow root so exam-page styles can't cover it (R17).

### Motion

| Token | Value | Use |
| --- | --- | --- |
| `--motion-fast` | 120 ms ease-out | Hover, focus, toggles |
| `--motion-base` | 200 ms ease-out | Banner slide-in, toast, dialog |
| `--motion-exit` | 150 ms ease-in | Banner and toast exit |

Under `prefers-reduced-motion: reduce`, motion is replaced by an instant opacity change. Nothing loops or pulses, except the countdown text updating once per second (R6).

## Components

Each component lists its states. "Focus" always means a 2 px `--color-primary` outline offset by 2 px, visible only with `:focus-visible`.

| Component | Variants | States | Notes | R# |
| --- | --- | --- | --- | --- |
| **Button** | primary, secondary (outline), danger, link | default, hover, focus, pressed, disabled, loading (spinner plus "Saving…", width stays fixed) | At least 44 × 44 px in the popup and 36 px high on the dashboard, with a ≥ 24 × 24 px target (WCAG 2.5.8) | all |
| **Role chooser** | — | default, focus per option | Two large option cards, "I'm a student" / "I'm an admin", each with one line of explanation; radio-group semantics | R1 |
| **Text input** | text, email, password, datetime-local, number | default, focus, invalid (red border, error text below, `aria-invalid`), disabled | Label always visible above the field; never placeholder-only | R2, R4, R6 |
| **Code input** | — | empty, typing, invalid ("Code not found"), checking (spinner) | 6 characters, uppercase monospace, auto-uppercases typed text, accepts paste | R6 |
| **URL pattern list** | — | one row, several rows, invalid row | Add/remove rows; help text with an example `https://docs.google.com/forms/*` | R4 |
| **Checkbox** | — | unchecked, checked, focus, disabled | Used for the two consent boxes (R7) | R7 |
| **Session summary card** | upcoming (countdown), active, ended | — | Name, admin name and email, time window, status pill | R6, R8 |
| **Monitoring status pill** (popup) | Not started, Monitoring (with a green dot and elapsed timer), Reconnecting (amber), Ended | — | Text label always shown next to the dot | R8, R14, R30 |
| **Warning banner** | warning, limit reached, info (fullscreen prompt) | entering, visible, exiting | `--color-risk-med-bg`, 2 px `--color-risk-med-fg` bottom border; text "⚠️ Warning 2 of 3: You left the exam tab." plus a Dismiss button. Auto-hides after 10 s. Never takes focus. Limit-reached variant adds "Your examiner will review this session." The info variant holds the "Enter fullscreen" button (R13) | R13, R17 |
| **Risk badge** | Low, Medium, High | — | Pill with an icon (● Low, ▲ Medium, ■ High) and text, using the risk tokens; never colour only | R18, R19 |
| **Verdict badge** | Not reviewed, Cleared, Suspicious, Cheating confirmed | — | Outlined for Not reviewed | R19, R22 |
| **Data table** | — | loading (skeleton rows), empty (message plus action), populated, error (message plus Retry) | Sortable headers use `aria-sort`; the whole row is clickable, with a real link in the name cell | R5, R19 |
| **Timeline** | — | loading, empty ("No events recorded"), populated, filtered, data deleted | A vertical list with a fixed time column (mono) and a type icon plus label; gap rows are full width with `--color-gap` and the text "Monitoring lost · 10:14:05 – 10:21:40 · 7 min 35 s"; events with screenshots show a thumbnail button | R14, R20, R21 |
| **Filter chips** | — | on, off, focus | One chip per event type with a count; `aria-pressed` | R20 |
| **Risk breakdown** | — | — | A small table: type, count, points, plus a total row equal to the score | R18, R20 |
| **Screenshot thumbnail and lightbox** | — | loading (skeleton), loaded, failed ("Image unavailable"), signed URL expired (auto-refreshes) | The lightbox shows the image, capture time, reason (interval or violation), linked events, and previous/next | R16, R21 |
| **Dialog** | confirm, danger confirm | open, closing | Focus trapped, Esc closes, focus returns to the trigger. The delete dialog asks the admin to type `DELETE` to confirm | R23 |
| **Toast** | success, error | entering, visible, exiting | `role="status"` (success) or `role="alert"` (error); 5 s; doesn't take focus | all |
| **AI suggestion card** | — | not analyzed, pending ("Analyzing…", checks every 3 s), failed ("AI analysis unavailable" plus reason and Re-analyze), done | Suggested option in bold, its %, and confidence (High/Medium/Low). A bar per option (chosen option `--color-primary`, others `--color-border-strong`), analyzed time, and always the line "A suggestion only. It can be wrong; your verdict is the decision." `aria-live="polite"` | R32 |
| **AI suggestion badge** | cheating (risk-high tokens), needs review (risk-med), likely fine (risk-low), Analyzing…, Unavailable, — | — | Short label · %, e.g. "Likely cheating: used AI or the web · 82%" | R32 |
| **Empty state** | — | — | One sentence plus a primary action | R5, R19, R20 |

## Layout and responsive rules

- **Popup:** a single column, 360 px wide, 16 px padding. A screen is a header (product name plus a sign-out menu), the body, and one primary action pinned at the bottom. Screens in order: role chooser, then sign-up/login, then join, then session summary, then Monitoring status with an End exam button.
- **Notice page:** a centred column of at most 720 px. Headings for each data item group, then the consent checkboxes and Start at the end. There is no sticky Start button, so the student scrolls past the full notice (R7).
- **Banner:** fixed to the top of the viewport, full width, at most 64 px high, and on screens narrower than 480 px the text wraps to at most 3 lines. It sits over the page and doesn't push content down, so the exam layout doesn't shift.
- **Dashboard:**
  - A top bar with the product name, admin name and sign-out.
  - The content area is at most 1280 px wide with 24 px gutters (16 px below 640 px).
  - Breakpoints follow the Tailwind defaults: `sm` 640, `md` 768, `lg` 1024, `xl` 1280.
  - **Sessions list:** a table at `md` and wider; below `md`, each row becomes a stacked card.
  - **Session detail:** the table scrolls horizontally inside its own container below `md`, and the page itself never scrolls sideways.
  - **Candidate review:** at `lg` and wider, two columns: the timeline (8/12) and a sidebar with the breakdown, verdict and delete (4/12). Below `lg` it's one column with the order summary, then verdict, then timeline. The gallery sits below the timeline: 4 columns at `xl`, 3 at `lg`, 2 at `sm`, 1 below that.

## Accessibility

The target is **WCAG 2.2 AA** (R28).

- **Keyboard:** every action can be reached with Tab, Shift+Tab, Enter and Space; there are no keyboard traps except inside dialogs, which Esc closes. The role chooser uses arrow keys like a radio group.
- **Focus:** always visible (`:focus-visible` ring, ≥ 3:1 against its background), and never hidden by sticky headers (2.4.11 Focus Not Obscured).
- **Banner announcements:** the banner container has `role="alert"`, so screen readers announce warnings without the banner taking focus. Dismiss is a real `<button>`. Auto-hide pauses while the pointer or keyboard focus is on the banner (2.2.1).
- **Not colour alone:** risk, verdict, gap and status always pair colour with text and icon shape (1.4.1).
- **Contrast:** all tokens are chosen for ≥ 4.5:1 text and ≥ 3:1 UI boundary contrast, verified in M6 (1.4.3, 1.4.11).
- **Target size:** at least 24 × 24 px for every control (2.5.8).
- **Forms:** visible labels, errors in text linked with `aria-describedby`, no reliance on placeholders, and `autocomplete` on email and password (1.3.5, 3.3.1, 3.3.2). Re-entering data isn't required (3.3.7).
- **Accessible authentication:** password fields allow paste and password managers (3.3.8).
- **Tables:** real `<table>` markup with `<th scope>`, and sortable headers announce their state with `aria-sort`.
- **Images:** screenshot `alt` text is "Screenshot at 10:14:05, <reason>". Decorative icons are `aria-hidden`.
- **Timeline:** a semantic `<ol>`. Gap rows include the full time range in text.
- **Reduced motion:** honoured (see Motion).
- **Zoom:** usable at 200% zoom and at a 320 px viewport width on the dashboard (1.4.10). The popup is fixed-width by Chrome, so its content wraps instead of overflowing.
- **Assistive tech and monitoring:** using a screen reader or other assistive tool may trigger focus or paste events. The privacy notice tells students to tell the examiner beforehand, and the review UI never auto-labels anyone as cheating ([RESEARCH F22](RESEARCH.md#findings), PRD R17, R22).
- **Checks:** axe automated scans in E2E tests ([QAD.md](QAD.md)), plus a manual keyboard-only pass and a screen-reader pass (VoiceOver) in M6.

## Content and voice

- **Tone:** plain, neutral, short. Second person to the student ("You left the exam tab"), neutral third person to the admin ("Left the exam tab · 42 s").
- **Terms** (use exactly these):
  - **Exam session:** what the admin creates.
  - **Session code:** the 6-character join code.
  - **Attempt:** one student's run in a session. Shown as "candidate" in admin UI.
  - **Monitoring:** active collection.
  - **Monitoring lost:** a heartbeat gap. Never say "cheated" or "offline" for this.
  - **Flag** and **review:** what admins do. Never "caught" or "violation proven".
  - **Warning:** shown to the student.
  - **Risk level:** Low, Medium or High.
  - **Verdict:** Cleared, Suspicious or Cheating confirmed.
- **Event labels** (student wording / admin wording):

  | Event type | Student banner | Admin timeline |
  | --- | --- | --- |
  | `exam_tab_hidden` | You left the exam tab. | Left exam tab |
  | `exam_tab_visible` | — | Returned to exam tab · away 42 s |
  | `window_blur` | You switched away from the browser. | Browser lost focus |
  | `window_focus` | — | Browser focused · away 1 min 3 s |
  | `navigated_off_exam` | You navigated away from the exam page. | Navigated off exam: `chatgpt.com/` |
  | `tab_opened` | — | Opened a new tab |
  | `url_visited` | — | Visited `chatgpt.com/c` |
  | `copy` / `cut` / `paste` | (paste only) You pasted on the exam page. | Copied / Cut / Pasted on exam page |
  | `context_menu` | — | Right-clicked on exam page |
  | `fullscreen_enter` / `fullscreen_exit` | (exit only) You left fullscreen. | Entered / Left fullscreen |
  | `exam_page_not_detected` | — | Exam page not detected within 2 min of start |
  | `warning_shown` | — | Warning 2 of 3 shown |
  | `warning_limit_reached` | You've reached the warning limit. Your examiner will review this session. | Warning limit reached (forces High) |
  | `screenshot_failed` | — | Screenshot failed: <reason> |
  | `extension_uninstalled` | — | Extension uninstalled (best effort) |
  | gap | — | Monitoring lost · start – end · duration |

- **Times:** dashboard times are `HH:mm:ss` in Asia/Manila, with the full date in section headers and tooltips. Durations: under 1 min, "42 s"; under 1 h, "7 min 35 s"; otherwise "1 h 4 min".
- **Errors:** say what happened and what to do next: "Code not found. Check the code with your examiner." "Couldn't save. Check your connection and try again."
- **Privacy notice:** written at about a grade-8 reading level, with headings: What we collect · Why · Who can see it · How long we keep it · Your rights · Contact. It gives the notice version and date (R7).
- **Capitalisation:** sentence case for all UI text. Event-type identifiers appear only in code.
