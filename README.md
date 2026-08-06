# Fourteen

Fourteen is a consent-first anonymous crush web app for 18+ University of Michigan students. This repository contains the polished mobile web experience, a SQLite preview adapter, and the Supabase/Postgres production backend.

## What works now

- `@umich.edu` signup with random per-request OTPs, expiry, attempt limits, cooldown, and Resend delivery
- neutral date-of-birth check that stores only an over-18 boolean
- profile, generated member number, and circle onboarding
- prefix-only, rate-limited directory search with no browsable directory
- one crush per ISO week, fixed message library, frozen 14-day true-hint ladder, suppressed blocked path, and sender/recipient-safe page shapes
- one neutral guess per day, consented reveals, reciprocal mutual detection, and a screenshot-shaped reveal screen
- six-card daily compliment polls with seeded, least-recently-featured rotation and anonymous picker identity
- persistent SQLite data under `.data/` for local development
- aggregate-only `/admin` console with activation, retention, and safety signals
- block/unblock controls that silently suppress both people across crush, search, poll, directory, and compliment surfaces
- in-app notifications, contextual Web Push opt-in, and email fallback for critical events
- private safety reports, privacy/terms/safety pages, installable PWA icons, local seed users, Zod validation, and unit/browser/accessibility tests

Production defaults to Supabase and never opens the local SQLite file. The server reads through service-role-only safe views and writes through narrow RPCs; browser roles have no base-table access. The notification Edge Function drains an atomic Postgres outbox, sends Web Push, and uses Resend fallback only for `crush_received`, `mutual_reveal`, `identity_revealed`, and `consent_prompt` when no live push subscription exists. No server path sends SMS.

## Run locally

Requirements: Node 22+ and pnpm.

```bash
cp .env.example .env.local
pnpm install
pnpm dev
```

Open `http://localhost:3000`. In local development, each random OTP is printed only in the server terminal. The default development founder key is `founder-demo`; replace it in `.env.local` before sharing the app with anyone.

The first account can choose the clearly labeled demo profiles for its circle. To test the two-person flow, create two non-demo accounts in separate browser profiles, complete onboarding for both, then send a crush from one to the other.

Founder operations: `http://localhost:3000/admin`

## Sensitive data

- `.data/fourteen.sqlite` contains local account data and is gitignored. Do not sync or email it.
- `.env.local` contains secrets and is gitignored.
- The August 6 revision removed contact collection, the manual queue, and individual admin account/crush browsing. See `docs/DATA-SECURITY-REGISTER.md` before changing privacy-sensitive behavior.

## Production access needed

Do not paste secrets into chat. Put these directly in the deployment environment when ready:

1. Supabase project URL, anon key, and service-role key
2. Hosting project/environment access
3. Resend API key plus a verified sending domain
4. VAPID public/private keys and contact email for Web Push
5. A random notification Edge Function secret
6. Final admin email addresses and a real support/privacy email

Apply `supabase/migrations/001_foundation.sql`, then `supabase/seed.sql`. Deploy `supabase/functions/notifications` with JWT verification disabled; the function performs its own constant-time secret check. Add `notification_edge_url` and `notification_edge_secret` as Postgres settings for the cron invocation, and configure the Edge Function secrets shown in `.env.example`. Keep `DATA_BACKEND=supabase` in production.

The migration has not been applied to a live project from this repository. Run the Postgres security suite against a dedicated Supabase staging project before any real-user launch.

## Checks

```bash
pnpm lint
pnpm test
pnpm build
pnpm check:client-secrets
pnpm test:e2e
pnpm test:postgres # requires the dedicated staging variables in .env.example
```

The app stays on the patched Next.js 15.5 release line to match the fixed-stack brief.
