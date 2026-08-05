import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, SESSION_COOKIE } from "@/lib/constants";
import { getSessionUser } from "@/lib/db";

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function newSessionToken() {
  return randomBytes(32).toString("base64url");
}

export async function currentUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return getSessionUser(sha256(token));
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/");
  if (!user.onboardingComplete) redirect("/welcome");
  return user;
}

function adminDigest() {
  const key = process.env.ADMIN_ACCESS_KEY;
  if (!key && process.env.NODE_ENV === "production") return null;
  return sha256(key || "founder-demo");
}

export async function isAdmin() {
  const expected = adminDigest();
  const actual = (await cookies()).get(ADMIN_COOKIE)?.value;
  return Boolean(expected && actual && safeEqual(actual, expected));
}

export async function requireAdmin() {
  if (!(await isAdmin())) redirect("/admin/login");
}

export function expectedAdminDigest() {
  return adminDigest();
}
