// One-time honest recompute: set each word's bucket (word_progress) from its
// FIRST answer only (the daily test), ignoring later revision attempts.
// Keeps all test_sessions + question_responses intact — only updates word_progress.
//
// Run: node --env-file=.env.local scripts/recompute-buckets.mjs

const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const K = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!U || !K) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
const h = { apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json" };

async function get(path) {
  const r = await fetch(`${U}/rest/v1/${path}`, { headers: h });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.json();
}

function fluency(acc, ms, t) {
  const fast = ms <= t.fast_threshold_ms;
  const slow = ms >= t.slow_threshold_ms;
  if (acc >= 0.85) return fast ? "mastered" : "developing";
  if (acc >= 0.6) return slow ? "needs_reinforcement" : "developing";
  return slow ? "at_risk" : "needs_reinforcement";
}

const responses = await get(
  "question_responses?select=user_id,word_id,is_correct,response_ms,answered_at&order=answered_at.asc&limit=100000",
);
const profiles = await get("profiles?select=user_id,fast_threshold_ms,slow_threshold_ms,guess_threshold_ms");
const thr = new Map(profiles.map((p) => [p.user_id, p]));
const DEF = { fast_threshold_ms: 4000, slow_threshold_ms: 12000, guess_threshold_ms: 1500 };

// earliest response per (user, word) — responses are ordered ascending by answered_at
const first = new Map();
for (const r of responses) {
  const k = `${r.user_id}|${r.word_id}`;
  if (!first.has(k)) first.set(k, r);
}

const now = new Date().toISOString();
const rows = [];
for (const r of first.values()) {
  const t = thr.get(r.user_id) || DEF;
  const acc = r.is_correct ? 1 : 0;
  rows.push({
    user_id: r.user_id,
    word_id: r.word_id,
    status: r.is_correct ? "mastered" : "needs_review",
    fluency_tier: fluency(acc, r.response_ms, t),
    attempts: 1,
    correct_count: acc,
    last_correct: r.is_correct,
    best_response_ms: r.response_ms,
    last_response_ms: r.response_ms,
    last_tested_at: r.answered_at,
    updated_at: now,
  });
}

console.log(`Responses: ${responses.length} · unique (user,word) first attempts: ${rows.length}`);

// upsert in batches of 500
for (let i = 0; i < rows.length; i += 500) {
  const batch = rows.slice(i, i + 500);
  const res = await fetch(`${U}/rest/v1/word_progress?on_conflict=user_id,word_id`, {
    method: "POST",
    headers: { ...h, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(batch),
  });
  if (!res.ok) throw new Error(`upsert ${i}: ${res.status} ${await res.text()}`);
  console.log(`Upserted ${Math.min(i + 500, rows.length)}/${rows.length}`);
}
console.log("DONE");
