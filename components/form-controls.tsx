"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({ children, className = "button button--primary", pendingText = "One moment…" }: {
  children: React.ReactNode;
  className?: string;
  pendingText?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button className={className} type="submit" disabled={pending}>
      {pending ? pendingText : children}
    </button>
  );
}
