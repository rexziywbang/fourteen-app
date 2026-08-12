// ============================================================================
// push-dispatch — drains the notification outbox to APNs.
//
// Runs every minute (Supabase scheduled function). Nothing in the app ever
// sends a push directly; everything lands in public.notifications first, which
// is what makes the randomized poll delay and the block-purge possible.
//
// Copy discipline: a push must never contain a name, and never contain
// anything that narrows who a sender is. Compare the two poll strings below —
// the notification says what was said, never who said it.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { create, getNumericDate } from "https://deno.land/x/djwt@v3.0.1/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APNS_KEY_ID  = Deno.env.get("APNS_KEY_ID")!;
const APNS_TEAM_ID = Deno.env.get("APNS_TEAM_ID")!;
const APNS_P8      = Deno.env.get("APNS_AUTH_KEY_P8")!;   // -----BEGIN PRIVATE KEY-----
const BUNDLE_ID    = Deno.env.get("APNS_BUNDLE_ID") ?? "app.fourteen.ios";
const APNS_HOST    = Deno.env.get("APNS_HOST") ?? "api.push.apple.com";

type Notif = {
  id: string; user_id: string; kind: string;
  payload: Record<string, unknown>;
};

const COPY: Record<string, { title: string; body: string }> = {
  crush_received:    { title: "Fourteen", body: "Someone has a crush on you. Clue 1 of 14 is waiting." },
  poll_pick:         { title: "Fourteen", body: "Someone said something about you." },
  fuse_progress:     { title: "Fourteen", body: "They opened today's clue." },
  guess_made:        { title: "Fourteen", body: "They took a guess today. It wasn't you." },
  consent_prompt:    { title: "Fourteen", body: "They guessed you. Sign for it, or stay anonymous." },
  identity_revealed: { title: "Fourteen", body: "They signed for it. Open the app." },
  mutual_reveal:     { title: "Fourteen", body: "It's mutual. Open the app." },
  clue_waiting:      { title: "Fourteen", body: "A new clue is ready." },
  quiet_close:       { title: "Fourteen", body: "Your crush window closed quietly. New postage Monday." },
};

let cachedJWT: { token: string; at: number } | null = null;

async function apnsToken(): Promise<string> {
  // APNs tokens are valid for an hour; Apple rejects regeneration under 20min.
  if (cachedJWT && Date.now() - cachedJWT.at < 45 * 60 * 1000) return cachedJWT.token;
  const pem = APNS_P8.replace(/-----[A-Z ]+-----/g, "").replace(/\s/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"],
  );
  const token = await create(
    { alg: "ES256", kid: APNS_KEY_ID },
    { iss: APNS_TEAM_ID, iat: getNumericDate(0) },
    key,
  );
  cachedJWT = { token, at: Date.now() };
  return token;
}

async function send(deviceToken: string, n: Notif, jwt: string): Promise<number> {
  const copy = COPY[n.kind] ?? { title: "Fourteen", body: "Something happened." };
  const res = await fetch(`https://${APNS_HOST}/3/device/${deviceToken}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${jwt}`,
      "apns-topic": BUNDLE_ID,
      "apns-push-type": "alert",
      // Crush arrival and reveals are the moments people open for; the rest
      // can wait for a convenient delivery window.
      "apns-priority": ["crush_received", "mutual_reveal", "identity_revealed",
                        "consent_prompt"].includes(n.kind) ? "10" : "5",
      "apns-collapse-id": n.kind,
    },
    body: JSON.stringify({
      aps: { alert: copy, sound: "default", badge: 1, "thread-id": n.kind },
      kind: n.kind,
      ...n.payload,
    }),
  });
  return res.status;
}

Deno.serve(async () => {
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const { data: due, error } = await db
    .from("notifications")
    .select("id,user_id,kind,payload")
    .is("delivered_at", null)
    .lte("deliver_after", new Date().toISOString())
    .order("deliver_after", { ascending: true })
    .limit(400);

  if (error) return new Response(error.message, { status: 500 });
  if (!due?.length) return Response.json({ sent: 0 });

  const jwt = await apnsToken();
  const userIDs = [...new Set(due.map((n: Notif) => n.user_id))];
  const { data: subs } = await db
    .from("push_subscriptions")
    .select("user_id,device_token")
    .in("user_id", userIDs);

  const byUser = new Map<string, string[]>();
  for (const s of subs ?? []) {
    byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s.device_token]);
  }

  const delivered: string[] = [];
  const dead: string[] = [];

  for (const n of due as Notif[]) {
    for (const token of byUser.get(n.user_id) ?? []) {
      try {
        const status = await send(token, n, jwt);
        // 410 Gone / 400 BadDeviceToken: the device is no longer reachable.
        if (status === 410 || status === 400) dead.push(token);
      } catch (_) { /* leave undelivered; the next tick retries */ }
    }
    // Marked delivered even with zero devices, so a user who never granted
    // push does not accumulate an unbounded backlog. In-app they still see it
    // via my_notifications_v.
    delivered.push(n.id);
  }

  if (delivered.length) {
    await db.from("notifications")
      .update({ delivered_at: new Date().toISOString() })
      .in("id", delivered);
  }
  if (dead.length) {
    await db.from("push_subscriptions").delete().in("device_token", dead);
  }
  return Response.json({ sent: delivered.length, pruned: dead.length });
});
