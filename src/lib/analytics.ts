// Analytics engine — implements Vocabulary_Learning_Analytics_Framework.docx.
// Pure functions over question responses + profile thresholds.

import type { FluencyTier, Profile, QuestionResponse } from "./types";

export interface Thresholds {
  fast_threshold_ms: number;
  slow_threshold_ms: number;
  guess_threshold_ms: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  fast_threshold_ms: 4000,
  slow_threshold_ms: 12000,
  guess_threshold_ms: 1500,
};

export type ResponseClass =
  | "strong" // correct + fast  -> strong understanding / automatic recall
  | "uncertain" // correct + slow  -> knows but uncertain
  | "misconception" // wrong + fast -> confident misconception / guessing
  | "unknown"; // wrong + slow -> does not know

// Section 2 of the framework: classify one response by accuracy + speed.
export function classifyResponse(
  isCorrect: boolean,
  responseMs: number,
  t: Thresholds = DEFAULT_THRESHOLDS,
): { class: ResponseClass; guessing: boolean } {
  const guessing = responseMs <= t.guess_threshold_ms;
  if (isCorrect) {
    return { class: responseMs <= t.fast_threshold_ms ? "strong" : "uncertain", guessing };
  }
  return { class: responseMs <= t.fast_threshold_ms ? "misconception" : "unknown", guessing };
}

// Section 3: map accuracy + average speed to a fluency tier (per word or per student).
export function fluencyTier(accuracy: number, avgMs: number, t: Thresholds = DEFAULT_THRESHOLDS): FluencyTier {
  const fast = avgMs <= t.fast_threshold_ms;
  const slow = avgMs >= t.slow_threshold_ms;
  if (accuracy >= 0.85) return fast ? "mastered" : "developing";
  if (accuracy >= 0.6) return slow ? "needs_reinforcement" : "developing";
  return slow ? "at_risk" : "needs_reinforcement";
}

export interface ResponseStats {
  total: number;
  correct: number;
  accuracy: number; // 0..1
  avgMs: number;
  fastCorrect: number;
  slowCorrect: number;
  guesses: number;
}

export function summarize(responses: QuestionResponse[], t: Thresholds = DEFAULT_THRESHOLDS): ResponseStats {
  const total = responses.length;
  const correct = responses.filter((r) => r.is_correct).length;
  const sumMs = responses.reduce((s, r) => s + r.response_ms, 0);
  let fastCorrect = 0;
  let slowCorrect = 0;
  let guesses = 0;
  for (const r of responses) {
    const c = classifyResponse(r.is_correct, r.response_ms, t);
    if (c.class === "strong") fastCorrect++;
    if (c.class === "uncertain") slowCorrect++;
    if (c.guessing && !r.is_correct) guesses++;
  }
  return {
    total,
    correct,
    accuracy: total ? correct / total : 0,
    avgMs: total ? Math.round(sumMs / total) : 0,
    fastCorrect,
    slowCorrect,
    guesses,
  };
}

// Section 7: Mastery score 0..100 blending accuracy and speed.
// Speed factor rewards answering at/under the fast threshold, decaying to ~0 by the slow threshold.
export function masteryScore(stats: ResponseStats, t: Thresholds = DEFAULT_THRESHOLDS): number {
  if (stats.total === 0) return 0;
  const span = Math.max(1, t.slow_threshold_ms - t.fast_threshold_ms);
  const speed = clamp01((t.slow_threshold_ms - stats.avgMs) / span);
  const score = (0.7 * stats.accuracy + 0.3 * speed) * 100;
  return Math.round(score);
}

// Guessing probability 0..1 — share of wrong-and-very-fast answers.
export function guessingProbability(stats: ResponseStats): number {
  return stats.total ? Math.round((stats.guesses / stats.total) * 1000) / 1000 : 0;
}

// Word difficulty index 0..100 (higher = harder): low accuracy + high response time.
export function wordDifficulty(accuracy: number, avgMs: number, t: Thresholds = DEFAULT_THRESHOLDS): number {
  const span = Math.max(1, t.slow_threshold_ms - t.fast_threshold_ms);
  const slowness = clamp01((avgMs - t.fast_threshold_ms) / span);
  return Math.round((0.7 * (1 - accuracy) + 0.3 * slowness) * 100);
}

export function thresholdsFromProfile(p?: Pick<Profile, "fast_threshold_ms" | "slow_threshold_ms" | "guess_threshold_ms"> | null): Thresholds {
  if (!p) return DEFAULT_THRESHOLDS;
  return {
    fast_threshold_ms: p.fast_threshold_ms,
    slow_threshold_ms: p.slow_threshold_ms,
    guess_threshold_ms: p.guess_threshold_ms,
  };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export const TIER_LABEL: Record<FluencyTier, string> = {
  mastered: "Mastered",
  developing: "Developing",
  needs_reinforcement: "Needs Reinforcement",
  at_risk: "At Risk",
};
