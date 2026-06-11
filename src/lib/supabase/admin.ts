import { createClient } from "@supabase/supabase-js";

// Service-role client — SERVER ONLY. Bypasses RLS. Never import into a client component.
// Used for privileged operations like elevating a user to counsellor.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY / URL not configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
