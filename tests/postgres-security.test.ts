import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

const url = process.env.SUPABASE_TEST_URL;
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY;
const configured = Boolean(url && serviceKey && anonKey);

async function rpc<T>(client: SupabaseClient, name: string, args: Record<string, unknown>) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw error;
  return data as T;
}

describe.skipIf(!configured)("R3 security suite on real Postgres", () => {
  it("enforces the recipient, picker, block, gate, limit, timing, and browser-role boundaries", async () => {
    const service = createClient(url!, serviceKey!, { auth: { persistSession: false } });
    const browser = createClient(url!, anonKey!, { auth: { persistSession: false } });
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const ids: string[] = [];

    try {
      const browserProfiles = await browser.from("profiles").select("id").limit(1);
      expect(browserProfiles.error).toBeTruthy();

      await expect(rpc(service, "create_or_find_signup", { p_email: `outsider-${suffix}@example.com` })).rejects.toBeTruthy();

      const first = await rpc<Record<string, unknown>>(service, "create_or_find_signup", { p_email: `security-a-${suffix}@umich.edu` });
      const second = await rpc<Record<string, unknown>>(service, "create_or_find_signup", { p_email: `security-b-${suffix}@umich.edu` });
      const third = await rpc<Record<string, unknown>>(service, "create_or_find_signup", { p_email: `security-c-${suffix}@umich.edu` });
      ids.push(String(first.id), String(second.id), String(third.id));

      await expect(rpc(service, "complete_onboarding", {
        p_actor: first.id, p_birth_date: new Date().toISOString().slice(0, 10), p_first_name: "SecurityA",
        p_last_name: "Fixture", p_class_year: 2028, p_circle_ids: [],
      })).rejects.toBeTruthy();

      for (const [profile, name] of [[first, "SecurityA"], [second, "SecurityB"], [third, "SecurityC"]] as const) {
        await rpc(service, "complete_onboarding", {
          p_actor: profile.id, p_birth_date: "1995-01-01", p_first_name: name,
          p_last_name: `Fixture${suffix.slice(-4)}`, p_class_year: 2028, p_circle_ids: [],
        });
      }
      await service.from("circle_edges").insert([
        { owner_id: second.id, member_id: first.id },
        { owner_id: second.id, member_id: third.id },
      ]);

      const { data: message } = await service.from("crush_messages").select("id").eq("active", true).limit(1).single();
      const { data: prompt } = await service.from("poll_prompts").select("id").eq("active", true).limit(1).single();
      expect(message?.id).toBeTruthy();
      expect(prompt?.id).toBeTruthy();
      const firstCrush = randomUUID();
      const hints = Array.from({ length: 14 }, (_, index) => `Security fixture hint ${index + 1}`);
      await rpc(service, "create_crush", {
        p_id: firstCrush, p_sender: first.id, p_recipient: second.id, p_message_id: message!.id, p_hints: hints,
      });
      await expect(rpc(service, "create_crush", {
        p_id: randomUUID(), p_sender: first.id, p_recipient: third.id, p_message_id: message!.id, p_hints: hints,
      })).rejects.toBeTruthy();

      const secondCrush = randomUUID();
      await service.from("crushes").insert({
        id: secondCrush, sender_id: first.id, recipient_id: third.id, message_id: message!.id,
        status: "active", expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      });
      const wrongStarted = performance.now();
      const wrong = await rpc<string>(service, "submit_guess", { p_actor: second.id, p_crush: firstCrush, p_guessed: third.id });
      const wrongDuration = performance.now() - wrongStarted;
      const correctStarted = performance.now();
      const correct = await rpc<string>(service, "submit_guess", { p_actor: third.id, p_crush: secondCrush, p_guessed: first.id });
      const correctDuration = performance.now() - correctStarted;
      expect(new TextEncoder().encode(wrong)).toEqual(new TextEncoder().encode(correct));
      expect(Math.abs(wrongDuration - correctDuration)).toBeLessThan(50);

      const pickId = randomUUID();
      await service.from("picks").insert({ id: pickId, picker_id: first.id, picked_id: second.id, prompt_id: prompt!.id });
      const { data: compliments } = await service.from("compliments_server_v").select("*").eq("viewer_id", second.id).eq("id", pickId);
      expect(compliments?.[0]).not.toHaveProperty("picker_id");

      await rpc(service, "block_user", { p_actor: second.id, p_target: first.id });
      const { data: inbox } = await service.from("crush_inbox_server_v").select("*").eq("viewer_id", second.id).eq("id", firstCrush);
      expect(inbox).toEqual([]);
      const { data: outbox } = await service.from("crush_outbox_server_v").select("status").eq("viewer_id", first.id).eq("id", firstCrush).single();
      expect(outbox?.status).toBe("active");
      const directory = await rpc<Array<{ id: string }>>(service, "search_directory", { p_actor: second.id, p_q: "SecurityA" });
      expect(directory.map((person) => person.id)).not.toContain(first.id);
      const { data: circle } = await service.from("circle_server_v").select("id").eq("viewer_id", second.id);
      expect(circle?.map((person) => person.id)).not.toContain(first.id);
      const round = await rpc<Record<string, unknown>>(service, "get_or_create_round", { p_actor: second.id });
      expect(JSON.stringify(round)).not.toContain(String(first.id));
      const { data: hiddenCompliment } = await service.from("compliments_server_v").select("id").eq("viewer_id", second.id).eq("id", pickId);
      expect(hiddenCompliment).toEqual([]);
    } finally {
      if (ids.length) await service.from("profiles").delete().in("id", ids);
    }
  });
});
