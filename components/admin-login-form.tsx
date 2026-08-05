"use client";

import { useActionState } from "react";
import { adminLogin } from "@/app/actions";
import { SubmitButton } from "@/components/form-controls";

export function AdminLoginForm() {
  const [state, action] = useActionState(adminLogin, undefined);
  return (
    <form action={action} className="stack">
      <label><span className="field-label">Founder access key</span><input name="accessKey" type="password" autoComplete="current-password" autoFocus required /></label>
      {state?.error && <p className="form-error">{state.error}</p>}
      <SubmitButton>Open operations</SubmitButton>
    </form>
  );
}
