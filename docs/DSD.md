# ICU (I Caught You) — Design system

Visual and interaction rules implementing the requirements in [PRD.md](PRD.md). How the screens connect to the backend is in [BACKEND-HANDOFF.md](BACKEND-HANDOFF.md); test selectors are in [UI-HANDOFF.md](UI-HANDOFF.md).
Updated: 2026-11-15 (v2: warm theme, sidebar dashboard, expandable extension cards, popout consent window)
Status: **built** (2026-11-15), then revised the same day from the user's page-by-page feedback (Satoshi font, the user's logo, pastel Overview, row cards, student avatars; round 3 removed the breadcrumbs, and moved delete under Screenshots; see BUILD.md). The user supplied the final design file, "ICU redesign (DSD v2).html" (13 boards: 8 dashboard, 5 extension). It was integrated exactly: its stylesheet is `packages/ui-tokens/icu.css` (unchanged, plus its bundled Inter and JetBrains Mono files and a few documented additions at the end), its icons are `packages/ui-tokens/icons.tsx`, and every screen uses its markup and classes. **Where this document and the design file differ (exact colours, sizes, wording), the design file wins.** Deviations kept on purpose: the ICU tile's letters are drawn by CSS as a logo (WCAG 1.4.3 exemption), a role-chooser `<button>` lays out like the design's links, the notice mentions tab-switch screenshots and the popout window (NOTICE_VERSION 2026-11-15.3), and the student's exam card adds the exam platform.

**Direction (user, 2026-11-15):**
- **Dashboard:** clean, organised and easy to navigate, in the style of the "Halcyon" reference: a warm cream canvas, white cards, an orange accent, a left sidebar with icons, breadcrumbs, a large italic page title, stat cards and calm tables.
- **Student extension:** the same theme. The popup is built from **expandable cards** (cult-ui "Expandable" style: a compact card grows smoothly in place to reveal details and actions).
- **Privacy notice:** shown in a **popout box** (a centred dialog with scrolling sections and a footer with Cancel / I agree), not a long page.
- **Start:** students can get started easily, through a first-run welcome and a short start flow.

The product has these UI surfaces, and all of them use these rules:

| Surface | Where | Size | R# |
| --- | --- | --- | --- |
| **Popup** | Extension toolbar popup | 360 px wide, height up to 600 px | R1–R3, R6, R8 |
| **Welcome page** (new) | Extension page opened once after install | Fluid, centred column of at most 640 px | R1, R33 |
| **Consent popout** (replaces the notice page) | A small extension window (`chrome.windows.create`, `type: 'popup'`), centred on screen | 480 × 640 px | R7, R26, R33 |
| **Monitoring window** | The same popout window after Start, showing a compact status view; it stays open behind the fullscreen exam (macOS won't minimize it, see Feasibility) | 480 × 640 px | R33, R34 |
| **Warning banner** | Injected into the exam page inside a closed shadow root (so the page's CSS can't affect it) | Floating card, top centre | R13, R17 |
| **Dashboard** | Web app: role chooser, login, then the app shell with Overview, Sessions, Session detail, Needs review, Candidate review and Account | Responsive from 360 px, designed for ≥ 1280 px | R1–R5, R19–R23, R34 |

Both apps use Tailwind CSS ([SDD.md § Technology choices](SDD.md#technology-choices)). The tokens below are CSS custom properties mapped into the Tailwind theme in one shared preset, `packages/ui-tokens`. Components never use raw colour values.

## Design principles

1. **Clarity beats decoration.** This is an evidence tool. Every screen answers one question: "What needs my attention?", "Which exam?", "Do I agree?", "Who needs review?" or "What happened, when?". The warmth comes from colour and type, not illustrations or gradients.
2. **Organised and easy to navigate.** The same app shell is on every admin page: a sidebar for where you are, breadcrumbs for how deep you are, and one primary action per page, top right. Lists live in cards, and nothing important is more than two clicks from Overview.
3. **Calm, not punitive.** Students are presumed honest. Warnings state facts ("You left the exam tab") without accusing anyone. Admin wording says "flag" and "review", never "caught" ([IDEA.md Q3](IDEA.md#decisions-interview-q1q25), R17, R22).
4. **Interactive, not busy (extension).** The popup shows one card at a time. Tapping it expands it to reveal details and the next action, so the student never faces a wall of text.
5. **Never get in the way of the exam.** The banner never covers form inputs for long, never steals focus, and never blocks clicks outside itself (R17, R29).
6. **Risk is never shown by colour alone.** Every risk or status colour comes with a text label and an icon shape (R18, R28). The orange accent never means risk.
7. **Show the evidence next to the claim.** Every flag on the timeline links to its screenshot and raw time (R20, R21).

## Tokens

The theme is light only in v2. Dark mode is a Could; it would add a second set of colour values under `[data-theme="dark"]` without changing any token names.

### Colour

All text and background pairs must reach 4.5:1 contrast (3:1 for large text and UI boundaries). **Verified 2026-11-15** by computing WCAG contrast for every pair below; the ratios are in the table.

| Token | Value | Use | Contrast | R# |
| --- | --- | --- | --- | --- |
| `--color-bg` | `#F6F3EE` (warm cream) | App canvas, popup background, sidebar | — | all |
| `--color-surface` | `#FFFDF9` | Cards, dialogs, table body, active nav item | — | all |
| `--color-surface-sunken` | `#EEEAE3` | Segmented-control track, table header, code input cells, skeletons | — | all |
| `--color-border` | `#E7E1D8` | Dividers and card outlines only (decorative) | — | all |
| `--color-border-strong` | `#8C8279` | Boundaries of inputs, outlined buttons, chips, checkboxes | 3.40 on bg, 3.70 on surface | R28 |
| `--color-text` | `#1C1917` | Body text, titles, stat values | 15.8 on bg, 17.2 on surface | all |
| `--color-text-muted` | `#5F574F` | Secondary text, timestamps, captions, nav labels | 6.4 on bg, 7.0 on surface, 5.9 on sunken | all |
| `--color-accent` | `#D9662E` (orange) | **Non-text only:** logo tile, active-nav indicator bar, sparkline and chart lines, progress fill, notification dot | 3.22 on bg (graphics ≥ 3:1) | all |
| `--color-primary` | `#B4501E` (deep orange) | Primary buttons, links, focus ring, selected segment text | white on it 5.11; 4.62 on bg; 5.03 on surface | all |
| `--color-primary-hover` | `#9A4318` | Hover and pressed | white on it 6.58 | all |
| `--color-on-primary` | `#FFFFFF` | Text on primary | — | all |
| `--color-accent-soft-bg` / `-fg` | `#FBE7DA` / `#8A3B12` | Count badges in the nav, the "New" tag, the selected chip | 6.46 | all |
| `--color-risk-low-bg` / `-fg` | `#E2F1E4` / `#1E6B34` | Low badge, "Monitoring" pill, positive change | 5.59 | R18, R19 |
| `--color-risk-med-bg` / `-fg` | `#FAEFC5` / `#7A5200` (amber-yellow, deliberately not orange) | Medium badge, warning banner | 6.00 | R17–R19 |
| `--color-risk-high-bg` / `-fg` | `#FBE2DE` / `#9F1F17` | High badge, "Screen sharing stopped" alert | 6.35 | R18, R19 |
| `--color-danger` | `#B42318` | Destructive buttons, errors, gap-bar border | white on it 6.57; 6.47 on surface | R14, R20, R23 |
| `--color-gap` | `#F8C9C3` with a 2 px `--color-danger` border | Monitoring-gap bars on the timeline | border 4.42 | R14, R20 |
| `--color-success` | `#1E6B34` | Success toasts, the "Cleared" verdict | 6.44 on surface | R22 |

- **Verdict colours** reuse the risk tokens: Cleared uses low, Suspicious uses medium, Cheating confirmed uses high.
- **Orange vs. warning:** Medium risk and the banner use **amber-yellow**, and the brand uses **orange**. The two must stay visually distinct; never use `--color-accent` for a warning.

### Type

Fonts (updated 2026-11-15): **Satoshi** is the only typeface. It loads from Fontshare's servers through `@font-face` rules in `packages/ui-tokens/icu.css`, because its licence (ITF Free Font License) forbids putting the font files in a public repository. ICU collects nothing through it; without a connection the system font stack takes over. (The original plan bundled Inter and JetBrains Mono as `woff2` files.)

- **Sans:** **Inter** (variable, with italics) for all UI text. Fallback: `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.
- **Mono:** **JetBrains Mono** for numbers in stat cards, codes, timestamps, URLs and segmented-control labels (the reference's "8.2M / 10M", "30D" look). Fallback: `ui-monospace, "SF Mono", Menlo, Consolas, monospace`.
- **Numbers:** tabular figures (`font-variant-numeric: tabular-nums`) wherever numbers line up: tables, timers, stats.

| Token | Size / line height | Weight / style | Use |
| --- | --- | --- | --- |
| `--text-xs` | 12 / 16 px | 500 | Badges, captions, sidebar section labels (uppercase, `letter-spacing: 0.08em`, mono) |
| `--text-sm` | 14 / 20 px | 400 | Tables, popup body, banner |
| `--text-base` | 16 / 24 px | 400 | Dashboard body, consent text |
| `--text-lg` | 18 / 28 px | 600 | Card titles, popup card title |
| `--text-xl` | 24 / 32 px | 600 | Dialog titles, popup screen titles |
| `--text-display` | 40 / 44 px (32 / 36 below `md`) | 800 italic, `letter-spacing: -0.02em` | Page titles ("Overview", "Sessions"), as in the reference |
| `--text-stat` | 36 / 40 px mono | 600 | Stat-card values, risk score |
| `--text-code` | 24 / 32 px mono | 600 | Session code display (R4, R6) |

### Spacing

A 4 px base: `--space-1` 4, `-2` 8, `-3` 12, `-4` 16, `-5` 20, `-6` 24, `-8` 32, `-12` 48 px.
- **Popup:** 16 px padding, with 12 px between cards.
- **Dashboard:** cards use 24 px inner padding, the grid gap is 20 px, and page sections are 32 px apart.

### Radius

| Token | Value | Use |
| --- | --- | --- |
| `--radius-sm` | 6 px | Badges, inputs, segment items |
| `--radius-md` | 10 px | Buttons, nav items, chips |
| `--radius-lg` | 16 px | Cards, the segmented-control track |
| `--radius-xl` | 24 px | Dialogs, the consent popout content, the expanded popup card |
| `--radius-full` | 9999 px | Status dots, avatars, pills |

### Elevation

| Token | Value | Use |
| --- | --- | --- |
| `--shadow-0` | none | Flat surfaces, table rows |
| `--shadow-1` | `0 1px 2px rgb(28 25 23 / 0.04), 0 1px 1px rgb(28 25 23 / 0.03)` | Cards at rest |
| `--shadow-2` | `0 6px 16px rgb(28 25 23 / 0.08)` | Hovered cards, the expanded popup card, toasts, banner |
| `--shadow-3` | `0 20px 48px rgb(28 25 23 / 0.18)` | Dialogs, screenshot lightbox |

- **Cards** also have a 1 px `--color-border` outline, which is what keeps white-on-cream cards crisp in the reference.
- **Banner z-index:** `2147483647` (the maximum) inside its shadow root, so exam-page styles can't cover it (R17).

### Motion

| Token | Value | Use |
| --- | --- | --- |
| `--motion-fast` | 120 ms ease-out | Hover, focus, toggles, segment switch |
| `--motion-base` | 200 ms ease-out | Banner slide-in, toast, dialog fade/scale (0.96 → 1) |
| `--motion-expand` | 320 ms `cubic-bezier(0.32, 0.72, 0, 1)` | Expandable card: size and position change, content fades in 80 ms after the card starts growing |
| `--motion-exit` | 150 ms ease-in | Banner, toast and dialog exit |

- **Expandable cards:** animate size with a layout (FLIP) animation, not by animating `height: auto`, so it stays smooth at 60 fps. The card's content keeps its position while the card grows around it; in the reference, the badge and icon stay fixed while details appear below.
- **Reduced motion:** under `prefers-reduced-motion: reduce`, every animation becomes an instant change (the expanded content just appears).
- **No looping:** nothing loops or pulses, except the elapsed-time and countdown text updating once per second (R6, R8).

## Components

Each component lists its states. "Focus" always means a 2 px `--color-primary` outline offset by 2 px, visible only with `:focus-visible`.

### Shared (dashboard and extension)

| Component | Variants | States | Notes | R# |
| --- | --- | --- | --- | --- |
| **Button** | primary (deep orange), secondary (surface with strong border), ghost (text only), danger | default, hover, focus, pressed, disabled, loading (spinner plus "Saving…", width stays fixed) | At least 44 px high in the popup and the consent popout, 36 px on the dashboard; ≥ 24 × 24 px target (WCAG 2.5.8). An icon plus label where it helps ("⤓ Export"-style) | all |
| **Icon** | outline, 1.5 px stroke, 20 px (16 px in tables) | — | One icon set (Lucide, ISC licence) bundled per app; always `aria-hidden` next to a text label | all |
| **Card** | static, interactive (hover lifts to `--shadow-2`), stat | — | `--color-surface`, 1 px `--color-border`, `--radius-lg`, 24 px padding | all |
| **Stat card** | value, value + change, value + sparkline | loading (skeleton), empty ("—") | Label (muted, sm), value (`--text-stat`), optional change pill (`↗ +3 vs last week`, risk-low colours when good, risk-high when bad, never colour alone) and a sparkline in `--color-accent` with an end dot | R19, R34 |
| **Segmented control** | 2–4 options | default, hover, selected, focus | Track `--color-surface-sunken`, selected segment `--color-surface` with `--shadow-1`, mono labels; radio-group semantics with arrow keys | R19 |
| **Pill** | status (Live, Upcoming, Ended, Monitoring, Reconnecting), countdown ("In 15 min") | — | A dot plus text; "In 15 min" uses risk-high colours only when under 5 min | R6, R8 |
| **Text input** | text, email, password, date, time, number, search (with icon and a `/` shortcut hint on the dashboard) | default, focus, invalid (red border, error text below, `aria-invalid`), disabled | Label always visible above the field; never placeholder-only | R2, R4, R6 |
| **Checkbox** | — | unchecked, checked, focus, disabled | Custom box drawn with `--color-border-strong`, checked fill `--color-primary` | R7 |
| **Dialog** | confirm, danger confirm, form (create session), document (consent) | open, closing | `--radius-xl`, `--shadow-3`, a cream scrim at 40% black. Header: title plus a ✕ close button. Footer: right-aligned secondary then primary button. Focus trapped, Esc closes, focus returns to the trigger. The delete dialog asks for `DELETE` typed to confirm | R23 |
| **Toast** | success, error | entering, visible, exiting | Bottom-right card with `--shadow-2`; `role="status"` (success) or `role="alert"` (error); 5 s; doesn't take focus | all |
| **Empty state** | — | — | An icon in a soft circle, one sentence, one primary action | R5, R19, R20 |

### Dashboard

| Component | Variants | States | Notes | R# |
| --- | --- | --- | --- | --- |
| **App shell** | — | sidebar expanded (≥ `lg`), collapsed to icons (`md`–`lg`), drawer (below `md`) | **Sidebar** (264 px, `--color-bg`, right border), top to bottom: the brand block (orange tile with a white bold "ICU" at ≥ 19 px, then "ICU" / "I Caught You"); nav items **Overview**, **Sessions**, **Needs review** (count badge in accent-soft); an uppercase mono section label "ACCOUNT" with **Account**; at the bottom, a user card (initials avatar, name, email, sign-out icon button with label "Sign out"). Active item: `--color-surface` background, `--shadow-1`, and a 3 px `--color-accent` bar on the left edge. **Top bar:** breadcrumbs ("ICU / Sessions / CCNA 1 final") on the left; search and the page's primary action on the right | R1, R19 |
| **Page header** | — | — | `--text-display` italic title, a muted one-line subtitle under it (for example "Today · Asia/Manila"), and an optional segmented control on the right | all |
| **Data table** | — | loading (skeleton rows), empty (message plus action), populated, error (message plus Retry) | Inside a card; header row `--color-surface-sunken`, uppercase xs mono labels; 56 px rows; sortable headers use `aria-sort`; the whole row is clickable, with a real link in the name cell | R5, R19 |
| **Risk badge** | Low, Medium, High | — | Pill with an icon (● Low, ▲ Medium, ■ High) and text, using the risk tokens; never colour only | R18, R19 |
| **Verdict badge** | Not reviewed, Cleared, Suspicious, Cheating confirmed | — | Outlined for Not reviewed | R19, R22 |
| **AI suggestion badge** | cheating (risk-high), needs review (risk-med), likely fine (risk-low), Analyzing…, Unavailable, — | — | Short label · %, e.g. "Likely cheating: used AI or the web · 82%" | R32 |
| **AI suggestion card** | — | not analyzed, pending ("Analyzing…", checks every 3 s), failed ("AI analysis unavailable" plus reason and Re-analyze), done | Suggested option in bold, its %, and confidence (High/Medium/Low). A bar per option (chosen option `--color-accent`, others `--color-surface-sunken`), analyzed time, and always the line "A suggestion only. It can be wrong; your verdict is the decision." `aria-live="polite"` | R32 |
| **Exam platform input** | — | empty, typing (live "Will monitor …" hint), invalid (red border + message), chips added | Type, then Enter or Add; chips (`--radius-md`, strong border) have a ✕ remove button (`aria-label` "Remove …"); the list is labelled "Exam platforms" | R33 |
| **Session code** | — | default, copied ("Copied" for 2 s) | `--text-code` mono in a sunken box with a Copy button | R4 |
| **Exam info card** | with or without about text | — | Session detail: a card titled "Exam info" (region) with a definition list: About the exam, Exam platform (entry + plain-words meaning), Schedule, Warning limit, Code for students | R34 |
| **Timeline** | — | loading, empty ("No events recorded"), populated, filtered, data deleted | Inside a card, as a vertical list: a fixed mono time column, a type icon in a soft circle, the label, and a screenshot thumbnail button when there is one. Gap rows are full width with `--color-gap` and the text "Monitoring lost · 10:14:05 – 10:21:40 · 7 min 35 s" | R14, R20, R21 |
| **Filter chips** | — | on, off, focus | One chip per event type with a count; `aria-pressed` | R20 |
| **Risk breakdown** | — | — | A small table: type, count, points, plus a total row equal to the score | R18, R20 |
| **Screenshot thumbnail and lightbox** | — | loading (skeleton), loaded, failed ("Image unavailable"), signed URL expired (auto-refreshes) | Thumbnails `--radius-md`. The lightbox shows the image, capture time, reason (interval, on warning, site visit or tab switch), linked events, and previous/next | R16, R21 |

### Extension

| Component | Variants | States | Notes | R# |
| --- | --- | --- | --- | --- |
| **Popup header** | — | signed out, signed in | ICU tile (24 px) plus "ICU"; on the right, a status dot and a ⋯ menu (Sign out) when signed in | R1, R8 |
| **Expandable card** | session, monitoring, ended | collapsed, expanding, expanded, collapsing | The popup's core pattern (cult-ui "Expandable" style). **Collapsed:** a compact white card with a status pill top-left, an icon button top-right, a title and one line of time. **Expanded** (tap or Enter/Space on the card, which is a `button` with `aria-expanded`): it grows in place with `--motion-expand` to show details and one or two full-width actions; tap the header or press Esc to collapse. Only one card is expanded at a time. Contents per variant are under Layout below | R6, R8 |
| **Role chooser** | — | default, focus per option | Two option cards side by side, "I'm a student" / "I'm an admin", each with an icon and one line of explanation; radio-group semantics | R1 |
| **Code input** | — | empty, typing, invalid ("Code not found"), checking (spinner) | Six separate mono cells on `--color-surface-sunken`; typing moves to the next cell, paste fills all, auto-uppercase; one accessible `input` behind the cells, labelled "Exam code" | R6 |
| **Alert card** | screen sharing stopped, not configured, error | — | risk-high colours, an icon, one sentence, one action ("Share screen again") | R33 |
| **Consent popout** | consent, re-share, monitoring | scrolled-to-end gate, sharing (waiting for Chrome's picker), error | See Layout. Header "Privacy & terms" plus ✕ (= Cancel); a scrollable body (`tabindex="0"`, `role="document"`) with section headings; a sticky footer with the two checkboxes and Cancel / **I agree & share screen** | R7, R26, R33 |
| **Warning banner** | warning, limit reached | entering, visible, exiting | A floating card, top centre (max 560 px wide, 12 px from the top), `--color-risk-med-bg` with a 4 px `--color-risk-med-fg` left bar, `--shadow-2`. The text is "Warning 2 of 3: You left the exam tab." plus a Dismiss button; it auto-hides after 10 s and never takes focus. The limit-reached variant adds "Your examiner will review this session." | R13, R17 |
| **Welcome steps** | — | step pending, step done (✓), all done | Three numbered step cards; each shows a live check when it's done | R1, R33 |

## Layout and responsive rules

### Dashboard

- **App shell:** the sidebar is on the left and the content area on the right (at most 1280 px wide with 32 px gutters; 16 px below 640 px). Breakpoints follow the Tailwind defaults: `sm` 640, `md` 768, `lg` 1024, `xl` 1280. Below `md`, the sidebar becomes a drawer opened from a ☰ button in the top bar, and the page never scrolls sideways.
- **Overview** (new landing page after sign-in, `/overview`):
  1. **Page header:** "Overview", the subtitle "Today · Asia/Manila", and a segmented control **Today · 7D · 30D** that filters by session start date.
  2. **Stat cards** (2 × 2 at `lg`, 4 across at `xl`, 1 column below `md`):
     - **Live now:** sessions in progress, with candidates monitoring.
     - **Candidates:** attempts started in the period, with a sparkline per day.
     - **Needs review:** ended attempts without a verdict; clicking it opens Needs review.
     - **High risk:** attempts at High in the period.
  3. **Two cards side by side** (one column below `lg`):
     - **"Needs review"**: the top 5, High first, with "View all".
     - **"Live and upcoming sessions"**: name, platform, starts/ends, candidates.
  4. **Data:** existing calls only (sessions list plus `session_attempt_summaries` per session, see BACKEND-HANDOFF §3). If this gets slow with many sessions, a single summary RPC is a backend change for later.
- **Sessions** (`/sessions`):
  - **Header:** "Sessions"; primary action **Create session**.
  - **Filters:** a segmented control **All · Live · Upcoming · Ended**, plus a search field that filters by name or platform.
  - **Table card** with columns: Name (and the first line of the about text, muted), Exam platform (chips), Schedule, Status pill, Candidates, High risk. Below `md`, each row becomes a stacked card.
  - **Create session** opens a form dialog. Fields, in order:
    1. Name.
    2. Exam platform (chips).
    3. Tell us about the exam (textarea, optional, no example text).
    4. Starts (date + time).
    5. Ends (date + time).
    6. Warning limit.
  - After it's created, a success toast and a card show the code with a Copy button.
- **Session detail** (`/sessions/:id`):
  - **Breadcrumbs:** "ICU / Sessions / {name}".
  - **Header:** the session name (display italic), a status pill, and the session code with Copy.
  - **Stat cards:** Candidates, Monitoring now, Needs review, High risk.
  - **Two columns** at `lg`: the candidates table card (8/12) and the Exam info card (4/12). Below `lg`, Exam info comes first.
  - **Table:** sortable by risk (default, High first), name or start; it scrolls horizontally inside its card below `md`.
- **Needs review** (`/review`, new): every ended candidate without a verdict, across the admin's sessions.
  - **Columns:** Candidate, Session, Risk, AI suggestion, Ended.
  - **Order:** High first, then by score; a segmented control **All · High · Medium · Low**.
  - **Empty state:** "You're all caught up."
- **Candidate review** (`/sessions/:id/attempts/:attemptId`):
  - **Breadcrumbs:** "ICU / Sessions / {session} / {candidate}".
  - **Header:** the candidate name (display italic), email, and risk badge.
  - **Columns at `lg`:**
    - **Left (8/12):** the timeline card with filter chips, then the screenshot gallery card. The gallery has 4 columns at `xl`, 3 at `lg`, 2 at `sm` and 1 below that.
    - **Right (4/12), sticky:** a risk card (score as `--text-stat` plus the breakdown), the AI suggestion card, the verdict card (verdict options and note, then Save), and a "Danger zone" card with Delete candidate data.
  - **Below `lg`:** one column in the order risk, AI, verdict, timeline, gallery, danger zone.
- **Account** (`/account`, new): a card with name, email and role ("Admin"), plus Sign out. It changes no data and needs no backend change.

### Extension popup (360 px)

- **Shell:** `--color-bg` background, the popup header, and the cards area; at most one primary action is visible at a time.
- **Screens, in order:**
  1. **Role chooser:** two option cards.
  2. **Student sign in / create account:** a card with the fields, then one primary button.
  3. **Join:** a card titled "Enter your exam code" with the 6-cell code input and **Join exam**.
  4. **Session card**, collapsed:
     - a pill ("Open now", or "In 15 min" counting down);
     - a calendar icon button;
     - the exam name;
     - "1:30 PM → 2:30 PM".

     Expanded, it adds:
     - the exam platform;
     - "Tell us about the exam" text;
     - the examiner's name and email;
     - **Continue** (primary), which opens the consent popout;
     - **Use a different code** (secondary).

     It starts expanded the first time, so the next step is obvious.
  5. **Monitoring card**, collapsed:
     - a "Monitoring" pill with a green dot;
     - the elapsed time `00:12:04` (mono);
     - "Warnings 1 of 3".

     Expanded, it adds:
     - last heartbeat, uploads waiting, and screen sharing status;
     - **Go to my exam** (secondary);
     - **End exam** (danger, with a confirm dialog).

     If screen sharing stopped, a high-risk alert card sits above it with **Share screen again**.
  6. **Ended card:** "Exam ended" and **Join another exam**.
- **Admin signed in the extension:** a card saying "This is an admin account. Use the dashboard." with **Open dashboard**.

### Welcome page (opened once after install)

- **Opens:** on `chrome.runtime.onInstalled` with reason `install`.
- **Title:** "Welcome to ICU", in display italic.
- **Three step cards:**
  1. **Pin ICU:** an illustration of the puzzle-piece menu; turns to ✓ automatically when `chrome.action.getUserSettings()` reports `isOnToolbar`.
  2. **Mac only, allow screen recording:** System Settings → Privacy & Security → Screen Recording → Google Chrome, then restart Chrome. Hidden on other systems.
  3. **Sign in:** "Click the ICU icon and choose I'm a student."
- **Footer:** "You can close this tab."

### Consent popout window (replaces the notice tab)

- **Opens:** **Continue** opens it, centred over the current window, at 480 × 640.
- **Layout:** like the reference dialog.
  - **Header:** "Privacy & terms" plus ✕.
  - **Body:** scrollable, with headings for each part of the RA 10173 notice: What we collect · Sharing your screen · Why · Who can see it · How long we keep it · Your rights. The exam name, platform and examiner are at the top.
  - **Sticky footer:** "I am 18 or older", "I have read this notice and agree…", then Cancel / **I agree & share screen**.
- **Agree gate:** the agree button stays disabled until both boxes are ticked **and** the body has been scrolled to the end. A muted hint reads "Scroll to the end to continue". This keeps the rule that the student sees the whole notice (R7).
- **Sharing:**
  1. Clicking **I agree & share screen** opens Chrome's picker, entire screen only (the user gesture is required).
  2. On success, the window switches to the compact **monitoring** view: "ICU monitoring · keep this window open", a status line, and **Go to my exam**.
  3. It stays open. Once the exam window goes fullscreen, it's behind the exam and out of view. It doesn't minimize; see Feasibility.
- **Closing:** closing it stops sharing and is recorded (`screen_share_stopped`, a warning). **Share screen again** reopens the same window in re-share mode.
- **Feasibility (prototype, 2026-11-15, headed Chromium on macOS, RESEARCH F32):**
  - **Works:**
    - from a `type: 'popup'` window: Chrome's entire-screen picker, `getUserMedia`, and Start;
    - live whole-screen frames at +2 s, +15 s and +70 s, with the picture content changing.
  - **Doesn't work:** `chrome.windows.update(…, { state: 'minimized' })` on the popup window. Chrome returns `normal` and the window stays open, retried after 0 s, 3 s and 6 s while the exam window was fullscreen.
  - **Decision (user):** keep the popout window. After Start it stays open as "ICU monitoring" behind the fullscreen exam, with no pinned tab, and closing it is still recorded. The fallback (the same dialog on the ICU tab) isn't needed.
  - **Build notes:**
    - Focusing the monitoring window must not count as leaving the exam: exempt its window ID the way the popup port is exempted.
    - Pin the page only when it's in a normal window.
    - In Playwright, the window type can be checked but its 480 px width can't, because Playwright resizes the pages it controls.

### Banner

- **Position:** a floating card fixed to the top centre of the viewport. It sits over the page and doesn't push content down, so the exam layout doesn't shift.
- **Size:** at most 560 px wide and 72 px high; on screens narrower than 480 px it's full width minus 16 px, with text wrapping to at most 3 lines.

## Accessibility

The target is **WCAG 2.2 AA** (R28).

- **Keyboard:** every action can be reached with Tab, Shift+Tab, Enter and Space. There are no keyboard traps except inside dialogs and the consent popout, which Esc closes. The role chooser and segmented controls use arrow keys like a radio group. Expandable cards are buttons with `aria-expanded` and `aria-controls`. `/` focuses dashboard search only when focus isn't already in a text field.
- **Focus:** always visible (`:focus-visible` ring, `--color-primary`, ≥ 3:1 against its background), and never hidden by the sticky sidebar or top bar (2.4.11 Focus Not Obscured).
- **Landmarks:** the dashboard has `nav` (sidebar, labelled "Main"), `header` (top bar) and `main`. Breadcrumbs are a `nav` labelled "Breadcrumb", with `aria-current="page"` on the last item.
- **Banner announcements:** the banner container has `role="alert"`, so screen readers announce warnings without the banner taking focus. Dismiss is a real `<button>`. Auto-hide pauses while the pointer or keyboard focus is on the banner (2.2.1).
- **Not colour alone:** risk, verdict, gap and status always pair colour with text and icon shape (1.4.1). Sparklines are decorative (`aria-hidden`); the stat value and change pill carry the meaning in text.
- **Contrast:** every token pair is listed with its ratio in the Colour table (1.4.3, 1.4.11). `--color-accent` is never used for text.
- **Target size:** at least 24 × 24 px for every control (2.5.8).
- **Forms:** visible labels, errors in text linked with `aria-describedby`, no reliance on placeholders, and `autocomplete` on email and password (1.3.5, 3.3.1, 3.3.2). Re-entering data isn't required (3.3.7). The code input's cells are presentational; one real input carries the value and label.
- **Accessible authentication:** password fields allow paste and password managers (3.3.8).
- **Tables:** real `<table>` markup with `<th scope>`, and sortable headers announce their state with `aria-sort`.
- **Images:** screenshot `alt` text is "Screenshot at 10:14:05, <reason>". Decorative icons are `aria-hidden`.
- **Timeline:** a semantic `<ol>`. Gap rows include the full time range in text.
- **Reduced motion:** honoured (see Motion), including the expandable cards.
- **Zoom:** usable at 200% zoom and at a 320 px viewport width on the dashboard (1.4.10). The popup is fixed-width by Chrome, so its content wraps instead of overflowing. The consent popout's body reflows and its footer stays reachable.
- **Assistive tech and monitoring:** using a screen reader or other assistive tool may trigger focus or paste events. The privacy notice tells students to tell the examiner beforehand, and the review UI never auto-labels anyone as cheating ([RESEARCH F22](RESEARCH.md#findings), PRD R17, R22).
- **Checks:** axe automated scans in E2E tests ([QAD.md](QAD.md)) must stay at 0 violations for every screen, new ones included (Overview, Needs review, Account, welcome page, consent popout). There's also a manual keyboard-only pass and a screen-reader pass (VoiceOver).

## Content and voice

- **Tone:** plain, neutral, short. Second person to the student ("You left the exam tab"), neutral third person to the admin ("Left the exam tab · 42 s").
- **Terms** (use exactly these):
  - **Exam session:** what the admin creates.
  - **Session code:** the 6-character join code.
  - **Attempt:** one student's run in a session. Shown as "candidate" in admin UI.
  - **Monitoring:** active collection.
  - **Monitoring lost:** a heartbeat gap. Never say "cheated" or "offline" for this.
  - **Flag** and **review:** what admins do. Never "caught" or "violation proven". The product name "I Caught You" is the brand only, never used in UI copy about a person.
  - **Needs review:** an ended candidate without a verdict.
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
  | `exam_page_changed` | — | Viewed another page on the exam platform: `netacad.com/…` |
  | `copy` / `cut` / `paste` | (paste only) You pasted on the exam page. | Copied / Cut / Pasted on exam page |
  | `context_menu` | — | Right-clicked on exam page |
  | `fullscreen_enter` / `fullscreen_exit` | (exit only) You left fullscreen. | Entered / Left fullscreen |
  | `screen_share_started` / `screen_share_stopped` | (stop only) You stopped sharing your screen. Open ICU and choose Share screen again. | Started / Stopped sharing the whole screen |
  | `exam_page_not_detected` | — | Exam page not detected within 2 min of start |
  | `warning_shown` | — | Warning 2 of 3 shown |
  | `warning_limit_reached` | You've reached the warning limit. Your examiner will review this session. | Warning limit reached (forces High) |
  | `screenshot_failed` | — | Screenshot failed: <reason> |
  | `extension_uninstalled` | — | Extension uninstalled (best effort) |
  | `queue_overflow` | — | Upload queue overflowed · n events, n screenshots dropped |
  | gap | — | Monitoring lost · start – end · duration |

- **Times:** dashboard times are `HH:mm:ss` in Asia/Manila, with the full date in section headers and tooltips. Durations: under 1 min, "42 s"; under 1 h, "7 min 35 s"; otherwise "1 h 4 min". The popup shows times as "1:30 PM → 2:30 PM".
- **Errors:** say what happened and what to do next: "Code not found. Check the code with your examiner." "Couldn't save. Check your connection and try again."
- **Privacy notice:** written at about a grade-8 reading level, with headings: What we collect · Sharing your screen · Why · Who can see it · How long we keep it · Your rights. It gives the notice version and date (R7). Moving it into the popout doesn't change its wording; any wording change bumps `NOTICE_VERSION`.
- **Capitalisation:** sentence case for all UI text, except the uppercase mono sidebar section labels. Event-type identifiers appear only in code.

## What this changes outside the visuals

The design above needs these changes. Each is small, and none needs a backend change except where noted. They're listed so the build can be planned and reviewed:

1. **New routes:** `/overview` (the landing page after sign-in), `/review` and `/account`. Existing routes stay.
2. **Consent popout:**
   - `notice.html` opens in a `type: 'popup'` window instead of a tab and stays open after Start (behind the fullscreen exam).
   - Recovery and "Share screen again" target that window.
   - The extension already holds the stream in this page, so the logic is unchanged; only the container changes.
   - Prototype it first (see Feasibility).
3. **Welcome page:** a new extension page, plus an `onInstalled` listener.
4. **Fonts and icons:** bundled `woff2` (OFL) and Lucide (ISC). Add them to the licence note in the README.
5. **E2E tests:**
   - Selectors that change (the notice page becomes a window; new nav and buttons) must be updated in the same change.
   - The axe scans must add the new screens.
   - The existing names "Share screen and start", "ICU monitoring", "Go to my exam", "Exam info" and "Tell us about the exam" should be kept where the design still has those elements. "Share screen and start" becomes "I agree & share screen", so update `e2e/fixtures.ts` `shareScreenAndStart` with it.
6. **Overview and Needs review data:** built from existing calls. A combined summary RPC is optional and later, and it would be a backend change.
