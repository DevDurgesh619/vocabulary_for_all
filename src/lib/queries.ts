// Client-side data access against Supabase. All functions take a SupabaseClient
// so they work with the browser client created in components.

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DailySession,
  LocalAnswer,
  Profile,
  QuestionResponse,
  TestSession,
  WordProgress,
  WordStatus,
} from "./types";
import { fluencyTier, thresholdsFromProfile } from "./analytics";
import { TOTAL_WORDS, WORDS } from "./bank";

// Lightweight role lookup for post-login routing.
export async function getRoleHome(sb: SupabaseClient): Promise<string> {
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return "/login";
  const { data } = await sb.from("profiles").select("role").eq("user_id", auth.user.id).maybeSingle();
  return data?.role === "counsellor" ? "/counsellor" : "/dashboard";
}

export async function getProfile(sb: SupabaseClient): Promise<Profile | null> {
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return null;
  const { data } = await sb.from("profiles").select("*").eq("user_id", auth.user.id).maybeSingle();
  if (data) return data as Profile;
  // Fallback if the signup trigger hasn't run yet.
  const { data: created } = await sb
    .from("profiles")
    .insert({ user_id: auth.user.id })
    .select("*")
    .single();
  return created as Profile;
}

export async function updateProfile(sb: SupabaseClient, patch: Partial<Profile>): Promise<void> {
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return;
  await sb.from("profiles").update({ ...patch, updated_at: new Date().toISOString() }).eq("user_id", auth.user.id);
}

// Current user id — student queries MUST scope by this explicitly. (A counsellor
// account has read-all RLS, so relying on RLS alone would aggregate every student.)
async function uid(sb: SupabaseClient): Promise<string | null> {
  const { data } = await sb.auth.getUser();
  return data.user?.id ?? null;
}

export async function getTestHistory(sb: SupabaseClient): Promise<TestSession[]> {
  const id = await uid(sb);
  if (!id) return [];
  const { data } = await sb.from("test_sessions").select("*").eq("user_id", id).order("created_at", { ascending: false });
  return (data ?? []) as TestSession[];
}

export async function getAllProgress(sb: SupabaseClient): Promise<WordProgress[]> {
  const id = await uid(sb);
  if (!id) return [];
  const { data } = await sb.from("word_progress").select("*").eq("user_id", id);
  return (data ?? []) as WordProgress[];
}

export async function getAllResponses(sb: SupabaseClient): Promise<QuestionResponse[]> {
  const id = await uid(sb);
  if (!id) return [];
  const { data } = await sb.from("question_responses").select("*").eq("user_id", id);
  return (data ?? []) as QuestionResponse[];
}

// The set of word ids already covered (have a daily session). Used to pick the next batch.
export async function getCoveredWordIds(sb: SupabaseClient): Promise<Set<number>> {
  const id = await uid(sb);
  const set = new Set<number>();
  if (!id) return set;
  const { data } = await sb.from("daily_sessions").select("word_ids").eq("user_id", id);
  for (const row of (data ?? []) as { word_ids: number[] }[]) row.word_ids.forEach((wid) => set.add(wid));
  return set;
}

export async function getDailySessions(sb: SupabaseClient): Promise<DailySession[]> {
  const id = await uid(sb);
  if (!id) return [];
  const { data } = await sb.from("daily_sessions").select("*").eq("user_id", id).order("day_number", { ascending: true });
  return (data ?? []) as DailySession[];
}

// One-day-at-a-time progression state.
export type DayState =
  | { kind: "learn_pending"; session: DailySession } // today's batch to learn + test
  | { kind: "ready"; dayNumber: number } // can start the next day now
  | { kind: "locked"; completedToday: TestSession } // already finished today's test
  | { kind: "all_done" }; // whole 5,000 covered

// Decide what the student is allowed to do right now. Enforces: exactly one
// learning batch + one daily test per calendar day, in order, no jumping ahead.
export async function getDayState(sb: SupabaseClient): Promise<DayState> {
  const sessions = await getDailySessions(sb);

  // An un-tested batch is always today's task (resume it).
  const pending = sessions.find((s) => s.status === "learning");
  if (pending) return { kind: "learn_pending", session: pending };

  const covered = new Set<number>();
  sessions.forEach((s) => s.word_ids.forEach((id) => covered.add(id)));
  if (covered.size >= TOTAL_WORDS) return { kind: "all_done" };

  // Already completed a *daily* test today? Lock until tomorrow.
  const { data } = await sb
    .from("test_sessions")
    .select("*")
    .eq("kind", "daily")
    .order("created_at", { ascending: false })
    .limit(5);
  const today = new Date().toDateString();
  const completedToday = (data ?? []).find((t) => new Date(t.created_at).toDateString() === today);
  if (completedToday) return { kind: "locked", completedToday: completedToday as TestSession };

  return { kind: "ready", dayNumber: sessions.length + 1 };
}

// Create the next day's batch (the next N uncovered words in learning order).
// Caller must ensure the student is actually allowed to start a new day.
export async function createNextDay(sb: SupabaseClient, profile: Profile): Promise<DailySession | null> {
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return null;

  const sessions = await getDailySessions(sb);
  const covered = new Set<number>();
  sessions.forEach((s) => s.word_ids.forEach((id) => covered.add(id)));

  const next = WORDS.filter((w) => !covered.has(w.id))
    .sort((a, b) => a.order - b.order)
    .slice(0, profile.words_per_day)
    .map((w) => w.id);
  if (next.length === 0) return null;

  const dayNumber = sessions.length + 1;
  const { data } = await sb
    .from("daily_sessions")
    .insert({ user_id: auth.user.id, day_number: dayNumber, word_ids: next, status: "learning" })
    .select("*")
    .single();
  return data as DailySession;
}

// Resolve today's actionable session: resume the pending one, or start a new day
// ONLY if allowed. Returns { session, state } so the UI can show the right screen.
export async function getTodaySession(
  sb: SupabaseClient,
  profile: Profile,
): Promise<{ session: DailySession | null; state: DayState }> {
  const state = await getDayState(sb);
  if (state.kind === "learn_pending") return { session: state.session, state };
  if (state.kind === "ready") return { session: await createNextDay(sb, profile), state };
  return { session: null, state };
}

export interface SubmitResult {
  testSession: TestSession;
}

// Persist a completed test: test_sessions row + question_responses + word_progress upserts,
// then mark the daily session tested. This is where words enter the Mastered / Needs Review buckets.
export async function submitTest(
  sb: SupabaseClient,
  opts: {
    profile: Profile;
    answers: LocalAnswer[];
    dailySessionId: string | null;
    kind: "daily" | "revision";
  },
): Promise<SubmitResult> {
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) throw new Error("Not signed in");
  const userId = auth.user.id;
  const { answers, profile } = opts;
  const t = thresholdsFromProfile(profile);

  const total = answers.length;
  const correct = answers.filter((a) => a.isCorrect).length;
  const avgMs = total ? Math.round(answers.reduce((s, a) => s + a.responseMs, 0) / total) : 0;
  const scorePct = total ? Math.round((correct / total) * 10000) / 100 : 0;

  // Determine attempt number for revision (same words retaken).
  const wordIds = answers.map((a) => a.question.wordId);
  const { data: priorProgress } = await sb
    .from("word_progress")
    .select("word_id, attempts")
    .in("word_id", wordIds);
  const priorMap = new Map<number, WordProgress>(
    (priorProgress ?? []).map((p) => [p.word_id, p as WordProgress]),
  );
  const attemptNumber = 1 + Math.max(0, ...[...priorMap.values()].map((p) => p.attempts ?? 0));

  const { data: ts, error: tsErr } = await sb
    .from("test_sessions")
    .insert({
      user_id: userId,
      daily_session_id: opts.dailySessionId,
      kind: opts.kind,
      attempt_number: attemptNumber,
      total,
      correct,
      score_pct: scorePct,
      avg_response_ms: avgMs,
    })
    .select("*")
    .single();
  if (tsErr || !ts) throw tsErr ?? new Error("Failed to create test session");

  // question_responses
  const responseRows = answers.map((a) => ({
    user_id: userId,
    test_session_id: ts.id,
    word_id: a.question.wordId,
    question_id: a.question.id,
    direction: a.question.direction,
    selected_index: a.selectedIndex,
    selected_word_id: a.selectedWordId,
    is_correct: a.isCorrect,
    response_ms: a.responseMs,
  }));
  await sb.from("question_responses").insert(responseRows);

  // word_progress upserts (the buckets)
  const progressRows = answers.map((a) => {
    const prior = priorMap.get(a.question.wordId);
    const attempts = (prior?.attempts ?? 0) + 1;
    const correctCount = (prior?.correct_count ?? 0) + (a.isCorrect ? 1 : 0);
    const accuracy = correctCount / attempts;
    const status: WordStatus = a.alreadyKnown ? "already_known" : a.isCorrect ? "mastered" : "needs_review";
    const tier = fluencyTier(accuracy, a.responseMs, t);
    const best = Math.min(prior?.best_response_ms ?? Number.MAX_SAFE_INTEGER, a.responseMs);
    return {
      user_id: userId,
      word_id: a.question.wordId,
      status,
      fluency_tier: tier,
      attempts,
      correct_count: correctCount,
      last_correct: a.isCorrect,
      best_response_ms: best,
      last_response_ms: a.responseMs,
      last_tested_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  });
  await sb.from("word_progress").upsert(progressRows, { onConflict: "user_id,word_id" });

  if (opts.dailySessionId) {
    await sb.from("daily_sessions").update({ status: "tested" }).eq("id", opts.dailySessionId);
  }

  return { testSession: ts as TestSession };
}

export const TOTAL = TOTAL_WORDS;
