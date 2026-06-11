"use client";

import Link from "next/link";
import { ArrowRight, Brain, CalendarDays, Clock, Flame, Target, TrendingUp } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { useDailySessions, useDayState, useProfile, useProgress, useTestHistory, useUser } from "@/lib/hooks";
import { TOTAL_WORDS } from "@/lib/bank";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { formatMs } from "@/lib/utils";

export default function DashboardPage() {
  const profile = useProfile();
  const sessions = useDailySessions();
  const progress = useProgress();
  const history = useTestHistory();
  const dayState = useDayState();
  const user = useUser();

  const loading = profile.isLoading || sessions.isLoading || progress.isLoading || history.isLoading;

  const prog = progress.data ?? [];
  const mastered = prog.filter((p) => p.status === "mastered").length;
  const needsReview = prog.filter((p) => p.status === "needs_review").length;

  // "Covered" = words actually TESTED (they have a bucket), so it always matches
  // Mastered + Needs review. Opening Learn without testing doesn't inflate it.
  const coveredCount = prog.length;
  const coveredPct = Math.round((coveredCount / TOTAL_WORDS) * 1000) / 10;

  const wpd = profile.data?.words_per_day ?? 150;
  const allCovered = coveredCount >= TOTAL_WORDS;
  const daysLeft = Math.ceil((TOTAL_WORDS - coveredCount) / wpd);

  const tests = history.data ?? [];
  const streak = computeStreak(tests.map((t) => t.created_at));

  // Today's task card content, driven by the one-day-at-a-time state.
  const ds = dayState.data;
  const today = (() => {
    if (!ds) return { eyebrow: "Loading…", title: "Preparing your day", cta: "Open", href: "/learn", disabled: true };
    if (ds.kind === "learn_pending")
      return { eyebrow: `Day ${ds.session.day_number} in progress`, title: `Learn & test ${ds.session.word_ids.length} words`, cta: "Continue", href: "/learn", disabled: false };
    if (ds.kind === "ready")
      return { eyebrow: `Day ${ds.dayNumber} is ready`, title: `Start your next ${wpd} words`, cta: "Start", href: "/learn", disabled: false };
    if (ds.kind === "locked")
      return { eyebrow: "Done for today ✅", title: "Next batch unlocks tomorrow", cta: "Browse words", href: "/words", disabled: false, locked: true };
    return { eyebrow: "All 5,000 covered 🎉", title: "Browse your words", cta: "Go to Words", href: "/words", disabled: false };
  })();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            {greeting()}{user.data?.name ? `, ${user.data.name}` : ""} 👋
          </h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {allCovered ? "All words covered — keep revising your weak ones." : `~${daysLeft} days to cover all ${TOTAL_WORDS.toLocaleString()} words at ${wpd}/day.`}
          </p>
        </div>
        <Badge variant="outline" className="gap-1.5">
          <Flame className="h-3.5 w-3.5 text-[var(--color-warning)]" /> {streak}-day streak
        </Badge>
      </header>

      {/* Today's task */}
      <Card className="overflow-hidden border-0 bg-[var(--color-primary)] text-[var(--color-primary-foreground)] shadow-lg">
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="flex items-center gap-1.5 text-sm/relaxed opacity-80">
              {today.locked && <Clock className="h-3.5 w-3.5" />}
              {today.eyebrow}
            </p>
            <h2 className="mt-1 text-xl font-bold sm:text-2xl">{today.title}</h2>
          </div>
          <Link href={today.href} aria-disabled={today.disabled} className={today.disabled ? "pointer-events-none opacity-60" : ""}>
            <Button variant="secondary" size="lg" className="w-full sm:w-auto">
              {today.cta} <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat icon={Target} label="Words covered" value={coveredCount.toLocaleString()} sub={`${coveredPct}% of ${TOTAL_WORDS.toLocaleString()}`} />
        <Stat icon={Brain} label="Mastered" value={mastered.toLocaleString()} sub="correct bucket" tone="success" />
        <Stat icon={TrendingUp} label="Needs review" value={needsReview.toLocaleString()} sub="weak bucket" tone="danger" />
        <Stat icon={CalendarDays} label="Tests taken" value={tests.length.toString()} sub={tests.length ? `avg ${avgScore(tests)}%` : "—"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Buckets donut */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Bucket split</CardTitle>
          </CardHeader>
          <CardContent>
            {mastered + needsReview === 0 ? (
              <Empty>Take your first test to fill your buckets.</Empty>
            ) : (
              <div className="flex items-center gap-6">
                <div className="h-36 w-36">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={[
                          { name: "Mastered", value: mastered },
                          { name: "Needs review", value: needsReview },
                        ]}
                        dataKey="value"
                        innerRadius={42}
                        outerRadius={66}
                        paddingAngle={2}
                        stroke="none"
                      >
                        <Cell fill="var(--color-success)" />
                        <Cell fill="var(--color-danger)" />
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2 text-sm">
                  <Legend color="var(--color-success)" label="Mastered" value={mastered} />
                  <Legend color="var(--color-danger)" label="Needs review" value={needsReview} />
                </div>
              </div>
            )}
            <div className="mt-4">
              <div className="mb-1 flex justify-between text-xs text-[var(--color-muted-foreground)]">
                <span>Overall progress</span>
                <span>{coveredPct}%</span>
              </div>
              <Progress value={coveredPct} />
            </div>
          </CardContent>
        </Card>

        {/* Recent tests */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Daily tests</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Empty>Loading…</Empty>
            ) : tests.length === 0 ? (
              <Empty>No tests yet. Your scored daily tests will appear here.</Empty>
            ) : (
              <ul className="divide-y divide-[var(--color-border)]">
                {tests.slice(0, 8).map((t) => (
                  <li key={t.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="text-sm font-medium">
                        {new Date(t.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        {t.kind === "revision" && <Badge variant="muted" className="ml-2">revision</Badge>}
                      </p>
                      <p className="text-xs text-[var(--color-muted-foreground)]">
                        {t.correct}/{t.total} correct · avg {formatMs(t.avg_response_ms)}
                      </p>
                    </div>
                    <ScorePill pct={Number(t.score_pct)} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub: string;
  tone?: "success" | "danger";
}) {
  const color = tone === "success" ? "var(--color-success)" : tone === "danger" ? "var(--color-danger)" : "var(--color-primary)";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `color-mix(in oklch, ${color} 15%, transparent)`, color }}>
          <Icon className="h-4 w-4" />
        </div>
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        <p className="text-xs font-medium">{label}</p>
        <p className="text-[0.7rem] text-[var(--color-muted-foreground)]">{sub}</p>
      </CardContent>
    </Card>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-3 w-3 rounded-full" style={{ background: color }} />
      <span className="font-medium">{value}</span>
      <span className="text-[var(--color-muted-foreground)]">{label}</span>
    </div>
  );
}

function ScorePill({ pct }: { pct: number }) {
  const variant = pct >= 80 ? "success" : pct >= 50 ? "warning" : "danger";
  return <Badge variant={variant} className="tabular-nums">{pct}%</Badge>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-[var(--color-muted-foreground)]">{children}</p>;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function avgScore(tests: { score_pct: number }[]): number {
  if (!tests.length) return 0;
  return Math.round(tests.reduce((s, t) => s + Number(t.score_pct), 0) / tests.length);
}

function computeStreak(dates: string[]): number {
  if (!dates.length) return 0;
  const days = new Set(dates.map((d) => new Date(d).toDateString()));
  let streak = 0;
  const cur = new Date();
  // allow today or yesterday to start the streak
  if (!days.has(cur.toDateString())) cur.setDate(cur.getDate() - 1);
  while (days.has(cur.toDateString())) {
    streak++;
    cur.setDate(cur.getDate() - 1);
  }
  return streak;
}
