# Fourteen data and security register

This is the working source for the Privacy Policy, Terms, launch checklist, and future AI-phone integration. It records the manual-launch override requested on August 5, 2026.

## Manual-launch override

The original build brief prohibited phone fields, SMS, and an admin view of individual crush relationships. The founder request explicitly adds a manual notification workflow. The implementation therefore collects a phone number only with affirmative essential-text consent and creates a restricted operations job linking a crush to the intended recipient. No sender identity is included in the outbound message.

## Stored data

| Data | Purpose | Exposure | Deletion |
| --- | --- | --- | --- |
| School email | OTP login and eligibility | Account owner; server operations | Account deletion |
| Name and class year | Search, circle, true hints | Eligible non-blocked users | Account deletion |
| Member number | Stable internal support reference | Account owner; founder operations | Account deletion |
| Over-18 boolean | Eligibility | Server operations | Account deletion |
| Birth date | One-time age calculation | Never persisted | Discarded immediately |
| Phone number | Essential manual launch texts | Account owner; restricted founder operations; future provider only when needed | Account deletion or opt-out retention review |
| Text consent timestamp | Consent evidence | Restricted founder operations | Account deletion, subject to legal retention advice |
| Circle edges | Poll options and true hints | Account owner via safe view | Account deletion |
| Crush sender/recipient | Core service and abuse controls | Server; sender sees recipient; recipient does not see sender absent consent/mutuality | Account deletion / expiry policy |
| Manual contact job | Notify intended recipient | Restricted founder operations | Delete with crush/account; establish short retention after completion |
| Reports | Safety review | Reporter and authorized operations | Safety/legal retention policy |
| First-party events | Product validation | Aggregate admin views | Account deletion or early de-identification |

## Security controls

- Production uses Supabase Auth and Postgres with RLS enabled and base-table grants revoked.
- Phone data is separated from public profile data; authenticated clients receive no grant to the private contact table or manual contact queue.
- Sender and picker identities never appear in recipient-facing view shapes.
- Founder access uses a separate high-entropy credential in manual mode; production must move to named admin accounts with MFA and `ADMIN_EMAILS` authorization.
- Admin exports and contact-status changes are audit logged.
- Session cookies are HTTP-only, same-site, secure in production, and expire.
- OTPs are hashed, expire after 10 minutes, and allow five attempts.
- Directory lookup is prefix-only, limited to eight results, blocked in both directions, and rate limited.
- The service role key remains server-only and must be scanned out of client bundles in CI.
- Local `.data/` and all `.env*` secrets are gitignored.
- No third-party trackers, contact upload, user-visible free text, or automated SMS exists in this build.

## Before any public launch

1. Obtain legal review for privacy, terms, TCPA/text consent, Michigan law, and university trademark/affiliation wording.
2. Replace local OTP and SQLite with hosted Supabase Auth/Postgres; configure custom SMTP.
3. Use named founder/admin accounts with MFA, short sessions, least privilege, and access revocation.
4. Configure encryption in transit, managed encryption at rest, backups, restore testing, logging, alerting, and an incident-response contact.
5. Define retention windows for contact jobs, completed crushes, reports, audit logs, and backups.
6. Add an opt-out webhook/process that immediately suppresses future texts and records the request.
7. Complete the required RLS, timing-oracle, race, deletion, and client-bundle tests from the build brief.
8. Update the Privacy Policy before changing `CONTACT_PROVIDER` to an automated or AI-operated number. The automation provider must receive only recipient phone, neutral notification copy, and deep link—not sender identity.
