import Link from "next/link";
import { Brand } from "@/components/brand";
import { SignupForm } from "@/components/signup-form";
import { currentUser } from "@/lib/session";
import { CONTACT_EMAIL } from "@/lib/constants";

export default async function LandingPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const user = await currentUser();
  const { deleted } = await searchParams;
  return (
    <main className="landing">
      <header className="landing-nav"><Brand /><Link href="/safety">Safety, by design</Link></header>
      <div className="landing-grid">
        <section className="hero-copy">
          <div className="campus-pill"><span /> Now at Michigan</div>
          <h1>Some things are<br /><em>worth wondering.</em></h1>
          <p className="hero-lede">Tell one person a week. Stay anonymous. Give them fourteen days to figure it out.</p>
          {deleted && <p className="success-note">Your account and its associated data were deleted.</p>}
          {user?.onboardingComplete ? <Link className="button button--primary button--wide" href="/home">Open Fourteen →</Link> : <SignupForm />}
        </section>

        <section className="phone-stage" aria-label="Preview of a crush notification">
          <div className="orbit orbit--one" /><div className="orbit orbit--two" />
          <div className="phone-glow" />
          <div className="phone-frame">
            <div className="phone-status"><span>9:41</span><i /><b>● ᯤ</b></div>
            <div className="phone-date"><small>WEDNESDAY, AUGUST 5</small><strong>9:41</strong></div>
            <div className="push-card">
              <div className="app-icon">♥</div>
              <div><strong>FOURTEEN <span>now</span></strong><p>Someone has a crush on you.</p><small>Hint 1 of 14 is waiting.</small></div>
            </div>
            <p className="phone-whisper">Fourteen days. One honest chance.</p>
          </div>
          <div className="floating-note">No name. No pressure.<br /><strong>Just a little possibility.</strong></div>
        </section>
      </div>

      <section className="how-it-works" aria-labelledby="how-title">
        <p className="eyebrow">The whole thing</p><h2 id="how-title">Three sentences at a party.</h2>
        <div className="feature-grid">
          <article><span>01</span><div className="feature-icon">♥</div><h3>Send one crush</h3><p>Once a week, choose someone and a message. Your name stays yours.</p></article>
          <article><span>02</span><div className="feature-icon feature-icon--teal">⌛</div><h3>Watch the fuse</h3><p>One true hint unlocks each day they open. Nothing fake, ever.</p></article>
          <article><span>03</span><div className="feature-icon feature-icon--gold">✦</div><h3>See where it goes</h3><p>Mutual crushes reveal together. A right guess still needs your yes.</p></article>
        </div>
      </section>

      <footer className="landing-footer"><Brand compact /><p>Built quietly in Ann Arbor.</p><nav><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><Link href="/safety">Safety</Link><a href={`mailto:${CONTACT_EMAIL}`}>Contact</a></nav></footer>
    </main>
  );
}
