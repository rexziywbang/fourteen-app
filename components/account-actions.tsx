"use client";

import { useActionState, useState } from "react";
import { deleteMyAccount } from "@/app/actions";
import { SubmitButton } from "@/components/form-controls";

export function DeleteAccountForm() {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(deleteMyAccount, undefined);
  if (!open) return <button className="settings-row settings-row--danger" onClick={() => setOpen(true)}>Delete account <span>→</span></button>;
  return (
    <form action={action} className="danger-box">
      <strong>This permanently deletes your account.</strong>
      <p>Type DELETE to confirm. Your profile, crushes, and activity are removed.</p>
      <input name="confirmation" placeholder="DELETE" autoComplete="off" />
      {state?.error && <p className="form-error">{state.error}</p>}
      <div className="button-row"><button type="button" className="button button--ghost" onClick={() => setOpen(false)}>Cancel</button><SubmitButton className="button button--danger">Delete</SubmitButton></div>
    </form>
  );
}
