import { notFound } from "next/navigation";
import { RevealExperience } from "@/components/reveal-experience";
import { getReveal } from "@/lib/backend";
import { requireUser } from "@/lib/session";

export const metadata = { title: "The reveal" };

export default async function RevealPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const reveal = await getReveal(user.id, id);
  if (!reveal) notFound();
  return <RevealExperience
    senderId={String(reveal.sender_id)}
    recipientId={String(reveal.recipient_id)}
    senderName={String(reveal.sender_first_name)}
    recipientName={String(reveal.recipient_first_name)}
    resolvedAt={String(reveal.resolved_at)}
    isMutual={reveal.status === "mutual"}
  />;
}
