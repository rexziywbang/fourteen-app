import { LegalShell } from "@/components/legal-shell";
import { CONTACT_EMAIL } from "@/lib/constants";

export const metadata = { title: "Terms" };

export default function TermsPage() {
  return <LegalShell eyebrow="The agreement" title="Terms for being decent here." updated="August 5, 2026">
    <section><h2>Eligibility</h2><p>You must be at least 18, have an active @umich.edu email address, and be able to enter a binding agreement. Fourteen is currently limited to University of Michigan students. Do not create an account for anyone else.</p></section>
    <section><h2>What Fourteen does</h2><p>Fourteen lets eligible users select fixed messages, receive true staged hints, participate in compliment polls, and choose whether to reveal themselves. The service cannot promise that someone will respond, guess, consent, or feel the same way.</p></section>
    <section><h2>Consent is the rule</h2><p>A correct guess does not reveal a sender. Identity is revealed only after an affirmative sender decision or a mutual crush. Do not try to defeat this design, identify anonymous users through technical means, pressure someone to reveal themselves, or share another person’s private information.</p></section>
    <section><h2>Acceptable use</h2><p>Use Fourteen kindly and lawfully. Do not harass, threaten, impersonate, scrape, automate searches, evade blocks, submit false reports, interfere with the service, or use information from the app to target someone off-platform. We may restrict or delete accounts to protect users and the service.</p></section>
    <section><h2>Essential texts</h2><p>During the manual launch, users who opt in may receive essential account notifications by text. Message and data rates may apply. Frequency varies with real app activity. Reply STOP or contact us to opt out. Consent to texts is not a condition of purchase; Fourteen has no payments in this version.</p></section>
    <section><h2>Your content and our service</h2><p>User-visible messages come from fixed libraries. You remain responsible for your actions and reports. We may change or discontinue this early service, correct errors, and update these terms with reasonable notice.</p></section>
    <section><h2>Account deletion and contact</h2><p>You may delete your account from the You screen. Questions, disputes, or opt-out requests can be sent to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. This launch draft is not a substitute for legal review and must be completed with the founder’s legal entity, address, governing law, warranty, liability, and dispute terms before public release.</p></section>
  </LegalShell>;
}
