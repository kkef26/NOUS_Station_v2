import { createClient, SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://oozlawunlkkuaykfunan.supabase.co";

let cachedClient: SupabaseClient | null = null;
let cachedAt = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export function getServiceClient(): SupabaseClient {
  const now = Date.now();
  if (cachedClient && now - cachedAt < CACHE_TTL) return cachedClient;

  const key = process.env.SUPABASE_SERVICE_ROLE_NOUS;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_NOUS is not set");

  cachedClient = createClient(SUPABASE_URL, key, {
    db: { schema: "nous" },
    auth: { persistSession: false },
  });
  cachedAt = now;
  return cachedClient;
}

export function getNousUrl(): string {
  return process.env.NOUS || "https://oozlawunlkkuaykfunan.supabase.co/functions/v1/nous";
}

export function getNousKey(): string {
  const key = process.env.NOUS_API_KEY;
  if (!key) throw new Error("NOUS_API_KEY is not set");
  return key;
}
