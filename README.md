# Fourteen

**A SwiftUI prototype for anonymous crushes with a fourteen-day clue trail.**

Designed for adults, Fourteen lets someone send one anonymous crush each week. The recipient unlocks clues over fourteen days; the experience ends in a mutual match, a sender-approved reveal, or quiet expiry.

**Stack:** Swift · SwiftUI · Supabase · PostgreSQL · SQL RPCs · Deno · APNs

[Product flow](#product-flow) · [Explore the code](#explore-the-code) · [Local setup](#local-setup) · [Engineering notes](docs/engineering-notes.md)

## Product flow

1. **Send:** choose a person and a message from a fixed library.
2. **Discover:** unlock one clue on each day the app is opened, without accumulating missed days.
3. **Guess:** submit one guess per crush per day. A correct guess asks the sender whether to reveal.
4. **Resolve:** reveal through a mutual match or sender consent, or let the crush expire quietly.

The interface uses a postal theme: parcels, postmarks, a countdown, and a reveal signed by the sender. Reusable SwiftUI components share a central color and typography system.

## Engineering focus

- **Server-owned decisions:** SQL functions define sending limits, clue unlocks, matching, blocking, and reveal transitions.
- **Restricted read surfaces:** dedicated views are designed to withhold sender identities and locked clue text until the appropriate state.
- **A small client data layer:** SwiftUI views use a central store backed by an actor-based HTTP client; session tokens use Keychain.
- **Queued notifications:** a database outbox and Deno function separate product events from APNs delivery.
- **Consent in the interaction design:** guessing does not automatically reveal a sender, and declining a reveal is an explicit option.

These are implementation goals represented in the source. The backend has not yet been validated against a running Supabase project.

## Project status

**iOS prototype with backend integration pending.** The original validation notes record a successful simulator build and an interactive onboarding check. SQL migrations, the security test suite, APNs delivery, and the complete signed-in flow have not been exercised.

The project also has unfinished universal links, reporting operations, legal-page destinations, and app artwork. See the [engineering notes](docs/engineering-notes.md) for the full validation history and known gaps.

## Explore the code

| Area | Source |
| --- | --- |
| Onboarding and account flow | [`Sources/Features/Onboarding/Onboarding.swift`](Sources/Features/Onboarding/Onboarding.swift) |
| Clue trail, guessing, and sending | [`Sources/Features/Main`](Sources/Features/Main) |
| UI tokens and reusable components | [`Sources/Design`](Sources/Design) |
| State, API requests, and session storage | [`Sources/Data`](Sources/Data) |
| Database schema and product RPCs | [`supabase/migrations`](supabase/migrations) |
| Notification delivery function | [`supabase/functions/push-dispatch/index.ts`](supabase/functions/push-dispatch/index.ts) |
| Backend security assertions | [`supabase/tests/security_test.sql`](supabase/tests/security_test.sql) |

## Local setup

Requires **macOS and Xcode** with an iOS SDK. The app targets **iOS 16+**. A Supabase project, the Supabase CLI, and PostgreSQL's `psql` client are needed to configure and check the backend.

```sh
git clone https://github.com/rexziywbang/fourteen-app.git
cd fourteen-app
cp Sources/Supabase.example.plist Sources/Supabase.plist
open Fourteen.xcodeproj
```

Fill the ignored `Sources/Supabase.plist` with your project's URL and **anon key**, select the appropriate signing team if needed, and choose an iPhone simulator. The service-role key belongs on the server and must not be included in the app.

For a separate development Supabase project, apply the migrations and seed data from the repository root:

```sh
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/security_test.sql
```

Set `DATABASE_URL` to that development project's database connection string first. These steps are provided for backend validation and have not yet been verified end to end. Push delivery additionally requires APNs credentials and deployment of the dispatch function.
