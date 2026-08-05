import { describe, expect, it } from "vitest";
import { ManualContactProvider } from "@/lib/contact-provider";

describe("manual contact provider", () => {
  it("queues only the recipient routing envelope", () => {
    const job = new ManualContactProvider().createJob({
      crushId: "crush-1",
      recipientId: "recipient-1",
      recipientPhone: "+17345550140",
      message: "Someone has a crush on you. Hint 1 of 14 is waiting.",
      deepLink: "https://example.com/crush/crush-1",
    });
    expect(job.provider).toBe("manual");
    expect(job.status).toBe("queued");
    expect(job).not.toHaveProperty("senderId");
    expect(job).not.toHaveProperty("senderName");
  });
});
