import { LegalShell } from "@/components/legal-shell";
import { CONTACT_EMAIL } from "@/lib/constants";

export const metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return <LegalShell eyebrow="Your data" title="Privacy should feel unsurprising." updated="August 6, 2026">
    <section><h2>The short version</h2><p>Fourteen is built to help University of Michigan students express interest without exposing someone’s identity before they consent. We collect only what the product needs, do not sell personal information, and do not use third-party advertising trackers or upload address books.</p></section>
    <section><h2>What we collect</h2><ul><li>Account data: school email, first and last name, class year, a generated member number, and confirmation that you are 18 or older.</li><li>App activity: circle choices, crush actions, chosen message templates, true hint data, guesses, blocks, reports, notification status, and first-party product events.</li><li>Technical data: sign-in session records, timestamps, notification subscriptions, and ordinary server error logs needed for security and reliability.</li></ul><p>We ask for your date of birth once to check eligibility. We store only the resulting over-18 confirmation, never the birth date itself.</p></section>
    <section><h2>Who can see what</h2><p>Other students can see your searchable name and class year when allowed by block rules. A crush recipient cannot see the sender’s identity unless the crush becomes mutual or the sender consents after a correct guess. Poll recipients never see who picked them. Founder operations receive aggregate product metrics only; the private safety queue contains report text without an account listing or relationship browser.</p></section>
    <section><h2>Notifications</h2><p>Fourteen uses in-app notifications and may offer web push or email fallback for account activity. The server does not send SMS. Notification previews stay neutral and never expose a sender or picker identity.</p></section>
    <section><h2>Retention and deletion</h2><p>We keep account data while your account is active and retain limited security or legal records only as necessary. Using Delete account removes your profile, sessions, circle, crush data, and associated activity from the active system. Backups may take a limited period to expire. Reports may be retained where necessary for safety or legal compliance.</p></section>
    <section><h2>Your choices</h2><p>You can block people, manage notification permission, request access or correction, and delete your account. For privacy requests, email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. This draft must be reviewed by qualified counsel before public launch.</p></section>
  </LegalShell>;
}
