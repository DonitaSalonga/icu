# ICU: I Caught You

**ICU** ("I Caught You") is a university project. A Chrome extension records what a student does in their browser during an online exam on a third-party site such as Google Forms or Coursera. It records tab switches, other sites visited, copy and paste, leaving fullscreen, screenshots, and gaps in monitoring. An admin dashboard shows that evidence for **human review**. The tool warns and flags; it never ends an exam or decides that someone cheated.

| | |
| --- | --- |
| Why and what | [docs/IDEA.md](docs/IDEA.md) · research: [docs/RESEARCH.md](docs/RESEARCH.md) |
| Requirements (R1–R35) | [docs/PRD.md](docs/PRD.md) |
| Design | [docs/SDD.md](docs/SDD.md) (system) · [docs/DSD.md](docs/DSD.md) (UI) |
| Tests (T1–T65) | [docs/QAD.md](docs/QAD.md) |
| Milestones and status | [docs/BUILD.md](docs/BUILD.md) |

## How it works

```text
Student's Chrome                         Supabase Cloud (free tier)                 Admin's browser
┌───────────────────────────┐   HTTPS   ┌──────────────────────────────┐   HTTPS   ┌───────────────────┐
│ Extension (MV3)            │ ────────▶ │ Auth · Postgres + RLS        │ ◀──────── │ Dashboard (React) │
│  service worker: events,   │           │ Storage (private screenshots)│           │  sessions, risk,  │
│  screenshots, heartbeat    │           │ Edge Functions: uninstall    │           │  timeline,        │
│  content script: clipboard,│           │  beacon, 30-day retention    │           │  verdicts         │
│  warning banner            │           │ pg_cron: daily cleanup       │           └───────────────────┘
└───────────────────────────┘           └──────────────────────────────┘
```

- The admin creates an **exam session** (name, the **exam platform** typed as a name like `netacad` or a website like `docs.google.com/forms`, date and time, warning limit, and an optional **Tell us about the exam** note) and gives students its 6-character **code**. Clicking a session shows its exam info.
- The student signs in to the extension, enters the code, reads and accepts the privacy notice (Philippine Data Privacy Act, RA 10173), and clicks **Share screen and start**: Chrome asks to share the **entire screen**, which is required. ICU then switches to the exam tab (the page the student was on when they clicked Continue) and makes the window fullscreen; if the exam page isn't open yet, that happens when it opens. The sharing page stays open, pinned, as "ICU monitoring". On a Mac, allow Chrome under System Settings → Privacy & Security → Screen Recording the first time. Monitoring runs only on matching exam pages and only until End or the session's end time.
- Events and screenshots upload to Supabase. A heartbeat every 15 s means that silence of more than 60 s shows up as **monitoring lost**, for example when the extension is disabled or the exam tab is closed.
- When the exam ends, an **AI suggestion** is generated automatically. An anonymous activity timeline goes to an analysis model (TypeSafe Jev) as one question, and the admin sees the suggested result (for example "Likely cheating: used AI or the web · 82%") with confidence.
- The admin sees each candidate's risk level (Low/Medium/High), the AI suggestion, a timeline with screenshots, and records the verdict. The suggestion never decides. Data is deleted automatically after 30 days, or earlier by the admin.

## Repository layout

```text
extension/          Chrome MV3 extension (WXT + React + TypeScript)
dashboard/          Admin dashboard (Vite + React + Tailwind)
packages/core/      Shared rules: event catalogue, URL matching, gaps, risk scoring, warnings, coalescing
packages/ui-tokens/ Design tokens (CSS variables + Tailwind preset)
supabase/           migrations/, functions/ (Edge Functions), tests/ (integration), scripts/ (seed/reset)
e2e/                Playwright tests that load the extension, plus a fixture exam site
scripts/            check-secrets.mjs (T44)
```

## Setup

**Prerequisites:** Node 20 or later (developed on Node 26), Chrome 120 or later, and a Supabase account (free tier). There's no Docker or local Supabase; everything runs against Supabase Cloud.

1. **Install:** `npm install`
2. **Sign in to the Supabase CLI** in a normal terminal (it opens a browser): `npx supabase login`
3. **Create two projects** (or use the dashboard): `icu-main` for development and the demo, and `icu-test` for automated tests.
   ```sh
   npx supabase orgs list
   npx supabase projects create icu-main --org-id <org-id> --region ap-southeast-1 --db-password '<strong password>'
   npx supabase projects create icu-test --org-id <org-id> --region ap-southeast-1 --db-password '<another password>'
   ```
4. **Environment files** (all gitignored):
   - `.env` comes from `.env.example`, filled in from **icu-main**: the URL and the **publishable** key only (`npx supabase projects api-keys --project-ref <ref>`).
   - `.env.test` comes from `.env.test.example`, filled in from **icu-test**. It includes the **secret** key (`… api-keys --reveal`), which only the test runner uses.
   - `.env.db.main` and `.env.db.test` each hold `SUPABASE_DB_PASSWORD=` and `ICU_CRON_SECRET=` for that project.
5. **Database, functions and schedule**, for each project:
   ```sh
   npx supabase link --project-ref <ref>
   npx supabase db push --remote -p '<db password>'
   # Vault secrets read by the daily retention job (never commit these values):
   npx supabase db query --remote "select vault.create_secret('https://<ref>.supabase.co', 'icu_project_url'); select vault.create_secret('<cron secret>', 'icu_cron_secret');"
   npx supabase secrets set --project-ref <ref> ICU_CRON_SECRET='<cron secret>'
   npx supabase functions deploy uninstall-beacon --project-ref <ref> --no-verify-jwt --use-api
   npx supabase functions deploy retention-cleanup --project-ref <ref> --no-verify-jwt --use-api
   npx supabase functions deploy ai-analyze --project-ref <ref> --no-verify-jwt --use-api
   # AI suggestion: the model key lives only in the function secret.
   npx supabase secrets set --project-ref <ref> TYPESAFE_API_KEY='<key>'
   ```
   For a project used only for automated tests, turn automatic analysis off so test runs don't spend model credits: `npx supabase db query --remote "update public.app_settings set ai_auto = false"`.
6. **Optional, for a quick demo:** in icu-main → Authentication → Sign In / Providers → Email, turn off **Confirm email**. Otherwise new users must click the email link before they can sign in.

## Run

- **Dashboard:** `npm run dev:dashboard`, then open http://localhost:5173. Choose "I'm an admin" and create an account.
- **Extension:** `npm run build -w extension`. In Chrome open `chrome://extensions`, turn on **Developer mode**, choose **Load unpacked**, and select `extension/.output/chrome-mv3`. Click the extension icon, choose "I'm a student", and sign up. For live reload while developing, use `npm run dev:extension`.
- To use a deployed dashboard, set `WXT_DASHBOARD_URL` in `.env` before building the extension.

## Test

| Command | What | Needs |
| --- | --- | --- |
| `npm test` | Unit tests for `packages/core` (T1–T9) | nothing |
| `npm run seed:test` then `npm run test:integration` | Access rules, RPCs, Storage, Edge Functions on icu-test (T10–T24) | `.env.test`, `.env.db.test` |
| `npx playwright install chromium` then `npm run test:e2e` | Browser tests with the real extension and dashboard against icu-test (T25–T41) | as above |
| `ICU_E2E_SLOW=1 npx playwright test e2e/m6-storage-proxy.spec.ts` | 5-minute real-page run: screenshot sizes and no false warnings (T43/T49 proxy) | as above, plus internet |
| `npm run build` then `npm run check:secrets` | No secret keys in built bundles (T44) | a build |
| `npm run typecheck` | TypeScript across the workspaces | nothing |

One E2E test (the window-focus part of T28) runs headed, so a Chromium window appears briefly. Manual checks (T43, T45–T49) are listed in [docs/QAD.md](docs/QAD.md).

## Demo checklist

1. **The day before:** open both Supabase projects in the dashboard and **resume** them if paused. Free projects pause after 7 days of low activity.
2. Create a Google Form to act as the exam.
3. **Admin laptop:** run the dashboard, sign in, create a session with exam platform `docs.google.com/forms` (or `netacad`, etc.), and note the code.
4. **Student laptop:** load the extension, sign in as a student, open the Form, then (on the Form tab) join with the code, click Continue, read the notice, and click **Share screen and start** (choose your entire screen). ICU switches back to the Form and the window goes fullscreen.
5. **Act out the scenario:** switch to ChatGPT, paste into the Form, and leave fullscreen. Then disable the extension at `chrome://extensions` for about 70 s and turn it back on.
6. **Admin:** open the session; the candidate shows as **High**. Open the timeline to see each event, the screenshots and the red "Monitoring lost" bar, then set the verdict to "Cheating confirmed".

## Known limitations

- The extension can't see phones, other people, other devices, other browsers or incognito windows. There's no webcam, by design.
- Tampering is **detected** (as monitoring gaps), not prevented. A determined student controls their own machine, so the evidence supports a human decision and doesn't prove cheating.
- Screenshots show the whole screen the student shared. If the student stops sharing, it is recorded as a warning and screenshots fall back to the visible browser tab until they share again.
- Anyone can sign up as an admin, but an admin sees only the sessions they created.
- The extension uses permission on all websites (needed for screenshots), so it's meant to be loaded unpacked, not published to the Chrome Web Store.
- Supabase's "leaked password protection" isn't enabled. It may require a paid plan (not verified).

More detail is in [docs/IDEA.md § Known limitations](docs/IDEA.md#known-limitations).

## Licences

All production dependencies are MIT or 0BSD (checked 2026-11-14).
