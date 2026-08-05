import { describe, expect, it } from "vitest";
import { buildHintLadder } from "@/lib/hints";

const sender = {
  firstName: "Maya",
  lastName: "Patel",
  classYear: 2028,
  joinedMonth: "August",
  activeHourBucket: null,
  sharedCircleCount: 0,
  senderHasRecipient: true,
  recipientHasSender: false,
  sentAt: new Date("2026-08-05T18:00:00-04:00"),
} as const;

describe("hint ladder", () => {
  it("builds fourteen unique, frozen statements", () => {
    const hints = buildHintLadder(sender, 2028);
    expect(hints).toHaveLength(14);
    expect(new Set(hints).size).toBe(14);
    expect(hints[0]).toBe("They sent this on a Wednesday.");
    expect(hints).toContain("You have no one in common. Interesting.");
  });

  it("keeps name clues fixed to days thirteen and fourteen", () => {
    const hints = buildHintLadder(sender, 2028);
    expect(hints[12]).toBe("Their first name starts with M.");
    expect(hints[13]).toBe("First two letters: Ma.");
  });

  it("renders relative class year truthfully", () => {
    expect(buildHintLadder(sender, 2027)).toContain("They're a year below you.");
    expect(buildHintLadder(sender, 2029)).toContain("They're a year above you.");
  });
});
