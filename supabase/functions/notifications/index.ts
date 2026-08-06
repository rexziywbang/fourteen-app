import { createClient } from "npm:@supabase/supabase-js@2.112.0";
import webpush from "npm:web-push@3.6.7";

type OutboxItem = {
  id: string;
  user_id: string;
  school_email: string;
  kind: string;
  payload: Record<string, unknown>;
};

type SubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

const EMAIL_FALLBACK_KINDS = new Set([
  "crush_received",
  "mutual_reveal",
  "identity_revealed",
  "consent_prompt",
]);

const copy: Record<string, { title: string; body: string }> = {
  crush_received: { title: "Something’s waiting on Fourteen", body: "A new anonymous crush is waiting." },
  mutual_reveal: { title: "Something changed on Fourteen", body: "Open Fourteen to see what changed." },
  identity_revealed: { title: "Something changed on Fourteen", body: "Open Fourteen to see what changed." },
  consent_prompt: { title: "A decision is waiting on Fourteen", body: "Someone guessed correctly. Your identity stays hidden unless you choose otherwise." },
  fuse_progress: { title: "The fuse moved", body: "A new hint was unlocked." },
  guess_made: { title: "Someone took a guess", body: "Open Fourteen when you’re ready." },
  poll_pick: { title: "A note found you", body: "Someone chose you in today’s round." },
  hint_waiting: { title: "A hint is waiting", body: "Open Fourteen to keep the fuse moving." },
  quiet_close: { title: "The window closed quietly", body: "Your next one unlocks Monday." },
};

function required(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

function destination(item: OutboxItem) {
  const crushId = typeof item.payload.crush_id === "string" ? item.payload.crush_id : "";
  if (!crushId) return "/home";
  if (item.kind === "crush_received" || item.kind === "hint_waiting") return `/crush/${crushId}`;
  if (item.kind === "mutual_reveal" || item.kind === "identity_revealed") return `/reveal/${crushId}`;
  if (item.kind === "consent_prompt" || item.kind === "guess_made" || item.kind === "fuse_progress") return `/sent/${crushId}`;
  return "/home";
}

async function sendFallbackEmail(item: OutboxItem, appUrl: string) {
  const message = copy[item.kind] || { title: "Fourteen", body: "Something is waiting for you." };
  const url = new URL(destination(item), appUrl).toString();
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${required("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `notification/${item.id}`,
      "User-Agent": "fourteen-notification-worker/1.1",
    },
    body: JSON.stringify({
      from: required("RESEND_FROM_EMAIL"),
      to: [item.school_email],
      subject: message.title,
      text: `${message.body}\n\nOpen Fourteen: ${url}`,
      html: `<p>${message.body}</p><p><a href="${url}">Open Fourteen</a></p>`,
    }),
  });
  if (!response.ok) throw new Error(`Resend returned ${response.status}`);
}

Deno.serve(async (request) => {
  try {
    const secret = required("NOTIFICATION_EDGE_SECRET");
    const authorization = request.headers.get("authorization") || "";
    if (!safeEqual(authorization, `Bearer ${secret}`)) return new Response("Unauthorized", { status: 401 });

    const supabase = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const appUrl = required("APP_URL");
    webpush.setVapidDetails(
      `mailto:${required("VAPID_CONTACT_EMAIL")}`,
      required("VAPID_PUBLIC_KEY"),
      required("VAPID_PRIVATE_KEY"),
    );

    const { data, error } = await supabase.rpc("claim_notification_batch", { p_limit: 25 });
    if (error) throw error;
    const items = (data || []) as OutboxItem[];
    let delivered = 0;

    for (const item of items) {
      try {
        const { data: subscriptions, error: subscriptionError } = await supabase
          .from("push_subscriptions")
          .select("id,endpoint,p256dh,auth")
          .eq("user_id", item.user_id);
        if (subscriptionError) throw subscriptionError;

        const message = copy[item.kind] || { title: "Fourteen", body: "Something is waiting for you." };
        let pushDelivered = false;
        for (const subscription of (subscriptions || []) as SubscriptionRow[]) {
          try {
            await webpush.sendNotification({
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            }, JSON.stringify({ ...message, url: destination(item), tag: item.kind, notificationId: item.id }), {
              TTL: 60 * 60 * 24,
              urgency: item.kind === "mutual_reveal" ? "high" : "normal",
            });
            pushDelivered = true;
            await supabase.from("push_subscriptions").update({ last_success_at: new Date().toISOString() }).eq("id", subscription.id);
          } catch (error) {
            const statusCode = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
            if (statusCode === 404 || statusCode === 410) {
              await supabase.from("push_subscriptions").delete().eq("id", subscription.id);
              continue;
            }
            throw error;
          }
        }

        const emailSent = !pushDelivered && EMAIL_FALLBACK_KINDS.has(item.kind);
        if (emailSent) await sendFallbackEmail(item, appUrl);
        const { error: completeError } = await supabase.rpc("complete_notification", { p_id: item.id, p_email_sent: emailSent });
        if (completeError) throw completeError;
        delivered += 1;
      } catch (error) {
        console.error("Notification delivery failed", item.id, error);
        await supabase.rpc("release_notification", { p_id: item.id });
      }
    }

    return Response.json({ claimed: items.length, delivered });
  } catch (error) {
    console.error("Notification worker failed", error);
    return Response.json({ error: "Notification worker failed" }, { status: 500 });
  }
});
