import Link from "next/link";
import { notFound } from "next/navigation";
import { getReveal } from "@/lib/db";
import { requireUser } from "@/lib/session";

export const metadata = { title: "The reveal" };

export default async function RevealPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const reveal = getReveal(user.id, id);
  if (!reveal) notFound();
  const isMutual = reveal.status === "mutual";
  return <main className="reveal-page"><div className="confetti" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div><div className="reveal-wordmark">♥ fourteen</div><section><span className="reveal-spark">✦</span><p className="eyebrow">{isMutual ? "It’s mutual" : "They said yes"}</p><div className="reveal-names"><strong>{String(reveal.sender_first_name)}</strong><span>+</span><strong>{String(reveal.recipient_first_name)}</strong></div><p>{isMutual ? "You both chose each other. Same week, same feeling." : "The mystery ends here—because they wanted it to."}</p><time>{new Date(String(reveal.resolved_at)).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</time></section><Link href="/home">Back to Fourteen →</Link></main>;
}
