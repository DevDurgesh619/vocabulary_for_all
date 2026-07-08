"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { MAX_STUDENT_PACE, MIN_STUDENT_PACE } from "@/lib/pace";

const ADMIN_COOKIE = "lexica_admin";

// Admin status is a server-set httpOnly cookie — a student using the app can't set it.
export async function isAdmin(): Promise<boolean> {
  const c = await cookies();
  return c.get(ADMIN_COOKIE)?.value === "1";
}

export async function unlockAdmin(passcode: string): Promise<boolean> {
  const expected = process.env.ADMIN_PASSCODE;
  if (!expected || passcode !== expected) return false;
  const c = await cookies();
  c.set(ADMIN_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8, // 8 hours
  });
  return true;
}

export async function lockAdmin(): Promise<void> {
  const c = await cookies();
  c.delete(ADMIN_COOKIE);
}

export interface SettingsValues {
  words_per_day: number;
  fast_threshold_ms: number;
  slow_threshold_ms: number;
  guess_threshold_ms: number;
}

// Save is re-checked against the admin cookie HERE, so the lock holds even if the
// UI is bypassed. Without admin, the update is refused.
export async function saveSettings(values: SettingsValues): Promise<{ ok: boolean; error?: string }> {
  const c = await cookies();
  if (c.get(ADMIN_COOKIE)?.value !== "1") return { ok: false, error: "Settings are admin-only." };

  const sb = await createClient();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return { ok: false, error: "Not signed in." };

  const patch = {
    words_per_day: clamp(values.words_per_day, 5, 500),
    fast_threshold_ms: clamp(values.fast_threshold_ms, 500, 60000),
    slow_threshold_ms: clamp(values.slow_threshold_ms, 1000, 120000),
    guess_threshold_ms: clamp(values.guess_threshold_ms, 200, 10000),
    updated_at: new Date().toISOString(),
  };
  const { error } = await sb.from("profiles").update(patch).eq("user_id", auth.user.id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// Student self-serve: change ONLY words_per_day, and only if the counsellor has
// enabled `can_set_pace` for this student. Thresholds and other fields are never
// touched here, so no admin passcode is needed and scoring stays protected.
export async function saveWordsPerDay(wordsPerDay: number): Promise<{ ok: boolean; error?: string }> {
  const sb = await createClient();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return { ok: false, error: "Not signed in." };

  const { data: profile } = await sb
    .from("profiles")
    .select("can_set_pace")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (!profile?.can_set_pace) return { ok: false, error: "Setting your own pace isn't enabled for your account." };

  const patch = {
    words_per_day: clamp(wordsPerDay, MIN_STUDENT_PACE, MAX_STUDENT_PACE),
    updated_at: new Date().toISOString(),
  };
  const { error } = await sb.from("profiles").update(patch).eq("user_id", auth.user.id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}
