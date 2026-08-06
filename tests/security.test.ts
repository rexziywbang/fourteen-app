import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/001_foundation.sql", "utf8");

function definition(name: string, next: string) {
  const start = migration.indexOf(name);
  const end = migration.indexOf(next, start + name.length);
  expect(start).toBeGreaterThanOrEqual(0);
  return migration.slice(start, end < 0 ? undefined : end);
}

describe("production data boundary", () => {
  it("denies browser roles on every base table and reserves app RPCs for the service role", () => {
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on public.%I from anon, authenticated");
    expect(migration).toContain("revoke all on function %s from public, anon, authenticated");
    expect(migration).toContain("grant execute on function %s to service_role");
  });

  it("never projects sender or picker identity through recipient views", () => {
    const inbox = definition("create view public.crush_inbox_server_v", "create view public.crush_outbox_server_v");
    const compliments = definition("create view public.compliments_server_v", "create view public.blocked_people_server_v");
    expect(inbox.slice(inbox.indexOf("select"), inbox.indexOf("from public.crushes"))).not.toContain("sender_id");
    expect(compliments.slice(compliments.indexOf("select"), compliments.indexOf("from public.picks"))).not.toContain("picker_id");
  });

  it("returns the same neutral guess response and enforces one guess per local day", () => {
    const guess = definition("create or replace function public.submit_guess", "create or replace function public.consent_reveal");
    expect(guess.match(/return 'recorded'/g)).toHaveLength(3);
    expect(guess).not.toMatch(/return '(correct|incorrect|right|wrong)'/);
    expect(migration).toContain("unique (crush_id, guess_date)");
  });

  it("keeps suppressed crushes invisible to recipients and active-shaped to senders", () => {
    const inbox = definition("create view public.crush_inbox_server_v", "create view public.crush_outbox_server_v");
    const outbox = definition("create view public.crush_outbox_server_v", "create view public.recipient_hints_server_v");
    expect(inbox).toContain("c.status <> 'suppressed'");
    expect(outbox).toContain("when c.status = 'suppressed' then 'active'");
  });

  it("filters blocked pairs from search, circle, polls, compliments, and live crushes", () => {
    for (const surface of ["circle_server_v", "compliments_server_v", "search_directory", "get_or_create_round", "block_user"]) {
      expect(migration).toContain(surface);
    }
    expect((migration.match(/public\.blocks/g) || []).length).toBeGreaterThanOrEqual(7);
    expect(definition("create or replace function public.block_user", "create or replace function public.block_from_crush")).toContain("status in ('active','mutual')");
  });

  it("enforces Michigan email, age, weekly crush, and OTP attempt limits in Postgres", () => {
    expect(migration).toContain("school_email like '%@umich.edu'");
    expect(migration).toContain("p_birth_date > timezone('America/Detroit', now())::date - interval '18 years'");
    expect(migration).toContain("sender_id = p_sender and created_at >= started");
    expect(migration).toContain("attempts int not null default 0 check (attempts between 0 and 5)");
  });

  it("strips locked hint text inside the database view", () => {
    expect(definition("create view public.recipient_hints_server_v", "create view public.sender_hints_server_v"))
      .toContain("case when h.unlocked_at is not null then h.hint_text else null end");
  });
});
