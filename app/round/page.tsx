import Link from "next/link";
import { Brand } from "@/components/brand";
import { PollRound } from "@/components/poll-round";
import { getTodayRound } from "@/lib/backend";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Today’s round" };

export default async function RoundPage() {
  const user = await requireUser();
  const round = await getTodayRound(user.id);
  if (round.locked) return <main className="round-page"><header><Link href="/home" aria-label="Back home">←</Link><Brand compact /><span /></header><section className="round-empty"><span>◌</span><h1>Four people unlock the fun.</h1><p>You have {round.circleCount}. Invite a few more people you actually know.</p><Link className="button button--teal" href="/you">Open your circle</Link></section></main>;
  return <PollRound initial={round} />;
}
