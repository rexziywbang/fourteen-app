"use client";

import { useActionState, useState } from "react";
import { submitReportAction } from "@/app/actions";
import { SubmitButton } from "@/components/form-controls";

export function ReportForm() {
  const [state, action] = useActionState(submitReportAction, undefined);
  const [open, setOpen] = useState(false);
  if (!open && !state?.success) return <button className="settings-row" onClick={() => setOpen(true)}>Report a safety concern <span>→</span></button>;
  if (state?.success) return <div className="report-success">{state.success}</div>;
  return <form action={action} className="report-box"><label><span className="field-label">Tell the founder what happened</span><textarea name="reason" maxLength={500} required placeholder="This is private and never shown to another user." /></label>{state?.error && <p className="form-error">{state.error}</p>}<div className="button-row"><button type="button" className="button button--ghost" onClick={() => setOpen(false)}>Cancel</button><SubmitButton>Send report</SubmitButton></div></form>;
}
