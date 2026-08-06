import { describe, expect, it } from "vitest";
import { createOtpCode } from "@/lib/otp";

describe("one-time codes", () => {
  it("creates a fresh six-digit value", () => {
    const values = new Set(Array.from({ length: 20 }, () => createOtpCode()));
    expect(values.size).toBeGreaterThan(1);
    for (const value of values) expect(value).toMatch(/^\d{6}$/);
  });
});
