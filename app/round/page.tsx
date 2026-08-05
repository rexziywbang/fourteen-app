import Link from "next/link";
import { answerPollAction, skipPollAction } from "@/app/actions";
import { Brand } from "@/components/brand";
import { getTodayRound } from "@/lib/db";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Today’s round" };

export default async function RoundPage() {
  const user = await requireUser();
  const round = getTodayRound(user.id);
  if (round.locked) return <main className="round-page"><header><Link href="/home">←</Link><Brand compact /><span /></header><section className="round-empty"><span>◌</span><h1>Four people unlock the fun.</h1><p>You have {round.circleCount}. Invite a few more people you actually know.</p><Link className="button button--teal" href="/you">Open your circle</Link></section></main>;
  if (round.complete) return <main className="round-page"><header><Link href="/home">←</Link><Brand compact /><span /></header><section className="round-done"><span>✦</span><p className="eyebrow">That’s today</p><h1>Done.</h1><p>People you picked get told within the hour—not who picked them.</p><Link className="button button--teal" href="/home">Back home</Link></section></main>;
  return <main className="round-page"><header><Link href="/home">←</Link><Brand compact /><span>{round.answered + 1} / {round.total}</span></header><div className="round-progress"><span style={{ width: `${((round.answered + 1) / round.total) * 100}%` }} /></div><section className="poll-stack"><p className="eyebrow">Tap one person</p><h1>{round.card.prompt}</h1><div className="option-grid">{round.card.options.map((person) => <form action={answerPollAction} key={person.id}><input type="hidden" name="cardId" value={round.card.id} /><button name="pickedId" value={person.id}><span className="avatar">{person.firstName[0]}{person.lastName[0]}</span><strong>{person.firstName}</strong><small>{person.lastName} · ’{String(person.classYear).slice(-2)}</small></button></form>)}</div><form action={skipPollAction}><input type="hidden" name="cardId" value={round.card.id} /><button className="skip-button">Skip this one</button></form></section></main>;
}
