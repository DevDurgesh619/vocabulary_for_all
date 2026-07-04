"use client";

import { useMemo } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock,
  Flame,
  GraduationCap,
  Infinity as InfinityIcon,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type { DailySession, Profile, TestSession } from "@/lib/types";
import { computeStudentInsights } from "@/lib/counsellor-insights";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

function fmtDur(ms: number | null): string {
  if (ms == null) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return `${m}m ${rs}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function StudentInsights({
  profile,
  dailySessions,
  tests,
}: {
  profile: Profile;
  dailySessions: DailySession[];
  tests: TestSession[];
}) {
  const ins = useMemo(
    () => computeStudentInsights(profile, dailySessions, tests, new Date()),
    [profile, dailySessions, tests],
  );

  const pacePct = ins.expectedWords > 0 ? Math.min(100, Math.round((ins.totalWords / ins.expectedWords) * 100)) : 0;

  return (
    <div className="space-y-6">
      {/* Progress & pace */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Progress & pace</CardTitle>
              <CardDescription>
                Since onboarding on {fmtDate(ins.onboardDate)} · day {ins.daysSinceOnboard} to today
              </CardDescription>
            </div>
            {ins.unlimited && (
              <Badge variant="default" className="gap-1">
                <InfinityIcon className="h-3.5 w-3.5" /> Unlimited mode
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat icon={GraduationCap} label="Lessons completed" value={`${ins.lessonsCompleted}/${ins.lessonsStarted}`} />
            <Stat icon={CheckCircle2} label="Assessments" value={ins.assessmentsCompleted} />
            <Stat icon={CalendarDays} label="Words covered" value={ins.totalWords.toLocaleString()} />
            <Stat icon={TrendingUp} label="Avg words / active day" value={ins.avgWordsPerActiveDay.toLocaleString()} />
          </div>

          {/* Pace vs target */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-medium">
                Target pace: {ins.wordsPerDay}/day → ~{ins.expectedWords.toLocaleString()} words by today
              </span>
              {ins.onTrack ? (
                <Badge variant="success" className="gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {ins.lagWords < 0
                    ? `Ahead by ${Math.abs(ins.lagWords).toLocaleString()} words`
                    : "On track"}
                </Badge>
              ) : (
                <Badge variant="danger" className="gap-1">
                  <TrendingDown className="h-3.5 w-3.5" />
                  Behind by {ins.lagWords.toLocaleString()} words (~{ins.daysBehind} day{ins.daysBehind === 1 ? "" : "s"})
                </Badge>
              )}
            </div>
            <Progress value={pacePct} />
            <p className="text-xs text-[var(--color-muted-foreground)]">
              Actual {ins.totalWords.toLocaleString()} of expected ~{ins.expectedWords.toLocaleString()} words.
              {ins.unlimited && " This student may exceed the daily target — the target is treated as a minimum."}
            </p>
          </div>

          {/* Timing totals */}
          <div className="grid grid-cols-3 gap-3">
            <Stat icon={GraduationCap} label="Learning time (approx)" value={fmtDur(ins.totalLearningMsApprox)} />
            <Stat icon={Clock} label="Assessment time" value={fmtDur(ins.totalAssessmentMs)} />
            <Stat icon={Clock} label="Total time (approx)" value={fmtDur(ins.totalTimeMsApprox)} />
          </div>
        </CardContent>
      </Card>

      {/* Consistency & activity */}
      <Card>
        <CardHeader>
          <CardTitle>Consistency & activity</CardTitle>
          <CardDescription>Streaks, inactivity, and gaps between sessions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat icon={Flame} label="Current streak" value={`${ins.currentStreak} day${ins.currentStreak === 1 ? "" : "s"}`} />
            <Stat icon={CalendarDays} label="Active days" value={`${ins.activeDays}/${ins.daysSinceOnboard}`} />
            <Stat icon={CalendarDays} label="Last active" value={fmtDate(ins.lastActiveDate)} />
            <Stat
              icon={AlertTriangle}
              label="Days inactive"
              value={ins.daysSinceLastActive == null ? "—" : ins.daysSinceLastActive}
              tone={ins.inactivityLevel === "alert" ? "danger" : ins.inactivityLevel === "watch" ? "warning" : "muted"}
            />
          </div>

          {/* Inactivity flag */}
          {ins.inactivityLevel !== "none" && (
            <Flag tone={ins.inactivityLevel === "alert" ? "danger" : "warning"}>
              {ins.daysSinceLastActive == null
                ? "No activity recorded yet."
                : `No activity for ${ins.daysSinceLastActive} day${ins.daysSinceLastActive === 1 ? "" : "s"} (last active ${fmtDate(ins.lastActiveDate)}).`}
            </Flag>
          )}

          {/* Gaps */}
          <div>
            <p className="mb-2 text-sm font-medium">
              Gaps in sessions {ins.gaps.length ? `(${ins.gaps.length})` : ""}
            </p>
            {ins.gaps.length === 0 ? (
              <p className="text-sm text-[var(--color-muted-foreground)]">No gaps — the student has been consistent. 👏</p>
            ) : (
              <ul className="space-y-1.5">
                {ins.gaps.map((g, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
                  >
                    <span className="text-[var(--color-muted-foreground)]">
                      {fmtDate(g.afterDate)} → {fmtDate(g.beforeDate)}
                    </span>
                    <Badge variant={g.missedDays >= 3 ? "danger" : "warning"}>
                      {g.missedDays} day{g.missedDays === 1 ? "" : "s"} missed
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Per-session log */}
      <Card>
        <CardHeader>
          <CardTitle>Session log</CardTitle>
          <CardDescription>
            Every lesson & assessment with dates and time taken. Learning & total times are approximate (derived from
            timestamps); assessment time is measured.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[28rem] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[var(--color-card)] text-left text-xs text-[var(--color-muted-foreground)]">
                <tr className="border-b border-[var(--color-border)]">
                  <th className="p-3 font-medium">Day</th>
                  <th className="p-3 font-medium">Lesson date</th>
                  <th className="p-3 font-medium">Words</th>
                  <th className="p-3 font-medium">Learn*</th>
                  <th className="p-3 font-medium">Assess</th>
                  <th className="p-3 font-medium">Total*</th>
                  <th className="p-3 font-medium">Score</th>
                </tr>
              </thead>
              <tbody>
                {ins.sessions.map((s) => (
                  <tr key={s.dayNumber} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="p-3 font-medium tabular-nums">{s.dayNumber}</td>
                    <td className="p-3 tabular-nums text-[var(--color-muted-foreground)]">{fmtDate(s.lessonDate)}</td>
                    <td className="p-3 tabular-nums">{s.wordCount}</td>
                    <td className="p-3 tabular-nums">{fmtDur(s.learningMsApprox)}</td>
                    <td className="p-3 tabular-nums">{fmtDur(s.assessmentMs)}</td>
                    <td className="p-3 tabular-nums">{fmtDur(s.totalMsApprox)}</td>
                    <td className="p-3 tabular-nums">
                      {s.tested ? (
                        <Badge variant={s.scorePct != null && s.scorePct >= 70 ? "success" : "danger"}>
                          {s.scorePct}%
                        </Badge>
                      ) : (
                        <Badge variant="muted">In progress</Badge>
                      )}
                    </td>
                  </tr>
                ))}
                {ins.sessions.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-[var(--color-muted-foreground)]">
                      No sessions yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="border-t border-[var(--color-border)] p-3 text-xs text-[var(--color-muted-foreground)]">
            * Learn &amp; Total are approximate (time from lesson start to test submission). Assess is measured from
            answer times.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tone = "muted",
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  tone?: "muted" | "danger" | "warning";
}) {
  const color =
    tone === "danger"
      ? "text-[var(--color-danger)]"
      : tone === "warning"
        ? "text-[var(--color-warning)]"
        : "text-[var(--color-muted-foreground)]";
  return (
    <div className="rounded-lg border border-[var(--color-border)] p-3">
      <div className={`flex items-center gap-1.5 text-xs ${color}`}>
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <p className="mt-1 text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}

function Flag({ tone, children }: { tone: "danger" | "warning"; children: React.ReactNode }) {
  const cls =
    tone === "danger"
      ? "border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 text-[var(--color-danger)]"
      : "border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 text-[oklch(0.5_0.13_75)]";
  return (
    <div className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${cls}`}>
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
