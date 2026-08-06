import Link from "next/link";
import { notFound } from "next/navigation";
import { consentRevealAction } from "@/app/actions";
import { Brand } from "@/components/brand";
import { Fuse } from "@/components/fuse";
import { PushCoach } from "@/components/push-coach";
import { getCrushForSender, getCrushMessage } from "@/lib/backend";
import { requireUser } from "@/lib/session";

export default async function SentCrushPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { new: justSent } = await searchParams;
  const crush = await getCrushForSender(user.id, id);
  if (!crush) notFound();
  return (
    <main className="detail-page">
      <header className="detail-header"><Link href="/home" aria-label="Back home">←</Link><Brand compact /><span /></header>
      {justSent && <div className="sent-success"><span>♥</span><p className="eyebrow">Your one brave thing</p><h1>It’s out there.</h1><p>{crush.recipientFirstName}’s anonymous notice is ready. Watch the fuse from here.</p></div>}
      {justSent && <PushCoach />}
      <section className="sender-summary"><p className="eyebrow">Sent to</p><h1>{crush.recipientFirstName} {crush.recipientLastName}</h1><blockquote>“{getCrushMessage(crush.messageId)}”</blockquote><Fuse lit={crush.hints.filter((hint) => hint.unlockedAt).length} className="fuse--large" /><div className="privacy-chip">Your identity is still private</div></section>
      <section className="timeline"><div className="section-intro"><p className="eyebrow">The fuse</p><h2>Fourteen chances to wonder.</h2></div>{crush.hints.map((hint) => <div className={`timeline-row ${hint.unlockedAt ? "is-lit" : ""}`} key={hint.dayIndex}><span>{String(hint.dayIndex).padStart(2, "0")}</span><i /><div><strong>{hint.unlockedAt ? "Hint unlocked" : `Day ${hint.dayIndex}`}</strong><small>{hint.unlockedAt ? "They have one more piece." : "Waiting"}</small></div></div>)}</section>
      {crush.status === "mutual" || crush.status === "revealed" ? <Link className="reveal-link" href={`/reveal/${crush.id}`}><span>✦</span><div><p className="eyebrow">The waiting is over</p><strong>Open your reveal</strong></div><b>→</b></Link> : crush.correctGuessAt && !crush.consentDecision ? <section className="consent-card"><span>?</span><p className="eyebrow">They guessed you</p><h2>Reveal yourself?</h2><p>They’ll never know they were right unless you say so.</p><form action={consentRevealAction}><input type="hidden" name="crushId" value={crush.id} /><button className="button button--primary" name="decision" value="revealed">Reveal me</button><button className="button button--ghost" name="decision" value="kept_hidden">Stay hidden</button></form></section> : crush.consentDecision === "kept_hidden" ? <div className="sender-note"><span>✓</span><p>You chose to stay hidden. They received the same neutral result and cannot tell they were right.</p></div> : null}
      <div className="sender-note"><span>◌</span><p>You’ll see when they open and guess—not the names they guess. A correct guess still needs your consent.</p></div>
      <Link className="button button--primary detail-home" href="/home">Back home</Link>
    </main>
  );
}
