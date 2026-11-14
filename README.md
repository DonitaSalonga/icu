# Online Certification Monitoring

A university project. A Chrome extension records what a student does in their browser during an online exam on a third-party site (tab switches, pasting, other sites visited). An admin dashboard shows that evidence for **human review**; the tool never decides that someone cheated.

- What and why: [docs/IDEA.md](docs/IDEA.md) · Requirements: [docs/PRD.md](docs/PRD.md) · Design: [docs/SDD.md](docs/SDD.md), [docs/DSD.md](docs/DSD.md) · Tests: [docs/QAD.md](docs/QAD.md) · Plan: [docs/BUILD.md](docs/BUILD.md)
- Status: **milestone M1 (walking skeleton) in progress.** The full README arrives in M6 (R31).

## Layout

```text
extension/         Chrome MV3 extension (WXT + React + TypeScript)
dashboard/         Admin dashboard (Vite + React + Tailwind)
packages/core/     Shared rules: event catalogue, URL matching, gap detection, session codes
packages/ui-tokens Design tokens (CSS variables + Tailwind preset)
supabase/          Migrations, integration tests, seed/reset scripts
```

## Setup (M1)

Prerequisites: Node 20 or later (developed on Node 26) and a Supabase account. Supabase Cloud's free tier only; there's no Docker or local Supabase.

1. `npm install`
2. Create two Supabase projects: `ocm-main` (development and demo) and `ocm-test` (automated tests).
3. Copy `.env.example` to `.env` and fill it in from `ocm-main` → Project Settings → API. Use only the **publishable (anon)** key.
4. Copy `.env.test.example` to `.env.test` and fill it in from `ocm-test`. This file holds the test project's **secret** key; it's gitignored and used only by the test runner.
5. Apply the schema to each project:
   ```sh
   npx supabase login
   npx supabase link --project-ref <ocm-test-ref> && npm run db:push
   npx supabase link --project-ref <ocm-main-ref> && npm run db:push
   ```
6. For a quick demo, in `ocm-main` → Authentication → Sign In / Providers → Email, you can turn off **Confirm email**. Otherwise new users must click the email link before signing in.

## Run

- Dashboard: `npm run dev:dashboard`, then open http://localhost:5173
- Extension: `npm run build -w extension`, then in Chrome go to `chrome://extensions`, turn on Developer mode, choose **Load unpacked**, and pick `extension/.output/chrome-mv3`. For live reload use `npm run dev:extension`.

## Test

- `npm test`: unit tests for `packages/core` (no network)
- `npm run seed:test`, then `npm run test:integration`: RLS and RPC tests against `ocm-test` (skipped while `.env.test` is missing)
- `npm run typecheck`

## Known limitations

See [docs/IDEA.md § Known limitations](docs/IDEA.md#known-limitations). The extension can't see phones, other devices or other browsers. Tampering is detected (as monitoring gaps), not prevented.
