// Counsellor data access. All reads/writes go through the counsellor's session;
// RLS (migration 0002) authorizes cross-student access only for counsellors.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile, QuestionResponse, TestSession, WordProgress } from "./types";

export interface StudentOverview {
  user_id: string;
  email: string | null;
  display_name: string | null;
  words_per_day: number;
  created_at: string;
  mastered: number;
  needs_review: number;
  already_known: number;
  words_tested: number;
  tests_taken: number;
  avg_score: number | null;
  last_tested_at: string | null;
}

export async function getStudents(sb: SupabaseClient): Promise<StudentOverview[]> {
  const { data } = await sb.from("student_overview").select("*").order("created_at", { ascending: true });
  return (data ?? []) as StudentOverview[];
}

export interface StudentDetail {
  profile: Profile | null;
  responses: QuestionResponse[];
  progress: WordProgress[];
  tests: TestSession[];
}

export async function getStudentDetail(sb: SupabaseClient, studentId: string): Promise<StudentDetail> {
  const [{ data: profile }, { data: responses }, { data: progress }, { data: tests }] = await Promise.all([
    sb.from("profiles").select("*").eq("user_id", studentId).maybeSingle(),
    sb.from("question_responses").select("*").eq("user_id", studentId),
    sb.from("word_progress").select("*").eq("user_id", studentId),
    sb.from("test_sessions").select("*").eq("user_id", studentId).order("created_at", { ascending: false }),
  ]);
  return {
    profile: (profile as Profile) ?? null,
    responses: (responses ?? []) as QuestionResponse[],
    progress: (progress ?? []) as WordProgress[],
    tests: (tests ?? []) as TestSession[],
  };
}

export interface StudentSettings {
  words_per_day: number;
  fast_threshold_ms: number;
  slow_threshold_ms: number;
  guess_threshold_ms: number;
}

export async function updateStudentSettings(
  sb: SupabaseClient,
  studentId: string,
  values: StudentSettings,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await sb
    .from("profiles")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("user_id", studentId);
  return error ? { ok: false, error: error.message } : { ok: true };
}
