import "server-only";

import { CRUSH_MESSAGES } from "@/lib/constants";
import type { DirectoryPerson, PollRoundState, SafeUser } from "@/lib/db";

export type { DirectoryPerson, PollRoundState, SafeUser };

const useHosted = process.env.DATA_BACKEND === "supabase" || (process.env.NODE_ENV === "production" && process.env.DATA_BACKEND !== "sqlite");
let adapterPromise: Promise<typeof import("@/lib/db") | typeof import("@/lib/hosted-db")> | undefined;

function adapter() {
  adapterPromise ||= useHosted ? import("@/lib/hosted-db") : import("@/lib/db");
  return adapterPromise;
}

export function isHostedBackend() { return useHosted; }
export function getCrushMessage(messageId: number) { return CRUSH_MESSAGES[messageId - 1] || CRUSH_MESSAGES[0]; }

export async function createOrFindSignup(email: string) { return (await adapter()).createOrFindSignup(email); }
export async function getUserById(id: string) { return (await adapter()).getUserById(id); }
export async function getUserByEmail(email: string) { return (await adapter()).getUserByEmail(email); }
export async function saveOtp(email: string, codeHash: string) { return (await adapter()).saveOtp(email, codeHash); }
export async function getOtp(email: string) { return (await adapter()).getOtp(email); }
export async function otpCooldownSeconds(email: string) { return (await adapter()).otpCooldownSeconds(email); }
export async function incrementOtpAttempts(email: string) { return (await adapter()).incrementOtpAttempts(email); }
export async function deleteOtp(email: string) { return (await adapter()).deleteOtp(email); }
export async function createSession(userId: string, tokenHash: string) { return (await adapter()).createSession(userId, tokenHash); }
export async function getSessionUser(tokenHash: string) { return (await adapter()).getSessionUser(tokenHash); }
export async function deleteSession(tokenHash: string) { return (await adapter()).deleteSession(tokenHash); }
export async function completeOnboarding(input: { userId: string; birthYear: number; birthMonth: number; birthDay: number; firstName: string; lastName: string; classYear: number; circleIds: string[] }) { return (await adapter()).completeOnboarding(input); }
export async function deleteUser(userId: string) { return (await adapter()).deleteUser(userId); }
export async function searchDirectory(userId: string, query: string) { return (await adapter()).searchDirectory(userId, query); }
export async function consumeRateLimit(userId: string, action: string, limit: number, windowSeconds: number) { return (await adapter()).consumeRateLimit(userId, action, limit, windowSeconds); }
export async function suggestedPeople(userId: string) { return (await adapter()).suggestedPeople(userId); }
export async function getCircle(userId: string) { return (await adapter()).getCircle(userId); }
export async function createCrush(senderId: string, recipientId: string, messageId: number) { return (await adapter()).createCrush(senderId, recipientId, messageId); }
export async function getHomeData(userId: string) { return (await adapter()).getHomeData(userId); }
export async function getCrushForRecipient(userId: string, crushId: string) { return (await adapter()).getCrushForRecipient(userId, crushId); }
export async function getCrushForSender(userId: string, crushId: string) { return (await adapter()).getCrushForSender(userId, crushId); }
export async function openCrush(userId: string, crushId: string) { return (await adapter()).openCrush(userId, crushId); }
export async function submitGuess(userId: string, crushId: string, guessedId: string) { return (await adapter()).submitGuess(userId, crushId, guessedId); }
export async function consentReveal(userId: string, crushId: string, decision: "revealed" | "kept_hidden") { return (await adapter()).consentReveal(userId, crushId, decision); }
export async function getReveal(userId: string, crushId: string) { return (await adapter()).getReveal(userId, crushId); }
export async function getTodayRound(userId: string) { return (await adapter()).getTodayRound(userId); }
export async function answerPollCard(userId: string, cardId: string, pickedId: string | null) { return (await adapter()).answerPollCard(userId, cardId, pickedId); }
export async function getCompliments(userId: string) { return (await adapter()).getCompliments(userId); }
export async function getNotifications(userId: string) { return (await adapter()).getNotifications(userId); }
export async function savePushSubscription(userId: string, subscription: { endpoint: string; p256dh: string; auth: string }) { return (await adapter()).savePushSubscription(userId, subscription); }
export async function submitReport(userId: string, reason: string) { return (await adapter()).submitReport(userId, reason); }
export async function getReportHistory(userId: string) { return (await adapter()).getReportHistory(userId); }
export async function getFounderDashboard() { return (await adapter()).getFounderDashboard(); }
export async function resolveReport(reportId: string) { return (await adapter()).resolveReport(reportId); }
export async function deleteAccount(userId: string) { return (await adapter()).deleteAccount(userId); }
export async function blockFromCrush(userId: string, crushId: string) { return (await adapter()).blockFromCrush(userId, crushId); }
export async function blockFromPick(userId: string, pickId: string) { return (await adapter()).blockFromPick(userId, pickId); }
export async function getBlockedUsers(userId: string) { return (await adapter()).getBlockedUsers(userId); }
export async function unblockUser(userId: string, targetId: string) { return (await adapter()).unblockUser(userId, targetId); }
