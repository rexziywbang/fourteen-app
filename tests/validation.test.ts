import { describe, expect, it } from "vitest";
import { emailSchema, isAdultDob } from "@/lib/validation";

describe("signup validation", () => {
  it("accepts only the launch campus domain", () => {
    expect(emailSchema.parse("Blue@UMICH.EDU")).toBe("blue@umich.edu");
    expect(() => emailSchema.parse("blue@gmail.com")).toThrow();
    expect(() => emailSchema.parse("blue@notumich.edu")).toThrow();
  });

  it("uses a neutral DOB boundary without persisting the date", () => {
    const now = new Date("2026-08-05T12:00:00-04:00");
    expect(isAdultDob(2008, 8, 5, now)).toBe(true);
    expect(isAdultDob(2008, 8, 6, now)).toBe(false);
  });
});
