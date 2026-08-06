"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { answerPollAction, skipPollAction } from "@/app/actions";
import { Brand } from "@/components/brand";
import { PushCoach } from "@/components/push-coach";
import type { PollRoundState } from "@/lib/backend";

type PlayableRound = Exclude<PollRoundState, { locked: true }>;
type OptimisticRound = PlayableRound & { selectedId?: string | null; transitioning?: boolean };

const minimumBeat = () => new Promise((resolve) => window.setTimeout(resolve, 240));

export function PollRound({ initial }: { initial: PlayableRound }) {
  const [round, setRound] = useState<PlayableRound>(initial);
  const [isPending, startTransition] = useTransition();
  const [optimisticRound, markTransition] = useOptimistic<OptimisticRound, string | null>(
    round,
    (current, selectedId) => ({ ...current, selectedId, transitioning: true }),
  );

  function choose(cardId: string, pickedId: string | null) {
    if (isPending) return;
    startTransition(async () => {
      markTransition(pickedId);
      const formData = new FormData();
      formData.set("cardId", cardId);
      if (pickedId) formData.set("pickedId", pickedId);
      const action = pickedId ? answerPollAction(formData) : skipPollAction(formData);
      const [next] = await Promise.all([action, minimumBeat()]);
      if (!next.locked) setRound(next);
    });
  }

  if (optimisticRound.complete) {
    return (
      <main className="round-page round-page--complete">
        <header><Link href="/home" aria-label="Back home">←</Link><Brand compact /><span /></header>
        <section className="round-done"><span>✦</span><p className="eyebrow">That’s today</p><h1>Done.</h1><p>People you picked hear about it within the hour. Your name stays yours.</p><Link className="button button--teal" href="/home">Back home</Link></section><PushCoach />
      </main>
    );
  }

  const { card } = optimisticRound;
  return (
    <main className="round-page" aria-busy={isPending}>
      <header><Link href="/home" aria-label="Back home">←</Link><Brand compact /><span>{optimisticRound.answered + 1} / {optimisticRound.total}</span></header>
      <div className="round-progress"><span style={{ width: `${((optimisticRound.answered + 1) / optimisticRound.total) * 100}%` }} /></div>
      <section className={`poll-stack ${optimisticRound.transitioning ? "is-transitioning" : ""}`} key={card.id}>
        <p className="eyebrow">Tap one person</p>
        <h1>{card.prompt}</h1>
        <div className="option-grid">
          {card.options.map((person) => <button type="button" disabled={isPending} className={optimisticRound.selectedId === person.id ? "is-selected" : ""} key={person.id} onClick={() => choose(card.id, person.id)}><span className="avatar">{person.firstName[0]}{person.lastName[0]}</span><strong>{person.firstName}</strong><small>{person.lastName} · ’{String(person.classYear).slice(-2)}</small></button>)}
        </div>
        <button type="button" disabled={isPending} className="skip-button" onClick={() => choose(card.id, null)}>Skip this one</button>
      </section>
    </main>
  );
}
