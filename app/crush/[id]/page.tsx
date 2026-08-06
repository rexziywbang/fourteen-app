import Link from "next/link";
import { notFound } from "next/navigation";
import { blockFromCrushAction } from "@/app/actions";
import { Brand } from "@/components/brand";
import { Fuse } from "@/components/fuse";
import { GuessModule } from "@/components/guess-module";
import { getCrushForRecipient, getCrushMessage, openCrush } from "@/lib/backend";
import { requireUser } from "@/lib/session";

function dayNumber(expiresAt: unknown) {
  const left = Math.max(0, Math.ceil((new Date(String(expiresAt)).getTime() - Date.now()) / 86_400_000));
  return Math.min(14, Math.max(1, 15 - left));
}

export default async function ReceivedCrushPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const newlyUnlocked = await openCrush(user.id, id);
  const crush = await getCrushForRecipient(user.id, id);
  if (!crush) notFound();
  const unlocked = crush.hints.filter((hint) => hint.unlockedAt);
  return (
    <main className="detail-page">
      <header className="detail-header"><Link href="/home" aria-label="Back home">←</Link><Brand compact /><span /></header>
      <section className="crush-detail-hero"><p className="eyebrow">Someone chose you</p><h1>Day <strong>{dayNumber(crush.expiresAt)}</strong> of 14</h1><blockquote>“{getCrushMessage(crush.messageId)}”</blockquote><Fuse lit={unlocked.length} className="fuse--large" /><small>{unlocked.length} hint{unlocked.length === 1 ? "" : "s"} unlocked</small></section>
      <section className="hint-trail">
        <div className="section-intro"><p className="eyebrow">The trail</p><h2>Only what’s true.</h2></div>
        {crush.hints.map((hint) => <div className={`hint-row ${hint.unlockedAt ? "is-unlocked" : ""} ${hint.dayIndex === newlyUnlocked ? "is-today" : ""}`} key={hint.dayIndex}><span>{String(hint.dayIndex).padStart(2, "0")}</span><div>{hint.unlockedAt ? <><small>{hint.dayIndex === newlyUnlocked ? "Unlocked today" : "Unlocked"}</small><p>{hint.hintText}</p></> : <><small>Still hidden</small><p>Come back another day.</p></>}</div><i>{hint.unlockedAt ? "✦" : "○"}</i></div>)}
      </section>
      <section className="guess-card"><p className="eyebrow">One guess today</p><h2>Think you know?</h2><p>A right guess still reveals nothing unless they choose to say yes.</p><GuessModule crushId={crush.id} usedToday={crush.guessesToday} /></section>
      <details className="safety-affordance"><summary>…</summary><div><strong>Block this person</strong><p>They’ll simply stop appearing. No one is told.</p><form action={blockFromCrushAction}><input type="hidden" name="crushId" value={crush.id} /><button className="button button--ghost">Block this person</button></form></div></details>
      <Link className="button button--ghost detail-home" href="/home">Back home</Link>
    </main>
  );
}
