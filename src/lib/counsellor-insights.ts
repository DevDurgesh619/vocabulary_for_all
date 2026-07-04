// Counsellor-only longitudinal insights, computed purely from existing data
// (profile + daily_sessions + test_sessions) between a student's onboarding date
// and today. No database writes — nothing here mutates stored data.
//
// Timing note: assessment time is derived from the stored per-test answer time
// (avg_response_ms * total). Learning time and combined total are APPROXIMATE —
// derived from timestamps (lesson-created -> test-submitted) because the app does
// not record active learn-phase duration. Fields carrying that caveat end in "Approx".

import type { DailySession, Profile, TestSession } from "./types";

const DAY_MS = 86_400_000;

function startOfDay(d: string | number | Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}
function daysBetween(a: string | number | Date, b: string | number | Date): number {
  return Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS);
}

export interface SessionLogRow {
  dayNumber: number;
  lessonDate: string;
  wordCount: number;
  tested: boolean;
  testDate: string | null;
  learningMsApprox: number | null;
  assessmentMs: number | null;
  totalMsApprox: number | null;
  scorePct: number | null;
}

export interface SessionGap {
  afterDate: string; // last active day before the gap
  beforeDate: string; // next active day after the gap
  missedDays: number; // full days with no activity in between
}

export type InactivityLevel = "none" | "watch" | "alert";

export interface StudentInsights {
  onboardDate: string;
  daysSinceOnboard: number; // inclusive: onboarding day = 1
  unlimited: boolean;

  // 1) counts
  lessonsStarted: number;
  lessonsCompleted: number;
  assessmentsCompleted: number;
  totalWords: number;

  // 3) timing totals
  totalLearningMsApprox: number;
  totalAssessmentMs: number;
  totalTimeMsApprox: number;

  // 4) activity / inactivity
  activeDays: number;
  lastActiveDate: string | null;
  daysSinceLastActive: number | null;
  currentStreak: number;
  inactivityLevel: InactivityLevel;

  // 2) gaps
  gaps: SessionGap[];

  // 5) pace / lag
  wordsPerDay: number;
  expectedWords: number;
  lagWords: number; // > 0 behind, < 0 ahead
  daysBehind: number; // floor(lag / wordsPerDay), 0 if on/ahead
  onTrack: boolean;
  avgWordsPerActiveDay: number;
  avgLessonsPerActiveDay: number;

  // 1) per-session log (newest first)
  sessions: SessionLogRow[];
}

export function computeStudentInsights(
  profile: Profile,
  dailySessions: DailySession[],
  testSessions: TestSession[],
  now: Date,
): StudentInsights {
  const wpd = profile.words_per_day;
  const unlimited = !!profile.unlimited_daily;
  const daysSinceOnboard = Math.max(1, daysBetween(profile.created_at, now) + 1);

  // Map each daily session to its (earliest) daily test.
  const dailyTests = testSessions.filter((t) => t.kind === "daily" && t.daily_session_id);
  const testBySession = new Map<string, TestSession>();
  for (const t of dailyTests) {
    const prev = testBySession.get(t.daily_session_id!);
    if (!prev || new Date(t.created_at) < new Date(prev.created_at)) testBySession.set(t.daily_session_id!, t);
  }

  const ordered = [...dailySessions].sort((a, b) => a.day_number - b.day_number);
  const sessions: SessionLogRow[] = [];
  let totalWords = 0;
  let totalLearningMsApprox = 0;
  let totalAssessmentMs = 0;
  let totalTimeMsApprox = 0;
  let lessonsCompleted = 0;

  for (const ds of ordered) {
    const wordCount = ds.word_ids.length;
    totalWords += wordCount;
    const t = testBySession.get(ds.id);
    let learningMsApprox: number | null = null;
    let assessmentMs: number | null = null;
    let totalMsApprox: number | null = null;
    let scorePct: number | null = null;
    let testDate: string | null = null;
    const tested = !!t;

    if (t) {
      lessonsCompleted++;
      testDate = t.created_at;
      assessmentMs = Math.max(0, Math.round(t.avg_response_ms * t.total));
      totalMsApprox = Math.max(0, new Date(t.created_at).getTime() - new Date(ds.created_at).getTime());
      learningMsApprox = Math.max(0, totalMsApprox - assessmentMs);
      scorePct = t.score_pct;
      totalAssessmentMs += assessmentMs;
      totalLearningMsApprox += learningMsApprox;
      totalTimeMsApprox += totalMsApprox;
    }

    sessions.push({
      dayNumber: ds.day_number,
      lessonDate: ds.created_at,
      wordCount,
      tested,
      testDate,
      learningMsApprox,
      assessmentMs,
      totalMsApprox,
      scorePct,
    });
  }

  // Active days = any day the student created a lesson or completed a daily test.
  const activeSet = new Set<number>();
  for (const ds of dailySessions) activeSet.add(startOfDay(ds.created_at));
  for (const t of dailyTests) activeSet.add(startOfDay(t.created_at));
  const activeDaysArr = [...activeSet].sort((a, b) => a - b);
  const activeDays = activeDaysArr.length;

  const lastActiveTs = activeDaysArr.length ? activeDaysArr[activeDaysArr.length - 1] : null;
  const lastActiveDate = lastActiveTs != null ? new Date(lastActiveTs).toISOString() : null;
  const daysSinceLastActive = lastActiveTs != null ? daysBetween(lastActiveTs, now) : null;

  // Current streak: consecutive active days ending today or yesterday (1-day grace).
  let currentStreak = 0;
  {
    const present = new Set(activeDaysArr);
    let cur = startOfDay(now);
    if (!present.has(cur)) cur -= DAY_MS; // allow "not yet today"
    while (present.has(cur)) {
      currentStreak++;
      cur -= DAY_MS;
    }
  }

  const inactivityLevel: InactivityLevel =
    daysSinceLastActive == null || daysSinceLastActive >= 3 ? "alert" : daysSinceLastActive >= 1 ? "watch" : "none";

  // Gaps between consecutive active days.
  const gaps: SessionGap[] = [];
  for (let i = 1; i < activeDaysArr.length; i++) {
    const missed = Math.round((activeDaysArr[i] - activeDaysArr[i - 1]) / DAY_MS) - 1;
    if (missed >= 1) {
      gaps.push({
        afterDate: new Date(activeDaysArr[i - 1]).toISOString(),
        beforeDate: new Date(activeDaysArr[i]).toISOString(),
        missedDays: missed,
      });
    }
  }

  // Pace: ideal is one full lesson (wpd words) per calendar day since onboarding.
  const expectedWords = wpd * daysSinceOnboard;
  const lagWords = expectedWords - totalWords;
  const daysBehind = lagWords > 0 ? Math.floor(lagWords / Math.max(1, wpd)) : 0;
  const onTrack = daysBehind === 0;
  const avgWordsPerActiveDay = activeDays ? Math.round(totalWords / activeDays) : 0;
  const avgLessonsPerActiveDay = activeDays ? Math.round((ordered.length / activeDays) * 100) / 100 : 0;

  return {
    onboardDate: profile.created_at,
    daysSinceOnboard,
    unlimited,
    lessonsStarted: ordered.length,
    lessonsCompleted,
    assessmentsCompleted: dailyTests.length,
    totalWords,
    totalLearningMsApprox,
    totalAssessmentMs,
    totalTimeMsApprox,
    activeDays,
    lastActiveDate,
    daysSinceLastActive,
    currentStreak,
    inactivityLevel,
    gaps,
    wordsPerDay: wpd,
    expectedWords,
    lagWords,
    daysBehind,
    onTrack,
    avgWordsPerActiveDay,
    avgLessonsPerActiveDay,
    sessions: sessions.reverse(), // newest first for the log
  };
}
