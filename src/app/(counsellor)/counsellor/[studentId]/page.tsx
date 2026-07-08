"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getStudentDetail, updateStudentSettings } from "@/lib/counsellor";
import { thresholdsFromProfile } from "@/lib/analytics";
import { TOTAL_WORDS } from "@/lib/bank";
import { StudentAnalytics } from "@/components/student-analytics";
import { StudentInsights } from "@/components/student-insights";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export default function StudentDetailPage({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = use(params);
  const sb = useMemo(() => createClient(), []);
  const qc = useQueryClient();
  const detail = useQuery({ queryKey: ["student", studentId], queryFn: () => getStudentDetail(sb, studentId) });

  const [wpd, setWpd] = useState(150);
  const [fast, setFast] = useState(4000);
  const [slow, setSlow] = useState(12000);
  const [guess, setGuess] = useState(1500);
  const [unlimited, setUnlimited] = useState(false);
  const [canSetPace, setCanSetPace] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const profile = detail.data?.profile;
  useEffect(() => {
    if (profile) {
      setWpd(profile.words_per_day);
      setFast(profile.fast_threshold_ms);
      setSlow(profile.slow_threshold_ms);
      setGuess(profile.guess_threshold_ms);
      setUnlimited(profile.unlimited_daily);
      setCanSetPace(profile.can_set_pace);
    }
  }, [profile]);

  async function save() {
    setSaving(true);
    setSaved(false);
    setErr(null);
    const res = await updateStudentSettings(sb, studentId, {
      words_per_day: wpd,
      unlimited_daily: unlimited,
      can_set_pace: canSetPace,
      fast_threshold_ms: fast,
      slow_threshold_ms: slow,
      guess_threshold_ms: guess,
    });
    setSaving(false);
    if (!res.ok) return setErr(res.error ?? "Could not save.");
    await qc.invalidateQueries({ queryKey: ["student", studentId] });
    await qc.invalidateQueries({ queryKey: ["students"] });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (detail.isLoading)
    return <div className="flex min-h-[40dvh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!profile) return <p className="py-12 text-center text-sm text-[var(--color-muted-foreground)]">Student not found.</p>;

  const name = profile.display_name || profile.email || "Student";
  const mastered = detail.data!.progress.filter((p) => p.status === "mastered").length;
  const alreadyKnown = detail.data!.progress.filter((p) => p.status === "already_known").length;
  const needsReview = detail.data!.progress.filter((p) => p.status === "needs_review").length;
  const coveredPct = Math.round((detail.data!.progress.length / TOTAL_WORDS) * 1000) / 10;

  return (
    <div className="space-y-6">
      <Link href="/counsellor" className="inline-flex items-center gap-1.5 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
        <ArrowLeft className="h-4 w-4" /> All students
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{name}</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">{profile.email}</p>
        </div>
        <div className="flex gap-1.5">
          <Badge variant="muted">{coveredPct}% covered</Badge>
          <Badge variant="success">{mastered} mastered</Badge>
          <Badge variant="default">{alreadyKnown} known</Badge>
          <Badge variant="danger">{needsReview} review</Badge>
        </div>
      </header>

      {/* Per-student settings */}
      <Card>
        <CardHeader>
          <CardTitle>Plan & scoring</CardTitle>
          <CardDescription>Set this student's daily pace and response-time thresholds.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium">Words per day</span>
              <Badge variant="default" className="tabular-nums">{wpd}</Badge>
            </div>
            <input type="range" min={5} max={300} step={5} value={wpd} onChange={(e) => setWpd(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
            <div className="mt-2 flex gap-2">
              {[5, 50, 100, 150, 200].map((n) => (
                <Button key={n} variant={wpd === n ? "default" : "outline"} size="sm" onClick={() => setWpd(n)} className="flex-1">{n}</Button>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Num label="Fast ≤ (ms)" value={fast} onChange={setFast} step={500} />
            <Num label="Slow ≥ (ms)" value={slow} onChange={setSlow} step={500} />
            <Num label="Guess ≤ (ms)" value={guess} onChange={setGuess} step={250} />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border border-[var(--color-border)] p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Unlimited lessons per day</p>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                Let this student start multiple lessons &amp; tests in one day (skips the once-a-day lock). Past days are unaffected.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span
                className={cn(
                  "text-xs font-bold",
                  unlimited ? "text-[var(--color-primary)]" : "text-[var(--color-muted-foreground)]",
                )}
              >
                {unlimited ? "ON" : "OFF"}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={unlimited}
                aria-label="Toggle unlimited lessons per day"
                onClick={() => setUnlimited((v) => !v)}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors",
                  unlimited
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)]"
                    : "border-[var(--color-border)] bg-[var(--color-muted)]",
                )}
              >
                <span
                  className={cn(
                    "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
                    unlimited ? "translate-x-5" : "translate-x-0.5",
                  )}
                />
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border border-[var(--color-border)] p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Let student set their own pace</p>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                Student can change their own words-per-day (min 50) from Settings without the admin passcode. Response-time thresholds stay locked to you.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span
                className={cn(
                  "text-xs font-bold",
                  canSetPace ? "text-[var(--color-primary)]" : "text-[var(--color-muted-foreground)]",
                )}
              >
                {canSetPace ? "ON" : "OFF"}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={canSetPace}
                aria-label="Toggle student self-serve pace"
                onClick={() => setCanSetPace((v) => !v)}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors",
                  canSetPace
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)]"
                    : "border-[var(--color-border)] bg-[var(--color-muted)]",
                )}
              >
                <span
                  className={cn(
                    "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
                    canSetPace ? "translate-x-5" : "translate-x-0.5",
                  )}
                />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
              {saved ? "Saved" : "Save changes"}
            </Button>
            {err && <p className="text-sm text-[var(--color-danger)]">{err}</p>}
          </div>
        </CardContent>
      </Card>

      <StudentInsights profile={profile} dailySessions={detail.data!.dailySessions} tests={detail.data!.tests} />

      <StudentAnalytics responses={detail.data!.responses} history={detail.data!.tests} thresholds={thresholdsFromProfile(profile)} />
    </div>
  );
}

function Num({ label, value, onChange, step }: { label: string; value: number; onChange: (n: number) => void; step: number }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-[var(--color-muted-foreground)]">{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-10 w-full rounded-lg border border-[var(--color-input)] bg-[var(--color-card)] px-3 text-sm tabular-nums outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
      />
    </label>
  );
}
