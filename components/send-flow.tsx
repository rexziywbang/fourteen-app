"use client";

import { useActionState, useEffect, useState } from "react";
import { sendCrushAction } from "@/app/actions";
import { CRUSH_MESSAGES } from "@/lib/constants";
import type { DirectoryPerson } from "@/lib/backend";
import { SubmitButton } from "@/components/form-controls";

export function SendFlow() {
  const [state, action] = useActionState(sendCrushAction, undefined);
  const [step, setStep] = useState<"person" | "message" | "confirm">("person");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DirectoryPerson[]>([]);
  const [person, setPerson] = useState<DirectoryPerson | null>(null);
  const [messageId, setMessageId] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (query.trim().length < 3) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/directory?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (response.ok) setResults(await response.json());
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);

  return (
    <form action={action} className="send-flow">
      <input type="hidden" name="recipientId" value={person?.id || ""} />
      <input type="hidden" name="messageId" value={messageId} />

      {step === "person" && <section className="flow-panel">
        <p className="eyebrow">Your one for the week</p>
        <h1>Who’s it going to be?</h1>
        <div className="search-box"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search first or last name" autoFocus /><small>{loading ? "Looking…" : "Type at least 3 letters"}</small></div>
        <div className="search-results" aria-live="polite">
          {results.map((result) => <button type="button" key={result.id} onClick={() => { setPerson(result); setStep("message"); }}><span className="avatar">{result.firstName[0]}{result.lastName[0]}</span><span><strong>{result.firstName} {result.lastName}</strong><small>Class of {result.classYear}{result.isDemo ? " · demo" : ""}</small></span><span aria-hidden="true">→</span></button>)}
        </div>
      </section>}

      {step === "message" && person && <section className="flow-panel">
        <button type="button" className="text-button" onClick={() => setStep("person")}>← Change person</button>
        <p className="eyebrow">For {person.firstName}</p>
        <h1>Choose your words.</h1>
        <p className="lede">They’ll see exactly this—with no name attached.</p>
        <div className="message-list">
          {CRUSH_MESSAGES.map((message, index) => <label key={message} className={messageId === index + 1 ? "is-selected" : ""}><input type="radio" checked={messageId === index + 1} onChange={() => setMessageId(index + 1)} /><span>{message}</span><i aria-hidden="true">♥</i></label>)}
        </div>
        <button type="button" className="button button--primary" onClick={() => setStep("confirm")}>Preview their card</button>
      </section>}

      {step === "confirm" && person && <section className="flow-panel">
        <button type="button" className="text-button" onClick={() => setStep("message")}>← Edit message</button>
        <p className="eyebrow">This is exactly what they’ll see</p>
        <div className="recipient-preview">
          <span className="preview-spark">✦</span>
          <small>Someone has a crush on you</small>
          <blockquote>“{CRUSH_MESSAGES[messageId - 1]}”</blockquote>
          <div><span>Hint 1 of 14</span><span>14 days left</span></div>
        </div>
        <div className="final-warning"><strong>This is your one for the week.</strong><span>No takebacks. Your name stays hidden.</span></div>
        {state?.error && <p className="form-error" role="alert">{state.error}</p>}
        <SubmitButton pendingText="Lighting the fuse…">Send anonymously <span aria-hidden="true">♥</span></SubmitButton>
      </section>}
    </form>
  );
}
