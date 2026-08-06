import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;

export function getSupabaseAdmin() {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) throw new Error("Supabase production storage is not configured.");
  client = createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers: { "X-Client-Info": "fourteen-server/1.1" } },
  });
  return client;
}

export async function rpc<T>(name: string, params: Record<string, unknown> = {}) {
  const { data, error } = await getSupabaseAdmin().rpc(name, params);
  if (error) throw new Error(error.message);
  return data as T;
}
