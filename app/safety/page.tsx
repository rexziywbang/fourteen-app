import { LegalShell } from "@/components/legal-shell";
import { CONTACT_EMAIL } from "@/lib/constants";

export const metadata = { title: "Safety" };

export default function SafetyPage() {
  return <LegalShell eyebrow="How this place works" title="Mystery without the mess." updated="August 5, 2026">
    <section><h2>No one is unmasked without a yes</h2><p>A right guess gets the exact same response as a wrong one. Only the sender learns whether the guess was right. They can reveal themselves or stay hidden; the guesser cannot tell the difference unless the sender chooses to reveal.</p></section>
    <section><h2>Nothing fake</h2><p>Every crush, compliment, view, hint, and notification must trace to a real user action. Hints are frozen from true account data when a crush is sent. Fourteen does not create fake activity to keep you checking.</p></section>
    <section><h2>Blocks are silent and complete</h2><p>Blocked people disappear from search, circle choices, polls, and future active interactions in both directions. We do not notify someone that they were blocked. Reporting is private and visible only to authorized operations staff.</p></section>
    <section><h2>No address-book harvesting</h2><p>We never upload your contacts. We do not support direct messages, photos, bios, or free text that another user can see.</p></section>
    <section><h2>Need help?</h2><p>If anyone makes you feel unsafe, block them, preserve relevant information, and email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. If there is immediate danger, contact local emergency services. Reports are reviewed, but Fourteen is not an emergency service.</p></section>
  </LegalShell>;
}
