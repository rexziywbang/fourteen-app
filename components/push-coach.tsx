"use client";

import { useEffect, useState } from "react";
import { savePushSubscriptionAction } from "@/app/actions";

type Coach = "push" | "ios" | null;

function applicationServerKey(value: string) {
  const padded = `${value}${"=".repeat((4 - value.length % 4) % 4)}`.replaceAll("-", "+").replaceAll("_", "/");
  return Uint8Array.from(window.atob(padded), (character) => character.charCodeAt(0));
}

async function persistSubscription(subscription: PushSubscription) {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error("The browser did not return notification keys.");
  const formData = new FormData();
  formData.set("endpoint", json.endpoint);
  formData.set("p256dh", json.keys.p256dh);
  formData.set("auth", json.keys.auth);
  await savePushSubscriptionAction(formData);
}

export function PushCoach() {
  const [coach, setCoach] = useState<Coach>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (ios && !standalone && !localStorage.getItem("fourteen-ios-coach-seen")) {
      localStorage.setItem("fourteen-ios-coach-seen", "1");
      setCoach("ios");
      return;
    }
    if (!localStorage.getItem("fourteen-push-coach-seen") && "Notification" in window && "serviceWorker" in navigator && "PushManager" in window && Notification.permission !== "denied") {
      localStorage.setItem("fourteen-push-coach-seen", "1");
      setCoach("push");
    }
  }, []);

  async function enablePush() {
    setBusy(true);
    setError("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setCoach(null);
        return;
      }
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) throw new Error("Notifications are not configured yet.");
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey(publicKey),
      });
      await persistSubscription(subscription);
      setCoach(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Notifications could not be enabled.");
    } finally {
      setBusy(false);
    }
  }

  if (!coach) return null;
  return (
    <aside className="push-coach" aria-live="polite">
      <button className="push-coach__close" aria-label="Dismiss" onClick={() => setCoach(null)}>×</button>
      <span>♥</span>
      {coach === "ios" ? <><strong>Hints buzz — add Fourteen to your home screen.</strong><p>Tap Share, then “Add to Home Screen.” Notifications become available there.</p></> : <><strong>Want the next real moment?</strong><p>Turn on neutral notifications for hints and reveals. Previews never name anyone.</p><button className="button button--primary" disabled={busy} onClick={enablePush}>{busy ? "Turning on…" : "Turn on notifications"}</button>{error && <small role="alert">{error}</small>}</>}
    </aside>
  );
}
