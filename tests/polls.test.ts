import { describe, expect, it } from "vitest";
import { buildPollOptionIds } from "@/lib/polls";

describe("poll rotation", () => {
  const people = Array.from({ length: 12 }, (_, index) => ({
    id: `person-${index}`,
    lastFeaturedAt: index < 4 ? null : `2026-08-${String(index).padStart(2, "0")}T12:00:00Z`,
  }));

  it("is deterministic and keeps each person to two appearances when possible", () => {
    const cards = buildPollOptionIds(people, "round-seed");
    expect(cards).toEqual(buildPollOptionIds(people, "round-seed"));
    expect(cards).toHaveLength(6);
    expect(cards.every((card) => card.length === 4 && new Set(card).size === 4)).toBe(true);
    const appearances = cards.flat().reduce<Record<string, number>>((counts, id) => ({ ...counts, [id]: (counts[id] || 0) + 1 }), {});
    expect(Math.max(...Object.values(appearances))).toBe(2);
  });

  it("prioritizes people who have never appeared", () => {
    expect(new Set(buildPollOptionIds(people, "round-seed")[0])).toEqual(new Set(["person-0", "person-1", "person-2", "person-3"]));
  });
});
