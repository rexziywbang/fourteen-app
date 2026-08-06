"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, SESSION_COOKIE } from "@/lib/constants";
import { sendOtpEmail } from "@/lib/email";
import { createOtpCode, otpPepper } from "@/lib/otp";
import {
  completeOnboarding,
  consentReveal,
  createCrush,
  createOrFindSignup,
  createSession,
  deleteAccount,
  deleteOtp,
  deleteSession,
  deleteUser,
  getOtp,
  getUserByEmail,
  incrementOtpAttempts,
  getTodayRound,
  otpCooldownSeconds,
  openCrush,
  answerPollCard,
  blockFromCrush,
  blockFromPick,
  saveOtp,
  savePushSubscription,
  resolveReport,
  submitGuess,
  submitReport,
  unblockUser,
} from "@/lib/backend";
import {
  currentUser,
  expectedAdminDigest,
  newSessionToken,
  requireAdmin,
  requireUser,
  safeEqual,
  sha256,
} from "@/lib/session";
import {
  isAdultDob,
  onboardingSchema,
  sendCrushSchema,
  startSignupSchema,
  verifySchema,
} from "@/lib/validation";

export type FormState = { error?: string; success?: string } | undefined;

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Try again.";
}

export async function startSignup(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = startSignupSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const cooldown = await otpCooldownSeconds(parsed.data.email);
  if (cooldown > 0) return { error: `Try again in ${cooldown} seconds.` };
  await createOrFindSignup(parsed.data.email);
  const code = createOtpCode();
  const otpHash = sha256(`${parsed.data.email}:${code}:${otpPepper()}`);
  await saveOtp(parsed.data.email, otpHash);
  try {
    await sendOtpEmail(parsed.data.email, code);
  } catch (error) {
    await deleteOtp(parsed.data.email);
    return { error: messageFrom(error) };
  }
  redirect(`/verify?email=${encodeURIComponent(parsed.data.email)}`);
}

export async function verifyOtp(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = verifySchema.safeParse({ email: formData.get("email"), code: formData.get("code") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const otp = await getOtp(parsed.data.email);
  const submitted = sha256(`${parsed.data.email}:${parsed.data.code}:${otpPepper()}`);
  const valid = otp && otp.attempts < 5 && new Date(otp.expires_at) > new Date() && safeEqual(otp.code_hash, submitted);
  if (!valid) {
    if (otp) await incrementOtpAttempts(parsed.data.email);
    return { error: otp?.attempts && otp.attempts >= 4 ? "Too many attempts. Request a new code." : "That code isn't valid." };
  }
  const user = await getUserByEmail(parsed.data.email);
  if (!user) return { error: "We couldn't find that account." };
  await deleteOtp(parsed.data.email);
  const token = newSessionToken();
  await createSession(user.id, sha256(token));
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
  redirect(user.onboardingComplete ? "/home" : "/welcome");
}

export async function finishOnboarding(_state: FormState, formData: FormData): Promise<FormState> {
  const user = await currentUser();
  if (!user) redirect("/");
  const parsed = onboardingSchema.safeParse({
    birthYear: formData.get("birthYear"),
    birthMonth: formData.get("birthMonth"),
    birthDay: formData.get("birthDay"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    classYear: formData.get("classYear"),
    circleIds: formData.getAll("circleIds"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { birthYear, birthMonth, birthDay } = parsed.data;
  if (!isAdultDob(birthYear, birthMonth, birthDay)) {
    await deleteUser(user.id);
    (await cookies()).delete(SESSION_COOKIE);
    redirect("/welcome/underage");
  }
  try {
    await completeOnboarding({
      userId: user.id,
      birthYear,
      birthMonth,
      birthDay,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      classYear: parsed.data.classYear,
      circleIds: parsed.data.circleIds,
    });
  } catch (error) {
    return { error: messageFrom(error) };
  }
  redirect("/home?welcome=1");
}

export async function sendCrushAction(_state: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = sendCrushSchema.safeParse({
    recipientId: formData.get("recipientId"),
    messageId: formData.get("messageId"),
  });
  if (!parsed.success) return { error: "Choose a person and a message." };
  let crushId: string;
  try {
    crushId = await createCrush(user.id, parsed.data.recipientId, parsed.data.messageId);
  } catch (error) {
    return { error: messageFrom(error) };
  }
  redirect(`/sent/${crushId}?new=1`);
}

export async function openHintAction(formData: FormData) {
  const user = await requireUser();
  const crushId = String(formData.get("crushId") || "");
  if (!/^[0-9a-f-]{36}$/i.test(crushId)) return;
  await openCrush(user.id, crushId);
  redirect(`/crush/${crushId}`);
}

export async function guessCrushAction(_state: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const crushId = String(formData.get("crushId") || "");
  const guessedId = String(formData.get("guessedId") || "");
  if (!/^[0-9a-f-]{36}$/i.test(crushId) || !/^[0-9a-f-]{36}$/i.test(guessedId)) return { error: "Choose one person for today's guess." };
  await submitGuess(user.id, crushId, guessedId);
  return { success: "Recorded. That’s all we’re saying." };
}

export async function consentRevealAction(formData: FormData) {
  const user = await requireUser();
  const crushId = String(formData.get("crushId") || "");
  const decision = String(formData.get("decision") || "");
  if (!/^[0-9a-f-]{36}$/i.test(crushId) || !["revealed", "kept_hidden"].includes(decision)) return;
  await consentReveal(user.id, crushId, decision as "revealed" | "kept_hidden");
  redirect(decision === "revealed" ? `/reveal/${crushId}` : `/sent/${crushId}`);
}

export async function answerPollAction(formData: FormData) {
  const user = await requireUser();
  const cardId = String(formData.get("cardId") || "");
  const pickedId = String(formData.get("pickedId") || "");
  if (/^[0-9a-f-]{36}$/i.test(cardId) && /^[0-9a-f-]{36}$/i.test(pickedId)) await answerPollCard(user.id, cardId, pickedId);
  return await getTodayRound(user.id);
}

export async function skipPollAction(formData: FormData) {
  const user = await requireUser();
  const cardId = String(formData.get("cardId") || "");
  if (/^[0-9a-f-]{36}$/i.test(cardId)) await answerPollCard(user.id, cardId, null);
  return await getTodayRound(user.id);
}

export async function blockFromCrushAction(formData: FormData) {
  const user = await requireUser();
  const crushId = String(formData.get("crushId") || "");
  if (/^[0-9a-f-]{36}$/i.test(crushId)) await blockFromCrush(user.id, crushId);
  redirect("/home");
}

export async function blockFromPickAction(formData: FormData) {
  const user = await requireUser();
  const pickId = String(formData.get("pickId") || "");
  if (/^[0-9a-f-]{36}$/i.test(pickId)) await blockFromPick(user.id, pickId);
  redirect("/home");
}

export async function unblockUserAction(formData: FormData) {
  const user = await requireUser();
  const targetId = String(formData.get("targetId") || "");
  if (/^[0-9a-f-]{36}$/i.test(targetId)) await unblockUser(user.id, targetId);
  redirect("/you#blocked");
}

export async function savePushSubscriptionAction(formData: FormData) {
  const user = await requireUser();
  const endpoint = String(formData.get("endpoint") || "");
  const p256dh = String(formData.get("p256dh") || "");
  const auth = String(formData.get("auth") || "");
  if (!endpoint.startsWith("https://") || endpoint.length > 2048 || !p256dh || p256dh.length > 512 || !auth || auth.length > 512) {
    throw new Error("Invalid notification subscription.");
  }
  await savePushSubscription(user.id, { endpoint, p256dh, auth });
}

export async function submitReportAction(_state: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  try {
    await submitReport(user.id, String(formData.get("reason") || ""));
    return { success: "Report received. It is visible only to the founder review queue." };
  } catch (error) {
    return { error: messageFrom(error) };
  }
}

export async function signOut() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(sha256(token));
  store.delete(SESSION_COOKIE);
  redirect("/");
}

export async function deleteMyAccount(_state: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (formData.get("confirmation") !== "DELETE") return { error: "Type DELETE exactly to continue." };
  await deleteAccount(user.id);
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/?deleted=1");
}

export async function adminLogin(_state: FormState, formData: FormData): Promise<FormState> {
  const provided = String(formData.get("accessKey") || "");
  const expected = expectedAdminDigest();
  if (!expected || !safeEqual(sha256(provided), expected)) return { error: "That access key isn't valid." };
  (await cookies()).set(ADMIN_COOKIE, expected, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/admin",
    maxAge: 12 * 60 * 60,
  });
  redirect("/admin");
}

export async function adminLogout() {
  (await cookies()).delete(ADMIN_COOKIE);
  redirect("/admin/login");
}

export async function resolveReportAction(formData: FormData) {
  await requireAdmin();
  const reportId = String(formData.get("reportId") || "");
  if (/^[0-9a-f-]{36}$/i.test(reportId)) await resolveReport(reportId);
  redirect("/admin#reports");
}
