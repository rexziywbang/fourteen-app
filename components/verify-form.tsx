"use client";

import { useActionState } from "react";
import { verifyOtp } from "@/app/actions";
import { SubmitButton } from "@/components/form-controls";

export function VerifyForm({ email, localCode }: { email: string; localCode?: string }) {
  const [state, action] = useActionState(verifyOtp, undefined);
  return (
    <form action={action} className="stack stack--lg">
      <input type="hidden" name="email" value={email} />
      <div>
        <label className="field-label" htmlFor="code">Six-digit code</label>
        <input className="code-input" id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="••••••" autoFocus required />
      </div>
      {localCode && <div className="demo-note">Local demo code: <strong>{localCode}</strong></div>}
      {state?.error && <p className="form-error" role="alert">{state.error}</p>}
      <SubmitButton pendingText="Checking…">Continue</SubmitButton>
    </form>
  );
}
