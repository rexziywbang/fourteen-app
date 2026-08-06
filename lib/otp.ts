import { randomInt } from "node:crypto";

export function createOtpCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function otpPepper() {
  const pepper = process.env.OTP_PEPPER;
  if (!pepper && process.env.NODE_ENV === "production") {
    throw new Error("OTP_PEPPER is required in production.");
  }
  return pepper || "fourteen-development-only";
}
