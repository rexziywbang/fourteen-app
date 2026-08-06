import "server-only";

import { randomUUID } from "node:crypto";
import { formatDetroitDate } from "@/lib/constants";
import { buildHintLadder, recipientHintDto } from "@/lib/hints";
import { detroitDateKey } from "@/lib/time";
import { getSupabaseAdmin, rpc } from "@/lib/supabase";
import type { DirectoryPerson, PollRoundState, SafeUser } from "@/lib/db";

type Row = Record<string, unknown>;

function userFromRow(row: Row): SafeUser {
  return {
    id: String(row.id),
    memberNumber: Number(row.member_number),
    email: String(row.school_email),
    firstName: row.first_name ? String(row.first_name) : null,
    lastName: row.last_name ? String(row.last_name) : null,
    classYear: row.class_year ? Number(row.class_year) : null,
    isDemo: Boolean(row.is_demo),
    onboardingComplete: Boolean(row.onboarded_at),
    createdAt: String(row.created_at),
  };
}

function directoryPerson(row: Row): DirectoryPerson {
  return {
    id: String(row.id),
    firstName: String(row.first_name),
    lastName: String(row.last_name),
    classYear: Number(row.class_year),
    isDemo: Boolean(row.is_demo),
  };
}

async function maybeSingle(table: string, column: string, value: string) {
  const { data, error } = await getSupabaseAdmin().from(table).select("*").eq(column, value).maybeSingle();
  if (error) throw new Error(error.message);
  return data as Row | null;
}

async function viewRows(view: string, viewerId: string, order = "created_at") {
  const { data, error } = await getSupabaseAdmin().from(view).select("*").eq("viewer_id", viewerId).order(order, { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as Row[];
}

export async function createOrFindSignup(email: string) {
  const row = await rpc<Row>("create_or_find_signup", { p_email: email });
  return userFromRow(row);
}

export async function getUserById(id: string) {
  const row = await maybeSingle("profiles", "id", id);
  return row ? userFromRow(row) : null;
}

export async function getUserByEmail(email: string) {
  const row = await maybeSingle("profiles", "school_email", email.toLowerCase());
  return row ? userFromRow(row) : null;
}

export async function saveOtp(email: string, codeHash: string) {
  await rpc("save_login_code", { p_email: email, p_code_hash: codeHash });
}

export async function getOtp(email: string) {
  const row = await maybeSingle("login_codes", "email", email.toLowerCase());
  return row ? {
    email: String(row.email),
    code_hash: String(row.code_hash),
    expires_at: String(row.expires_at),
    attempts: Number(row.attempts),
    sent_at: String(row.sent_at),
  } : undefined;
}

export async function otpCooldownSeconds(email: string) {
  const otp = await getOtp(email);
  return otp ? Math.max(0, Math.ceil((new Date(otp.sent_at).getTime() + 30_000 - Date.now()) / 1000)) : 0;
}

export async function incrementOtpAttempts(email: string) {
  await rpc("increment_login_attempt", { p_email: email });
}

export async function deleteOtp(email: string) {
  await rpc("delete_login_code", { p_email: email });
}

export async function createSession(userId: string, tokenHash: string) {
  await rpc("create_app_session", { p_profile_id: userId, p_token_hash: tokenHash });
}

export async function getSessionUser(tokenHash: string) {
  const row = await rpc<Row | null>("session_profile", { p_token_hash: tokenHash });
  return row?.id ? userFromRow(row) : null;
}

export async function deleteSession(tokenHash: string) {
  await rpc("delete_app_session", { p_token_hash: tokenHash });
}

export async function completeOnboarding(input: { userId: string; birthYear: number; birthMonth: number; birthDay: number; firstName: string; lastName: string; classYear: number; circleIds: string[] }) {
  await rpc("complete_onboarding", {
    p_actor: input.userId,
    p_birth_date: `${input.birthYear}-${String(input.birthMonth).padStart(2, "0")}-${String(input.birthDay).padStart(2, "0")}`,
    p_first_name: input.firstName,
    p_last_name: input.lastName,
    p_class_year: input.classYear,
    p_circle_ids: input.circleIds,
  });
}

export async function deleteUser(userId: string) {
  await rpc("delete_account", { p_actor: userId });
}

export async function searchDirectory(userId: string, query: string) {
  const rows = await rpc<Row[]>("search_directory", { p_actor: userId, p_q: query });
  return rows.map(directoryPerson);
}

export async function consumeRateLimit(userId: string, action: string, limit: number, windowSeconds: number) {
  return await rpc<{ allowed: boolean; retryAfter: number }>("consume_rate_limit", {
    p_actor: userId, p_action: action, p_limit: limit, p_window_seconds: windowSeconds,
  });
}

export async function suggestedPeople(userId: string) {
  const { data, error } = await getSupabaseAdmin().from("profiles").select("id,first_name,last_name,class_year,is_demo")
    .eq("is_demo", true).not("onboarded_at", "is", null).neq("id", userId).order("first_name").limit(4);
  if (error) throw new Error(error.message);
  return (data as Row[]).map(directoryPerson);
}

export async function getCircle(userId: string) {
  const { data, error } = await getSupabaseAdmin().from("circle_server_v").select("id,first_name,last_name,class_year")
    .eq("viewer_id", userId).order("first_name");
  if (error) throw new Error(error.message);
  return (data || []) as Row[];
}

export async function createCrush(senderId: string, recipientId: string, messageId: number) {
  const [sender, recipient, context] = await Promise.all([
    getUserById(senderId),
    getUserById(recipientId),
    rpc<{ sharedCircleCount: number; senderHasRecipient: boolean; recipientHasSender: boolean }>("crush_context", { p_sender: senderId, p_recipient: recipientId }),
  ]);
  if (!sender?.onboardingComplete || !recipient?.onboardingComplete) throw new Error("Both people must finish onboarding.");
  const now = new Date();
  const hints = buildHintLadder({
    firstName: sender.firstName!,
    lastName: sender.lastName!,
    classYear: sender.classYear!,
    joinedMonth: formatDetroitDate(new Date(sender.createdAt)).split(" ")[0],
    sharedCircleCount: Number(context.sharedCircleCount),
    senderHasRecipient: Boolean(context.senderHasRecipient),
    recipientHasSender: Boolean(context.recipientHasSender),
    sentAt: now,
  }, recipient.classYear!);
  const id = randomUUID();
  await rpc("create_crush", { p_id: id, p_sender: senderId, p_recipient: recipientId, p_message_id: messageId, p_hints: hints });
  return id;
}

export async function getHomeData(userId: string) {
  const [received, sent, circle] = await Promise.all([
    viewRows("crush_inbox_server_v", userId),
    viewRows("crush_outbox_server_v", userId),
    getCircle(userId),
  ]);
  return { received, sent, circleCount: circle.length };
}

export async function getCrushForRecipient(userId: string, crushId: string) {
  const { data: row, error } = await getSupabaseAdmin().from("crush_inbox_server_v").select("*")
    .eq("viewer_id", userId).eq("id", crushId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) return null;
  const { data: hints, error: hintsError } = await getSupabaseAdmin().from("recipient_hints_server_v").select("day_index,hint_text,unlocked_at")
    .eq("viewer_id", userId).eq("crush_id", crushId).order("day_index");
  if (hintsError) throw new Error(hintsError.message);
  const { data: guess, error: guessError } = await getSupabaseAdmin().from("guesses").select("id").eq("crush_id", crushId)
    .eq("guess_date", detroitDateKey()).maybeSingle();
  if (guessError) throw new Error(guessError.message);
  return {
    id: String(row.id), messageId: Number(row.message_id), status: String(row.status), createdAt: String(row.created_at),
    expiresAt: String(row.expires_at), guessesToday: Boolean(guess), hints: (hints || []).map((hint) => recipientHintDto({
      dayIndex: Number(hint.day_index), hintText: hint.hint_text ? String(hint.hint_text) : "",
      unlockedAt: hint.unlocked_at ? String(hint.unlocked_at) : null,
    })),
  };
}

export async function getCrushForSender(userId: string, crushId: string) {
  const { data: row, error } = await getSupabaseAdmin().from("crush_outbox_server_v").select("*")
    .eq("viewer_id", userId).eq("id", crushId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) return null;
  const { data: hints, error: hintsError } = await getSupabaseAdmin().from("sender_hints_server_v").select("day_index,unlocked_at")
    .eq("viewer_id", userId).eq("crush_id", crushId).order("day_index");
  if (hintsError) throw new Error(hintsError.message);
  return {
    id: String(row.id), messageId: Number(row.message_id), status: String(row.status), createdAt: String(row.created_at),
    expiresAt: String(row.expires_at), correctGuessAt: row.correct_guess_at ? String(row.correct_guess_at) : null,
    consentDecision: row.consent_decision ? String(row.consent_decision) : null,
    recipientFirstName: String(row.recipient_first_name), recipientLastName: String(row.recipient_last_name),
    hints: (hints || []).map((hint) => ({ dayIndex: Number(hint.day_index), unlockedAt: hint.unlocked_at ? String(hint.unlocked_at) : null })),
  };
}

export async function openCrush(userId: string, crushId: string) {
  return await rpc<number | null>("open_crush", { p_actor: userId, p_crush: crushId });
}

export async function submitGuess(userId: string, crushId: string, guessedId: string) {
  return await rpc<"recorded">("submit_guess", { p_actor: userId, p_crush: crushId, p_guessed: guessedId });
}

export async function consentReveal(userId: string, crushId: string, decision: "revealed" | "kept_hidden") {
  await rpc("consent_reveal", { p_actor: userId, p_crush: crushId, p_decision: decision });
}

export async function getReveal(userId: string, crushId: string) {
  const { data, error } = await getSupabaseAdmin().from("reveal_server_v").select("*").eq("viewer_id", userId).eq("id", crushId).maybeSingle();
  if (error) throw new Error(error.message);
  return data as Row | null;
}

export async function getTodayRound(userId: string) {
  return await rpc<PollRoundState>("get_or_create_round", { p_actor: userId });
}

export async function answerPollCard(userId: string, cardId: string, pickedId: string | null) {
  await rpc("answer_poll_card", { p_actor: userId, p_card: cardId, p_picked: pickedId });
}

export async function getCompliments(userId: string) {
  return await viewRows("compliments_server_v", userId);
}

export async function getNotifications(userId: string) {
  const rows = await viewRows("notifications_server_v", userId);
  return rows.map((row) => ({ id: String(row.id), kind: String(row.kind), createdAt: String(row.created_at), payload: row.payload as Record<string, unknown> }));
}

export async function savePushSubscription(userId: string, subscription: { endpoint: string; p256dh: string; auth: string }) {
  await rpc("save_push_subscription", {
    p_actor: userId,
    p_endpoint: subscription.endpoint,
    p_p256dh: subscription.p256dh,
    p_auth: subscription.auth,
  });
}

export async function submitReport(userId: string, reason: string) {
  await rpc("submit_report", { p_actor: userId, p_reason: reason });
}

export async function getReportHistory(userId: string) {
  return await viewRows("report_history_server_v", userId);
}

export async function getFounderDashboard() {
  return await rpc<{ totals: Record<string, number>; retention: Record<string, number>; funnel: Record<string, number>; reports: Row[] }>("get_founder_dashboard");
}

export async function resolveReport(reportId: string) {
  await rpc("resolve_report", { p_report: reportId });
}

export async function deleteAccount(userId: string) {
  await deleteUser(userId);
}

export async function blockUser(userId: string, targetId: string) {
  await rpc("block_user", { p_actor: userId, p_target: targetId });
}

export async function blockFromCrush(userId: string, crushId: string) {
  await rpc("block_from_crush", { p_actor: userId, p_crush: crushId });
}

export async function blockFromPick(userId: string, pickId: string) {
  await rpc("block_from_pick", { p_actor: userId, p_pick: pickId });
}

export async function getBlockedUsers(userId: string) {
  const { data, error } = await getSupabaseAdmin().from("blocked_people_server_v")
    .select("id,first_name,last_name,class_year").eq("viewer_id", userId).order("first_name");
  if (error) throw new Error(error.message);
  return (data || []) as Row[];
}

export async function unblockUser(userId: string, targetId: string) {
  await rpc("unblock_user", { p_actor: userId, p_target: targetId });
}
