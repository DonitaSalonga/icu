<p align="center">
  <img src="docs/assets/icu-logo.png" alt="ICU logo" width="360">
</p>

<h1 align="center">ICU: I Caught You</h1>

<p align="center"><b>It catches the tab switch. A person makes the call.</b><br>
Fair, privacy-aware monitoring for online certification exams.</p>

<p align="center">
  <a href="https://icu-dashboard-ten.vercel.app"><b>Open the dashboard</b></a> ·
  <a href="https://icu-dashboard-ten.vercel.app/downloads/ICU-extension.zip"><b>Download the extension (zip)</b></a>
</p>

## Overview

**ICU** stands for **"I Caught You"**. It's a university project for exams taken online on someone else's website, such as Google Forms, Cisco NetAcad or Coursera, where the examiner can't see what students do in their browser.

ICU has two parts:

- A **Chrome extension** that students turn on before the exam.
- An **admin dashboard** where the examiner reviews the evidence afterwards.

ICU warns students and flags what it sees, but it never ends an exam or decides that someone cheated. A person always makes the final call.

## What it does

- **Watches the exam tab:** records when the student leaves the exam tab, opens other sites, copies or pastes, or leaves fullscreen.
- **Takes screenshots:** of the shared screen on every tab switch and at intervals, so the examiner sees what was on screen.
- **Warns the student at once:** each rule break shows a warning, up to the warning limit the examiner set.
- **Notices tampering:** if the extension is turned off or the exam tab closes, the silence shows up as "monitoring lost".
- **Scores the risk:** every candidate gets a Low, Medium or High risk level with a points breakdown.
- **Gives an AI suggestion:** when the exam ends, an AI reads the activity timeline and suggests a result with a confidence level.
- **Supports the verdict:** the examiner sees the findings, the timeline and the screenshots, then records Cleared, Suspicious or Cheating confirmed.

## Why use ICU

- **Works with the exam site you already use.** There's no exam to rebuild; ICU watches whichever site the examiner names.
- **No webcam.** It records browser activity and the shared screen only, which is less intrusive than camera proctoring.
- **Evidence, not accusations.** Risk scores and AI suggestions only help; the examiner decides.
- **Privacy built in.** Students read and accept a notice based on the Philippine Data Privacy Act (RA 10173) first. Data is deleted after 30 days, or earlier by the examiner, and each examiner sees only their own sessions.
- **Free to run.** It fits on the free tiers of Supabase and Vercel.

## How it works

1. The **examiner** creates an exam session on the dashboard and gives students its 6-character code.
2. The **student** enters the code in the extension, agrees to the privacy notice and shares their entire screen. ICU switches to the exam tab and makes it fullscreen.
3. During the exam, the **extension** sends events and screenshots to **Supabase**.
4. When the exam ends, Supabase asks the **AI** (TypeSafe Jev) for a suggestion and saves it.
5. The **examiner** opens the candidate on the dashboard, reviews the evidence and saves a verdict.

### Architecture

<p align="center">
  <img src="docs/assets/architecture.png" alt="ICU architecture: the student's extension sends events and screenshots to Supabase; the admin dashboard on Vercel reads risk, timeline and screenshots from Supabase; when an exam ends, a Supabase function asks TypeSafe Jev for an AI suggestion" width="900">
</p>

## Tech stack

| Part | Built with |
| --- | --- |
| Chrome extension | Manifest V3, [WXT](https://wxt.dev) 0.21, React 18, TypeScript 5.9, input-otp |
| Admin dashboard | React 18, Vite 8, React Router 7, Base UI, Sonner; hosted on [Vercel](https://vercel.com) |
| Backend | [Supabase](https://supabase.com): Auth, Postgres with row-level security, Storage, Edge Functions (Deno), pg_cron and pg_net |
| AI suggestion | TypeSafe Jev, called from the `ai-analyze` Edge Function (the key stays on the server) |
| Shared logic | `packages/core`: event catalogue, URL matching, monitoring gaps, risk scoring, warnings |
| Design | ICU design system (`packages/ui-tokens/icu.css`), Satoshi font, hand-drawn SVG icons |
| Testing | Vitest (unit and integration), Playwright (browser tests with the real extension), axe-core (accessibility) |

## Links and download

| | |
| --- | --- |
| **Admin dashboard (live)** | https://icu-dashboard-ten.vercel.app |
| **Extension download** | [ICU-extension.zip](https://icu-dashboard-ten.vercel.app/downloads/ICU-extension.zip) (also in this repo at `dashboard/public/downloads/ICU-extension.zip`) |

## Getting started

### For examiners

1. Open the [dashboard](https://icu-dashboard-ten.vercel.app) and choose **I'm an admin**.
2. Choose **Create an admin account**, enter your name, email and password, and sign in.
3. Go to **Sessions → Create session**. Fill in the name, the exam platform (a name like `netacad` or a site like `docs.google.com/forms`), a short note about the exam, the date and time, and the warning limit.
4. Give your students the session's 6-character **code**.
5. After the exam, open **Needs review**. Pick a candidate, check the findings, timeline, screenshots and AI suggestion, then choose a verdict and **Save verdict**.

### For students

1. [Download the ICU extension](https://icu-dashboard-ten.vercel.app/downloads/ICU-extension.zip) and unzip it.
2. In Chrome, open `chrome://extensions`, turn on **Developer mode** (top right), click **Load unpacked** and choose the unzipped folder.
3. Pin ICU to the toolbar, click its icon, choose **I'm a student**, and sign up or sign in.
4. Open your exam page. In ICU, enter the code from your examiner, click **Find exam**, then **Continue**.
5. Read the privacy notice, click **I agree & share screen**, and choose your **entire screen**. On a Mac, the first time, allow Chrome under System Settings → Privacy & Security → Screen Recording.
6. Take your exam. When you finish, click **End exam** in ICU.

## For developers

### Repository layout

```text
extension/          Chrome MV3 extension (WXT + React + TypeScript)
dashboard/          Admin dashboard (Vite + React); public/downloads holds the extension zip
packages/core/      Shared rules: event catalogue, URL matching, gaps, risk scoring, warnings, coalescing
packages/ui-tokens/ Design system: icu.css, icons, logo, student avatars, Satoshi font
supabase/           migrations/, functions/ (Edge Functions), tests/ (integration), scripts/ (seed/reset)
e2e/                Playwright tests that load the extension, plus a fixture exam site
docs/               Plans, requirements, design, tests, build log; assets/ holds the README images
scripts/            check-secrets.mjs (T44)
vercel.json         Vercel build settings for the dashboard
```

### Set up the backend (Supabase)

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

### Run it locally

- **Dashboard:** `npm run dev:dashboard`, then open http://localhost:5173. Choose "I'm an admin" and create an account.
- **Extension:** `npm run build -w extension`. In Chrome open `chrome://extensions`, turn on **Developer mode**, choose **Load unpacked**, and select `extension/.output/chrome-mv3`. Click the extension icon, choose "I'm a student", and sign up. For live reload while developing, use `npm run dev:extension`.
- To point the extension at a deployed dashboard, set `WXT_DASHBOARD_URL` in `.env` before building.
- **Make the download zip:** `cd extension && WXT_DASHBOARD_URL=https://icu-dashboard-ten.vercel.app npx wxt zip`, then copy `extension/.output/icuextension-0.1.0-chrome.zip` to `dashboard/public/downloads/ICU-extension.zip`.

### Deploy the dashboard to Vercel

The project `icu-dashboard` is already set up. To deploy your own copy:

1. Install the Vercel CLI and sign in: `npm i -g vercel`, then `vercel login`.
2. Link the project: run `vercel link` from the repository root. `vercel.json` already sets the build (`npm run build -w dashboard`, output `dashboard/dist`) and the single-page-app routing.
3. Add the two public settings for your main Supabase project: `vercel env add VITE_SUPABASE_URL production` and `vercel env add VITE_SUPABASE_PUBLISHABLE_KEY production`.
4. Deploy: `vercel deploy --prod`. Deploy from a clean copy of the committed code (for example `git archive HEAD`), so local `.env` files are never uploaded.

### Test

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
3. **Admin laptop:** open the dashboard (live link above, or run it locally), sign in, create a session with exam platform `docs.google.com/forms` (or `netacad`, etc.), and note the code.
4. **Student laptop:** install the extension from the zip, sign in as a student, open the Form, then (on the Form tab) join with the code, click Continue, read the notice, and click **I agree & share screen** (choose your entire screen). ICU switches back to the Form and the window goes fullscreen.
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

## Project documents

| | |
| --- | --- |
| Why and what | [docs/IDEA.md](docs/IDEA.md) · research: [docs/RESEARCH.md](docs/RESEARCH.md) |
| Requirements (R1–R35) | [docs/PRD.md](docs/PRD.md) |
| Design | [docs/SDD.md](docs/SDD.md) (system) · [docs/DSD.md](docs/DSD.md) (UI) |
| Tests (T1–T65) | [docs/QAD.md](docs/QAD.md) |
| Milestones and status | [docs/BUILD.md](docs/BUILD.md) |
| Handoff for UI/UX work | [docs/UI-HANDOFF.md](docs/UI-HANDOFF.md) · backend connection: [docs/BACKEND-HANDOFF.md](docs/BACKEND-HANDOFF.md) |

## Licences

All production dependencies are MIT or 0BSD (checked 2026-11-14; sonner, @base-ui/react and input-otp added 2026-11-15, all MIT). The icons are hand-drawn in `packages/ui-tokens/icons.tsx`, and the logo and student avatars were supplied by the project owner.

**Satoshi** (`packages/ui-tokens/fonts`) is under the ITF Free Font License (`fonts/LICENSE-Satoshi-FFL.txt`). It may be embedded in this app and extension, but the font files must not be redistributed on their own, so keep this repository private (or remove the Satoshi files and fetch them from fontshare.com) if you publish it.
