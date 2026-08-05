# Fourteen

Fourteen is a consent-first anonymous crush web app for 18+ University of Michigan students. This repository contains a polished mobile web experience, a persistent manual-launch backend, a private founder contact queue, and the production Supabase schema foundation.

## What works now

- `@umich.edu` signup and a six-digit local OTP with expiry and attempt limits
- neutral date-of-birth check that stores only an over-18 boolean
- profile, private phone consent, generated member number, and circle onboarding
- prefix-only, rate-limited directory search with no browsable directory
- one crush per ISO week, fixed message library, frozen 14-day true-hint ladder, suppressed blocked path, and sender/recipient-safe page shapes
- one neutral guess per day, consented reveals, reciprocal mutual detection, and a screenshot-shaped reveal screen
- six-card daily compliment polls with anonymous picker identity and delayed notification records
- persistent SQLite data under `.data/` for a local manual launch
- founder-only `/admin` console with signup log, recipient phone, sender audit reference, message/deep-link copy, status controls, CSV export, and audit records
- a provider boundary that can replace `manual` with `ai_phone` without exposing sender identity to the provider
- private safety reports in the founder console, privacy/terms/safety pages, PWA manifest/service worker, local seed users, Zod validation, and unit tests

Push/email dispatch, full block management, scheduled expiry, and hosted Supabase integration remain later infrastructure milestones. The UI never fabricates activity while those delivery systems are offline.

## Run locally

Requirements: Node 22+ and pnpm.

```bash
cp .env.example .env.local
pnpm install
pnpm dev
```

Open `http://localhost:3000`. In local development, the default OTP is `140014` and the default founder key is `founder-demo`. Change both in `.env.local` before sharing the app with anyone.

The first account can choose the clearly labeled demo profiles for its circle. To test the real manual queue, create two non-demo accounts in separate browser profiles, complete onboarding for both, then send a crush from one to the other. Demo recipients intentionally never enter the contact queue.

Founder operations: `http://localhost:3000/admin`

## Sensitive data

- `.data/fourteen.sqlite` contains local PII and is gitignored. Do not sync or email it.
- `.env.local` contains secrets and is gitignored.
- The admin CSV contains phone numbers and a crush relationship audit mapping. Export only when operationally necessary and delete it securely after use.
- The original brief prohibited phone collection and individual admin crush browsing. The manual workflow is a documented founder-requested override. See `docs/DATA-SECURITY-REGISTER.md` before changing legal copy or adding automation.

## Production access needed

Do not paste secrets into chat. Put these directly in the deployment environment when ready:

1. Supabase project URL, anon key, and service-role key
2. Vercel project/environment access
3. Resend API key plus a verified sending domain
4. VAPID public/private keys for Web Push
5. Final admin email addresses and a real support/privacy email
6. A decision on whether manual essential texts are sent from a dedicated business number and how STOP requests are handled

Apply `supabase/migrations/001_foundation.sql`, then `supabase/seed.sql`. Before public use, replace the local adapter with Supabase Auth/Postgres and complete the controls listed in the data-security register.

## Checks

```bash
pnpm lint
pnpm test
pnpm build
```

The app stays on the patched Next.js 15.5 release line to match the fixed-stack brief.
