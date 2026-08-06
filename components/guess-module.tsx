"use client";

import { useActionState, useEffect, useState } from "react";
import { guessCrushAction } from "@/app/actions";
import type { DirectoryPerson } from "@/lib/backend";
import { SubmitButton } from "@/components/form-controls";

export function GuessModule({ crushId, usedToday }: { crushId: string; usedToday: boolean }) {
  const [state, action] = useActionState(guessCrushAction, undefined);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DirectoryPerson[]>([]);
  const [selected, setSelected] = useState<DirectoryPerson | null>(null);

  useEffect(() => {
    if (query.trim().length < 3 || selected) { setResults([]); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const response = await fetch(`/api/directory?q=${encodeURIComponent(query)}`, { signal: controller.signal });
      if (response.ok) setResults(await response.json());
    }, 220);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, selected]);

  if (usedToday || state?.success) return <div className="guess-result"><span>✓</span><strong>Recorded.</strong><p>That’s all we’re saying.</p><small>Your next guess arrives tomorrow.</small></div>;

  return <form action={action} className="guess-form">
    <input type="hidden" name="crushId" value={crushId} />
    <input type="hidden" name="guessedId" value={selected?.id || ""} />
    {!selected ? <>
      <label><span className="field-label">Search your circle</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Type a name" /></label>
      <div className="guess-results">{results.map((person) => <button type="button" key={person.id} onClick={() => setSelected(person)}><span className="avatar">{person.firstName[0]}{person.lastName[0]}</span><strong>{person.firstName} {person.lastName}</strong><small>’{String(person.classYear).slice(-2)}</small></button>)}</div>
    </> : <div className="guess-confirm"><p>Use today’s guess on <strong>{selected.firstName} {selected.lastName}</strong>?</p><button type="button" onClick={() => setSelected(null)}>Change</button></div>}
    {state?.error && <p className="form-error">{state.error}</p>}
    <SubmitButton className="button button--ghost" pendingText="Recording…">Use today’s guess</SubmitButton>
  </form>;
}
