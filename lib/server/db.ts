import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client — SERVER ONLY. RLS is enabled with no policies, so this
 * key is the only way in; it must never reach the client bundle (no NEXT_PUBLIC_).
 */
let cached: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars");
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
