// Headless end-to-end check against local Supabase.
// Verifies: sign-up -> auto profile (trigger) -> daily session -> test submit
// (test_session + responses + word_progress buckets) -> read-back, all under RLS.
//
// Run: node scripts/verify-e2e.mjs

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const URL = "http://127.0.0.1:54321";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const words = JSON.parse(readFileSync(resolve(ROOT, "src/data/words.json"), "utf8"));

function ok(cond, msg) {
  console.log(`${cond ? "✓" : "✗"} ${msg}`);
  if (!cond) process.exitCode = 1;
}

const sb = createClient(URL, ANON);
const email = `student_${Math.floor(Date.now()).toString(36)}@example.com`;
const password = "test1234";

// 1. sign up
const { data: signUp, error: suErr } = await sb.auth.signUp({ email, password });
ok(!suErr && !!signUp.user, `sign up (${email})`);
const userId = signUp.user.id;

// 2. profile auto-created by trigger with default 150
let profile;
for (let i = 0; i < 10; i++) {
  const { data } = await sb.from("profiles").select("*").eq("user_id", userId).maybeSingle();
  if (data) { profile = data; break; }
  await new Promise((r) => setTimeout(r, 300));
}
ok(!!profile, "profile row auto-created by trigger");
ok(profile?.words_per_day === 150, `default words_per_day = 150 (got ${profile?.words_per_day})`);

// 3. daily session of first 10 words (small batch for the test)
const N = 10;
const batch = words.slice(0, N).map((w) => w.id);
const { data: ds, error: dsErr } = await sb
  .from("daily_sessions")
  .insert({ user_id: userId, day_number: 1, word_ids: batch, status: "learning" })
  .select("*")
  .single();
ok(!dsErr && !!ds, "daily session created");

// 4. simulate answering: 7 correct (varied speed), 3 wrong
const answers = batch.map((wid, i) => {
  const correct = i < 7;
  const responseMs = correct ? (i < 4 ? 2500 : 9000) : 1200; // fast/slow correct, fast wrong (guess)
  return { wid, correct, responseMs };
});
const total = answers.length;
const correctCount = answers.filter((a) => a.correct).length;
const avgMs = Math.round(answers.reduce((s, a) => s + a.responseMs, 0) / total);

const { data: ts, error: tsErr } = await sb
  .from("test_sessions")
  .insert({
    user_id: userId,
    daily_session_id: ds.id,
    kind: "daily",
    attempt_number: 1,
    total,
    correct: correctCount,
    score_pct: Math.round((correctCount / total) * 10000) / 100,
    avg_response_ms: avgMs,
  })
  .select("*")
  .single();
ok(!tsErr && !!ts, `test session saved (score ${ts?.score_pct}%)`);

// 5. question_responses
const respRows = answers.map((a) => ({
  user_id: userId,
  test_session_id: ts.id,
  word_id: a.wid,
  question_id: `${a.wid}-w2m`,
  direction: "w2m",
  selected_index: 0,
  selected_word_id: a.wid,
  is_correct: a.correct,
  response_ms: a.responseMs,
}));
const { error: rErr } = await sb.from("question_responses").insert(respRows);
ok(!rErr, "question responses inserted");

// 6. word_progress upserts (buckets)
const progRows = answers.map((a) => ({
  user_id: userId,
  word_id: a.wid,
  status: a.correct ? "mastered" : "needs_review",
  attempts: 1,
  correct_count: a.correct ? 1 : 0,
  last_correct: a.correct,
  last_response_ms: a.responseMs,
  last_tested_at: new Date().toISOString(),
}));
const { error: pErr } = await sb.from("word_progress").upsert(progRows, { onConflict: "user_id,word_id" });
ok(!pErr, "word_progress upserted");

// 7. read back
const { data: mastered } = await sb.from("word_progress").select("word_id").eq("status", "mastered");
const { data: needsReview } = await sb.from("word_progress").select("word_id").eq("status", "needs_review");
ok(mastered?.length === 7, `Mastered bucket = 7 (got ${mastered?.length})`);
ok(needsReview?.length === 3, `Needs Review bucket = 3 (got ${needsReview?.length})`);

const { data: history } = await sb.from("test_sessions").select("*");
ok(history?.length === 1, "test appears in history for dashboard");

const { data: allResp } = await sb.from("question_responses").select("response_ms");
ok(allResp?.length === N, `response times captured (${allResp?.length}/${N})`);

// 8. RLS isolation: a fresh anon (no auth) sees nothing
const anonClient = createClient(URL, ANON);
const { data: leaked } = await anonClient.from("word_progress").select("*");
ok((leaked?.length ?? 0) === 0, "RLS: signed-out client sees no rows");

console.log(process.exitCode ? "\nFAILED" : "\nALL CHECKS PASSED");
