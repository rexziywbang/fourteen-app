# Fourteen — iOS

You send one person a week an anonymous crush. They get fourteen days of
**true** clues to work out who it was. Three endings: mutual, consented
reveal, or quiet expiry.

Design language is **Postmark** — parcel and tracking, not correspondence.
18+, two account types, iPhone only.

---

## Ship it

### 1. Database

```bash
supabase link --project-ref <ref>
supabase db push                       # runs migrations 0001–0003 in order
psql "$DATABASE_URL" -f supabase/seed.sql
```

Then in the dashboard: **Auth → Providers → Email**, turn *Confirm email* on
and *Enable email signup* on, and set the OTP template to send a 6-digit code
(not a magic link — the app expects a code). Point SMTP at Resend with a
verified sending domain, or university filters will eat the codes.

### 2. Push

```bash
supabase secrets set APNS_KEY_ID=… APNS_TEAM_ID=… APNS_BUNDLE_ID=app.fourteen.ios
supabase secrets set APNS_AUTH_KEY_P8="$(cat AuthKey_XXXX.p8)"
supabase functions deploy push-dispatch
```

Schedule it every minute (Dashboard → Edge Functions → Schedules, `* * * * *`).
The cron jobs for expiry, reminders and retention are already installed by
migration `0003`.

### 3. App

```bash
brew install xcodegen && xcodegen && open Fourteen.xcodeproj
```

Create `Sources/Supabase.plist` (gitignored — never commit it):

```xml
<key>SUPABASE_URL</key><string>https://xxxx.supabase.co</string>
<key>SUPABASE_ANON_KEY</key><string>eyJ…</string>
```

Enable the **Push Notifications** capability on the target. Deployment target
is iOS 16.

### 4. Verify before anyone real touches it

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/security_test.sql
```

Sixteen assertions, each one a promise the product makes in plain English. A
failure means the app is lying to somebody. Run this in CI.

---

## Architecture

```
Sources/
  FourteenApp.swift        app entry, push wiring
  Root/RootView.swift      routing, tab bar, deep links
  Design/                  Postmark tokens + shared components
  Data/API.swift           thin Supabase client + wire types
  Data/Store.swift         the only object the views talk to
  Push/PushManager.swift   contextual permission, deep links
  Features/                onboarding + eight screens
supabase/
  migrations/0001_core.sql tables, RLS, views, grants
  migrations/0002_rpc.sql  every write path
  migrations/0003_jobs.sql expiry, reminders, retention
  functions/push-dispatch  outbox → APNs
  tests/security_test.sql  the suite above
```

**20 tables, 12 views, 26 functions, 19 client-callable RPCs.**

### The security model in one paragraph

Clients hold `SELECT` on twelve views and `EXECUTE` on nineteen functions, and
**nothing on any base table** — RLS is `force`d and `deny`-by-default
everywhere. Every view a recipient can read is physically incapable of
carrying a sender's or picker's identity. Anonymity is a property of the grant
graph, not of UI discipline; the iOS client has no code path that could leak a
sender because it is never sent one. If you add a view, re-read this
paragraph.

---

## Two account types

Equal citizens. They crush on each other, share circles, and reach mutual
identically. Only **discovery and chrome** differ.

| | Campus (`.edu`) | Personal |
|---|---|---|
| Postmark | `ANN ARBOR MI 48104` | `POSTED ANONYMOUSLY` |
| Directory | Search verified classmates | None |
| Circle | Search + invite | Invite only |
| Send / receive / mutual | Identical | Identical |
| Age | 18+ | 18+ |

Campus identity rides on the **postmark**, not a colour system — which is why
adding a school is one row in `public.campuses` and why it works for schools
with no recognizable colours.

---

## Rules the code enforces

Not style choices. Each is load-bearing.

1. **The reservation rule.** `Ink.crush` appears on exactly four surfaces: the
   parcel border, its status dot, the send button, and the hairline between
   two names. The airmail stripe is navy-only so decoration never spends the
   crush colour. If red leaks into chrome, the reveal stops detonating.
2. **The track burns down, never fills.** A bar that fills rewards completion;
   here completion is expiry.
3. **Locked clues are dated, never blurred.** And the text isn't merely
   hidden — `crush_clues_v` returns `null` for it, so there is nothing to
   screenshot-and-enhance.
4. **The guess result carries zero accent colour.** `submit_guess` returns the
   literal `'recorded'` on every path and executes the same statements in the
   same order either way; `Store.submitGuess` returns `Void`, so the view has
   nothing to branch on even if it wanted to.
5. **Nobody is unmasked without consent.** A correct guess prompts the
   *sender*. Both buttons carry equal weight.
6. **No free text between users, anywhere.** The one text field in the app is
   the report detail — admin-only, capped at 500 chars server-side, never
   rendered to another user.
7. **18+ enforced in `complete_profile`**, not the client. The date of birth
   is discarded on device; only the boolean crosses the wire.
8. **Poll notifications fire 30–90 minutes late, randomized.** An anonymity
   control, not a performance one.
9. **Blocks are silent and total.** The crush becomes `suppressed`, burns the
   sender's postage, notifies nobody, and looks ordinary from the sender's
   side — no "you were blocked" tell. Pending notifications between the pair
   are deleted, not delivered.

---

## Known gaps

- **No `.xcodeproj` committed** — generated by XcodeGen on purpose.
- **`active_bucket` is never populated**, so the night-owl clue never fires.
  Set it from a weekly job over `events` when you have traffic.
- **Rate limiting covers search and invites only.** Send and guess are capped
  by database constraints instead, which is stronger, but abuse of
  `complete_profile` and `report` is unbounded.
- **Reports have no admin surface.** They land in `public.reports`; read them
  in the dashboard until there are enough to justify a console.
- **No analytics beyond `public.events`.** The scoreboard queries from the
  build spec aren't written yet.
- **Deliverability is the launch risk, not the code.** University mail
  gateways treat a new sending domain blasting hundreds of codes in one hour
  exactly like a phishing run. Warm the domain for two weeks, configure
  SPF/DKIM/DMARC, and pre-verify accounts during the teaser week rather than
  at the synchronized launch moment.

## Age scope

Both tiers are 18+; the personal tier means "18+ without a `.edu`". Serving
under-18s is not a config change — it would need verifiable parental consent,
the Utah and Louisiana app-store consent flows, and a moderation function, and
the FTC's NGL order barred that company's founders *personally* from offering
anonymous messaging to under-18s. Deliberate, not an oversight.
