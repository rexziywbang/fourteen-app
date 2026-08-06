import "server-only";

import { randomUUID } from "node:crypto";

export async function sendOtpEmail(email: string, code: string) {
  if (process.env.NODE_ENV === "development") {
    console.info(`[Fourteen development OTP] ${email}: ${code}`);
    return { id: "development-console" };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) throw new Error("Email delivery is not configured.");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `fourteen-otp-${randomUUID()}`,
      "User-Agent": "Fourteen/1.1",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Your Fourteen sign-in code",
      text: `${code} is your Fourteen sign-in code. It expires in 10 minutes. If you did not request it, you can ignore this email.`,
      html: `<div style="background:#14101b;color:#f2eef7;padding:32px;font-family:Arial,sans-serif"><p style="color:#e75a80;font-size:12px;letter-spacing:.14em;text-transform:uppercase">Fourteen at Michigan</p><h1 style="font-family:Georgia,serif;font-size:32px">Your six-digit code</h1><p style="font-size:36px;font-weight:700;letter-spacing:.2em">${code}</p><p style="color:#b5acc6">It expires in 10 minutes. If you did not request it, you can ignore this email.</p></div>`,
    }),
    cache: "no-store",
  });

  if (!response.ok) throw new Error("The sign-in email could not be delivered.");
  return await response.json() as { id: string };
}
