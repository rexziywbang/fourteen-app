import { describe, expect, it } from "vitest";
import { startOfIsoWeekDetroit } from "@/lib/time";

describe("Detroit ISO week boundary", () => {
  it("uses EST at a winter Monday boundary", () => {
    expect(startOfIsoWeekDetroit(new Date("2026-01-08T12:00:00Z")).toISOString()).toBe("2026-01-05T05:00:00.000Z");
  });

  it("uses EDT at a summer Monday boundary", () => {
    expect(startOfIsoWeekDetroit(new Date("2026-08-06T12:00:00Z")).toISOString()).toBe("2026-08-03T04:00:00.000Z");
  });

  it("changes weeks at Detroit midnight across the spring DST weekend", () => {
    expect(startOfIsoWeekDetroit(new Date("2026-03-09T03:59:59Z")).toISOString()).toBe("2026-03-02T05:00:00.000Z");
    expect(startOfIsoWeekDetroit(new Date("2026-03-09T04:00:00Z")).toISOString()).toBe("2026-03-09T04:00:00.000Z");
  });
});
