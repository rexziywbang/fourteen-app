"use client";

import { useActionState } from "react";
import { startSignup } from "@/app/actions";
import { SubmitButton } from "@/components/form-controls";

export function SignupForm() {
  const [state, action] = useActionState(startSignup, undefined);
  return (
    <form action={action} className="signup-form">
      <label className="sr-only" htmlFor="email">University of Michigan email</label>
      <input id="email" name="email" type="email" autoComplete="email" inputMode="email" placeholder="you@umich.edu" required />
      <SubmitButton pendingText="Sending…">Get your code <span aria-hidden="true">→</span></SubmitButton>
      {state?.error && <p className="form-error" role="alert">{state.error}</p>}
      <p className="microcopy">18+ · Michigan students only · no profile photos, ever</p>
    </form>
  );
}
