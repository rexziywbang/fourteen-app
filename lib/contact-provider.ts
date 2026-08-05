export type ContactJobInput = {
  crushId: string;
  recipientId: string;
  recipientPhone: string;
  message: string;
  deepLink: string;
};

export type ContactJob = ContactJobInput & {
  provider: "manual" | "ai_phone";
  status: "queued" | "contacted" | "paused" | "failed";
};

export interface ContactProvider {
  readonly name: ContactJob["provider"];
  createJob(input: ContactJobInput): ContactJob;
}

export class ManualContactProvider implements ContactProvider {
  readonly name = "manual" as const;

  createJob(input: ContactJobInput): ContactJob {
    return { ...input, provider: this.name, status: "queued" };
  }
}

// DECISION: Automation is selected server-side by an environment variable. The future
// AI phone provider must implement this same boundary and never receive sender identity.
export function getContactProvider(): ContactProvider {
  return new ManualContactProvider();
}
