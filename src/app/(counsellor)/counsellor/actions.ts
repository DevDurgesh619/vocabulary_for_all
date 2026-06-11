"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Elevate the signed-in user to counsellor after verifying the shared secret.
// The role write goes through the service role (the only path the anti-escalation
// trigger permits), so a student can't self-promote from the client.
export async function claimCounsellor(secret: string): Promise<{ ok: boolean; error?: string }> {
  const expected = process.env.COUNSELLOR_SECRET;
  if (!expected) return { ok: false, error: "Counsellor access is not configured." };
  if (secret !== expected) return { ok: false, error: "Incorrect counsellor secret." };

  const sb = await createClient();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return { ok: false, error: "Not signed in." };

  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ role: "counsellor" }).eq("user_id", auth.user.id);
  return error ? { ok: false, error: error.message } : { ok: true };
}
