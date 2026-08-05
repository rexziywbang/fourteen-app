"use client";

import { useState } from "react";

export function ShareInvite({ url }: { url: string }) {
  const [status, setStatus] = useState("Share invite");
  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: "Join my circle on Fourteen", text: "You’re one of my people. Join my circle on Fourteen.", url });
      else {
        await navigator.clipboard.writeText(url);
        setStatus("Link copied");
      }
    } catch {
      // Canceling the native sheet is a normal outcome.
    }
  }
  return <button type="button" className="button button--ghost" onClick={share}>{status} <span aria-hidden="true">↗</span></button>;
}
