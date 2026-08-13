# Fourteen

An 18+ anonymous crush app for iOS. You send one person a week an anonymous
crush; they get fourteen days of **true** clues to work out who it was. It ends
one of three ways: mutual, consented reveal, or quiet expiry.

This document is written for a **reviewing agent or engineer**. It states what
the product is, what every technical choice was for, which behaviours are
load-bearing invariants rather than accidents, and where the real gaps are.

---

## 1. Status — read this before judging anything

| | State |
|---|---|
| Swift compiles | **Yes.** Whole-module codegen against the iOS 16 simulator SDK, 0 errors, 0 warnings |
| App builds & runs | **Yes.** Verified on an iPhone 17 simulator (iOS 26.5) |
| Onboarding flow | **Verified interactively** through account selection, campus detection, live validation |
| SQL migrations | **Never executed.** No Postgres was available on the authoring machine |
| Security test suite | **Never run.** Written, not proven |
| Push delivery | **Never exercised.** No APNs credentials exist yet |
| Anything past sign-in | **Unreachable** without a live Supabase project |

Treat every SQL claim in this document as *intended* behaviour that has not yet
been observed. The iOS claims have been observed.

---

## 2. File map

```
Fourteen.xcodeproj/project.pbxproj   hand-written, uses a synchronized root group
project.yml                          XcodeGen equivalent, kept as an alternative
Sources/
  FourteenApp.swift                  entry point, push wiring
  Root/RootView.swift                routing, tab bar, push deep-links, .tint
  Design/Tokens.swift                colour + type tokens; THE RESERVATION RULE
  Design/Components.swift            page scaffold, buttons, track bar, stamp
  Data/API.swift                     hand-rolled Supabase client + wire types
  Data/Store.swift                   the only object views talk to; Keychain
  Push/PushManager.swift             contextual permission, deep-link routing
  Features/Onboarding/Onboarding.swift   6-step flow incl. the age gate
  Features/Main/HomeAndTrail.swift       inbox, parcel card, clue trail
  Features/Main/GuessRoundSend.swift     guess, daily poll round, send flow
  Features/Main/SentRevealYou.swift      sender view, consent, reveal, settings
supabase/
  migrations/0001_core.sql           20 tables, RLS, 12 views, grants
  migrations/0002_rpc.sql            26 functions; every client write path
  migrations/0003_jobs.sql           expiry, reminders, retention (pg_cron)
  functions/push-dispatch/index.ts   outbox → APNs (Deno edge function)
  tests/security_test.sql            16 assertions
  seed.sql                           campuses, 11 crush lines, 24 poll prompts
```

**20 tables · 12 views · 26 functions · 19 client-callable RPCs · ~4,500 lines.**

---

## 3. The product, mechanically

**Sending.** One crush per ISO week ("postage"). The sender picks a recipient
and one line from a fixed library. No text is ever typed.

**Receiving.** The recipient sees only *"someone has a crush on you"* plus a
14-day countdown. One clue unlocks per calendar day they open the app. Days
away never stack — returning after a week unlocks one clue, not seven.

**Clues.** All 14 are generated server-side at send time from real data about
the sender and frozen, so later changes can never make a clue false. They run
vague → specific. Days 13 and 14 are always first-initial and first-two-letters,
which forces the game to resolve.

**Guessing.** One guess per crush per day. A correct guess does **not** reveal
anyone; it notifies the *sender*, who chooses.

**Endings.** Mutual (both sent → both revealed), consented reveal (guessed
correctly *and* the sender signs for it), or quiet expiry at day 14 —
"returned to sender", with no notification to the recipient.

**Polls.** A daily 6-card round drawn from your circle. Picking someone tells
them *what* was said, never *who* said it. This is the retention engine; the
crush is the payoff.

---

## 4. Invariants — do NOT "fix" these

Every item here looks like a bug, an oversight, or an optimisation opportunity.
Each is deliberate and load-bearing. Changing any one of them breaks either the
product's core promise or its safety story.

### 4.1 `submit_guess` returns the literal `'recorded'` on every path

Including no-ops (crush not found, already guessed today, unknown user). Both
branches execute **the same statements in the same order** — one insert, one
update, one notification — with only the *values* differing. There are no early
returns after validation and no conditional statement counts.

*Why:* if a wrong guess were distinguishable from "correct but the sender
declined", the consent mechanism would be decorative. The `Store.submitGuess`
Swift method returns `Void` for the same reason: the view has nothing to branch
on even if a future contributor wanted it to.

**Do not** add a return value, an early exit, a "success" boolean, or a
different notification count per branch.

### 4.2 The guess result screen has zero accent colour

It is the only such screen in the app. Any green, red, or gold would leak the
answer visually that the API just spent effort withholding.

### 4.3 No recipient-facing view carries a sender or picker identity

`crush_inbox_v`, `crush_clues_v`, and `compliments_v` have no column that could
hold one and no join that reaches one. `reveal_v` is the *only* place a
recipient can learn a sender, and only after `status IN ('mutual','revealed')`.

**Do not** add a `sender_id` "for convenience", even filtered. Anonymity here
is a property of the grant graph, not of UI discipline — the client cannot leak
what it is never sent.

### 4.4 Locked clue text is `NULL` over the wire

`crush_clues_v` returns the day and the `kind_label` for locked clues, and
`NULL` for `hint_text`. The client renders a dated placeholder.

*Why:* blurring text client-side implies crackable content and invites
screenshot-and-enhance, which students will absolutely try. Dating it tells the
truth (the clue does not exist yet) while still saying what *kind* is coming —
which is the more suspenseful half.

### 4.5 Poll notifications are delayed 30–90 minutes, randomised

`answer_card` sets `deliver_after = now() + random 30..90 min`.

*Why:* this is an **anonymity control, not a performance one**. If the person
beside you gets a buzz the instant you vote, you are identified.

**Do not** "fix the notification latency."

### 4.6 Blocked senders get `suppressed`, not an error

A crush to someone who has blocked you is created with `status = 'suppressed'`:
it burns your weekly postage, notifies nobody, expires normally, and looks
completely ordinary in your own outbox.

*Why:* a silent block must be indistinguishable from being ignored. An error,
a refund of postage, or a missing row would all tell the sender they were
blocked.

### 4.7 The track burns **down**, never fills

`TrackBar(remaining:)` lights segments for days *remaining* and empties as time
passes.

*Why:* a bar that fills rewards completion. Here completion is expiry — the
crush disappearing. Same data, opposite emotion.

### 4.8 Crush red appears on exactly four surfaces

The parcel border, its status dot, the send button, and the hairline between
two names on the reveal. Nothing else in the app is `Ink.crush` — notably the
airmail stripe is navy-only, not the classic red-and-blue.

*Why:* the reveal detonates because the colour has been scarce for fourteen
days. Decoration that spends it destroys the payoff. See `Tokens.swift`.

### 4.9 The 18+ gate is enforced in `complete_profile`, not the client

The date of birth is evaluated on-device and **discarded**; only a boolean is
transmitted, and the server refuses to create a profile when it is false. A
patched client gains nothing.

### 4.10 No free text between users, anywhere

Every user-visible string comes from `crush_messages` or `poll_prompts`. The
only text input in the app is the report detail field — admin-only, capped at
500 chars server-side, never rendered to another user.

*Why:* this is the single decision separating the apps in this category that
sold from the ones that were sued or delisted. You cannot bully someone through
a multiple-choice compliment, and it removes the need for a moderation team.

### 4.11 The consent decline button is full-weight, not greyed

"Stay anonymous" is a normal bordered button beside "Sign for it". A disabled
or de-emphasised decline tells the sender they chose wrong, which is the
opposite of consent design.

---

## 5. Backend architecture

### 5.1 The security model

RLS is `ENABLE`d **and `FORCE`d** on all 20 tables, with `REVOKE ALL` from
`anon` and `authenticated`. Clients hold:

- `SELECT` on **12 views**, each of which filters on `auth.uid()` itself
  (`security_invoker = off`)
- `EXECUTE` on **19 functions**, all `SECURITY DEFINER` with a pinned
  `search_path`
- **nothing on any base table**

`REVOKE ALL ON ALL FUNCTIONS ... FROM public, anon, authenticated` runs before
the explicit grant list, so a new function is unreachable until deliberately
granted.

**Review target:** if you can construct any client-reachable path that returns
a `sender_id` or `picker_id` to a user who is not entitled to it, that is a
critical finding. This is the property the whole design rests on.

### 5.2 Notable functions

**`send_crush(recipient, message_id)`** — the most complex path. In one
transaction: validates both profiles are onboarded; enforces one crush per ISO
week (America/Detroit); rejects a duplicate in-flight crush; takes locks on
both profile rows in **deterministic id order** (`least`/`greatest`) so two
simultaneous reciprocal sends cannot deadlock or both create a second crush;
detects reciprocity and flips both rows to `mutual`; applies the silent-block
suppression; and generates the frozen 14-clue ladder.

**`_build_ladder(sender, recipient)`** — assembles candidate clues as
`{text, label, weight}`, sorts by weight, de-duplicates, takes twelve, and
appends the fixed days 13/14. Falls back to other *true* facts when data is
sparse rather than inventing any. **Runs server-side specifically so a patched
client cannot fabricate clues about itself.**

**`open_crush(crush)`** — inserts into `crush_opens (crush_id, open_date)` and
returns early if the insert was a no-op, which is what makes daily unlocking
idempotent and prevents stacking.

**`block_user(target)`** — inserts the block, drops circle edges both ways,
suppresses any live crush in either direction, **and deletes undelivered
notifications between the pair** so a queued push cannot arrive after a block.

**`delete_account()`** — deletes crushes where the user is *either* party.
Deleting a sender mid-flight removes the crush entirely rather than orphaning
it; the recipient sees the ordinary quiet-expiry state, which reveals nothing
about who left.

### 5.3 Scheduled jobs (`0003_jobs.sql`)

- `sweep_expiries` every 15 min — sets `expired`, notifies **the sender only**
- `queue_clue_reminders` daily — one nudge per active crush, 5–9pm local
  jittered, gives up after 4 unopened days
- `enforce_retention` daily — 90d resolved crushes, 30d delivered
  notifications, 7d undeliverable, 60d poll rounds; `events` are
  **de-identified at 180d rather than deleted**, so retention curves survive

### 5.4 Push (`functions/push-dispatch/index.ts`)

Nothing sends a push directly; everything lands in `public.notifications` and a
per-minute cron drains it. That indirection is what makes the randomised poll
delay and the block-purge possible at all.

Copy discipline: **a push never contains a name** and never narrows who a
sender is. Compare `poll_pick` ("Someone said something about you") against
what a naive implementation would send.

Caches the APNs ES256 JWT for 45 min (Apple rejects regeneration under 20 min),
prunes device tokens on 410/400, and marks notifications delivered even for
users with zero devices so a backlog cannot grow unbounded.

---

## 6. iOS architecture

### 6.1 Stack choices

| Choice | Rationale |
|---|---|
| SwiftUI, iOS 16+, iPhone only | Target demographic is ~90% iPhone; Android would split effort for little return at launch |
| Hand-rolled HTTP client, no Supabase SDK | The needed surface is ~12 RPCs and ~12 view reads. A thin client keeps the security model legible: every call names the exact view or function it touches, and no code path can reach a base table |
| `ObservableObject` + `@Published`, not `@Observable` | Maximum compatibility with the iOS 16 target |
| Keychain for session tokens, `UserDefaults` only for the night-shift flag | `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` — a restored backup on a different phone cannot resume a session |
| Hand-written `.xcodeproj` with a synchronized root group | Adding a Swift file never touches the project, so the usual `pbxproj` merge-conflict argument against committing it does not apply |

### 6.2 Data flow

Views → `Store` (`@MainActor`) → `API` (actor) → PostgREST. Views never call
`API` directly. `Store` re-reads after every mutation rather than mutating
local state optimistically, because the server owns the decisions that matter
(weekly postage, clue unlocks, correctness).

`API.raw` performs exactly **one** transparent refresh-and-retry on a 401, then
gives up — no retry loops.

### 6.3 Design system

`Tokens.swift` defines day/night via functions taking a `Bool` rather than
environment colours, so "night shift" is a token swap (kraft and ink trade
places) instead of a second design language.

`PostmarkPage` wraps content in a `GeometryReader` and applies
`minHeight: proxy.size.height`. **This is not decorative** — without it,
`Spacer` silently collapses inside a `ScrollView` and every screen in the app
piles content at the top. This was a real bug found by running the app.

---

## 7. Two account types

Equal citizens: they crush on each other, appear in each other's circles, and
reach mutual identically. **Only discovery and chrome differ.**

| | Campus (`.edu`) | Personal |
|---|---|---|
| Postmark | `ANN ARBOR MI 48104` | `POSTED ANONYMOUSLY` |
| Directory | `search_directory` — prefix-only, ≤8 results, blocked both ways, rate-limited 30/min | Returns empty for personal accounts by design |
| Circle | Search + invite | Invite only |
| Send / receive / mutual | Identical | Identical |

Campus identity rides on the **postmark**, not a per-school colour system —
which is why adding a school is one row in `public.campuses` and why it works
for schools with no recognisable colours.

`CampusRow.bundledFallback` ships a campus list in the app binary. Without it,
a failed read of `campus_v` makes campus signup impossible *and* the error
message blames the user's school. The server list overrides it whenever it
arrives.

---

## 8. Deliberately absent

DMs and chat · free text between users · photos, avatars, bios · a public feed
· a browsable user list · contact-list upload · any SMS · third-party analytics
or trackers · payments · streaks, scores, leaderboards · anything resembling a
rating · Android · a light/dark *theme toggle* (night shift is a token swap,
not a second design) · under-18 accounts.

Several of these are compliance decisions, not taste. Contact upload and SMS in
particular were removed after an earlier revision reintroduced them: US TCPA
one-to-one consent rules carry $500–$1,500 per message with no cap, and Apple
guideline 5.1.2(iv) prohibits using Contacts data to build a database.

---

## 9. Known gaps

- **`active_bucket` is never populated**, so the night-owl clue can never fire.
  Needs a weekly job over `events`.
- **Rate limiting covers `search_directory` and `create_invite` only.** Send
  and guess are capped by database constraints instead (stronger), but
  `complete_profile` and `submit_report` are unbounded.
- **Reports have no admin surface.** They land in `public.reports` and nothing
  watches them.
- **No analytics/scoreboard queries.** No retention or funnel measurement.
- **No app icon or launch screen art.**
- **Universal links are unhandled.** `create_invite` returns a code and the app
  builds `https://fourteen.app/i/CODE`, but nothing consumes it — no associated
  domain, no `onOpenURL`.
- **No CI.** The security suite should gate every push and currently does not.
- **Legal pages are rows in the You screen that navigate nowhere.**
- **Deliverability is the biggest launch risk and is entirely unproven.**
  University mail gateways treat a new sending domain emitting hundreds of OTP
  codes in an hour exactly like a phishing run.

---

## 10. How to review this

In priority order:

1. **Try to break anonymity.** Enumerate every client-reachable read
   (12 views) and every RPC return value. Can any of them, in any state,
   surface a `sender_id` or `picker_id` to someone not entitled to it? Check
   `reveal_v`'s status filter especially.
2. **Attack `submit_guess` for an oracle.** Statement counts, row counts,
   error paths, notification payloads, timing. Anything that differs between a
   correct and an incorrect guess is a finding.
3. **Run the migrations.** They have never executed. Syntax errors, ordering
   problems, and `plpgsql` mistakes are all plausible.
4. **Run `supabase/tests/security_test.sql`** and confirm all 16 assertions
   pass — then check whether the assertions actually test what their names
   claim.
5. **Race `send_crush`.** Two simultaneous reciprocal sends should produce
   exactly one mutual pair and no deadlock. The lock ordering is intended to
   guarantee this; verify it.
6. **Check the ISO-week boundary** in `iso_week_start()` across a Sunday /
   Monday rollover in America/Detroit.
7. **Audit for anything in §4 that a well-meaning contributor has "fixed".**

### Setup

```bash
supabase link --project-ref <ref> && supabase db push
psql "$DATABASE_URL" -f supabase/seed.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/security_test.sql

cp Sources/Supabase.example.plist Sources/Supabase.plist   # fill in URL + ANON key
open Fourteen.xcodeproj                                    # or: xcodegen && open …
```

Use the **anon** key, never `service_role` — the latter bypasses RLS entirely.
`Sources/Supabase.plist` and `*.p8` are gitignored.

---

## 11. Compliance context

The 18+ scope is a deliberate product decision, not an oversight. The personal
tier means "18+ without a `.edu`", not "open to minors". Serving under-18s
would require verifiable parental consent, the Utah and Louisiana app-store
consent flows, and a real moderation function — and the FTC's 2024 order
against NGL Labs barred that company **and its founders personally** from
offering anonymous messaging apps to under-18s.

Two further design consequences worth knowing when reviewing:

- **App Store guideline 1.2** names "random or anonymous chat" and
  "objectification of real people (hot-or-not voting)" as grounds for removal
  without notice. Hence no free text and no appearance-based poll prompts. The
  content rule for any new prompt: warm, funny, lightly flirty; never about
  appearance, bodies, ranking, or anything cruel.
- **Guideline 5.1.2(iii)** prohibits facilitating the identification of
  anonymous users. This is why reveal is always sender-initiated and why clue
  unlocking is never sold.

App Review notes should state plainly: no free text between users, all content
from a fixed library, reveal is sender-initiated, contacts are never uploaded,
18+ enforced server-side.
