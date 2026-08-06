import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .email("Enter a valid school email.")
  .transform((value) => value.toLowerCase())
  .refine((value) => value.endsWith("@umich.edu"), {
    message: "Fourteen is currently only open to @umich.edu emails.",
  });

export const startSignupSchema = z.object({ email: emailSchema });

export const verifySchema = z.object({
  email: emailSchema,
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code."),
});

export const onboardingSchema = z.object({
  birthYear: z.coerce.number().int().min(1900).max(new Date().getFullYear()),
  birthMonth: z.coerce.number().int().min(1).max(12),
  birthDay: z.coerce.number().int().min(1).max(31),
  firstName: z.string().trim().min(1).max(30),
  lastName: z.string().trim().min(1).max(30),
  classYear: z.coerce.number().int().min(2027).max(2031),
  circleIds: z.array(z.string().uuid()).min(1, "Pick at least one person."),
});

export const sendCrushSchema = z.object({
  recipientId: z.string().uuid(),
  messageId: z.coerce.number().int().min(1).max(12),
});

export const directoryQuerySchema = z.string().trim().min(3).max(30);

export function isAdultDob(year: number, month: number, day: number, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Detroit",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const current = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const currentYear = Number(current.year);
  const currentMonth = Number(current.month);
  const currentDay = Number(current.day);
  let age = currentYear - year;
  if (currentMonth < month || (currentMonth === month && currentDay < day)) age -= 1;
  return age >= 18;
}
