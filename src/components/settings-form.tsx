"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Lock, LogOut, ShieldCheck } from "lucide-react";
import { useProfile, useSupabase } from "@/lib/hooks";
import { lockAdmin, saveSettings, unlockAdmin } from "@/app/(app)/settings/actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function SettingsForm({ isAdmin }: { isAdmin: boolean }) {
  const sb = useSupabase();
  const router = useRouter();
  const qc = useQueryClient();
  const profile = useProfile();

  const [wpd, setWpd] = useState(150);
  const [fast, setFast] = useState(4000);
  const [slow, setSlow] = useState(12000);
  const [guess, setGuess] = useState(1500);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // admin unlock
  const [passcode, setPasscode] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [unlockErr, setUnlockErr] = useState<string | null>(null);

  const ro = !isAdmin; // read-only for students

  useEffect(() => {
    if (profile.data) {
      setWpd(profile.data.words_per_day);
      setFast(profile.data.fast_threshold_ms);
      setSlow(profile.data.slow_threshold_ms);
      setGuess(profile.data.guess_threshold_ms);
    }
  }, [profile.data]);

  async function save() {
    setSaving(true);
    setSaved(false);
    setErr(null);
    const res = await saveSettings({
      words_per_day: wpd,
      fast_threshold_ms: fast,
      slow_threshold_ms: slow,
      guess_threshold_ms: guess,
    });
    setSaving(false);
    if (!res.ok) {
      setErr(res.error ?? "Could not save.");
      return;
    }
    await qc.invalidateQueries();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function unlock() {
    setUnlocking(true);
    setUnlockErr(null);
    const ok = await unlockAdmin(passcode);
    setUnlocking(false);
    setPasscode("");
    if (ok) router.refresh();
    else setUnlockErr("Incorrect passcode.");
  }

  async function lock() {
    await lockAdmin();
    router.refresh();
  }

  async function signOut() {
    await sb.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const days = Math.ceil(5002 / clamp(wpd, 5, 500));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Settings</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {isAdmin ? "Admin mode — changes affect the learner's plan." : "These are managed by your admin."}
          </p>
        </div>
        {isAdmin ? (
          <Badge variant="success" className="gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Admin</Badge>
        ) : (
          <Badge variant="muted" className="gap-1.5"><Lock className="h-3.5 w-3.5" /> Locked</Badge>
        )}
      </header>

      {/* Admin unlock (students only) */}
      {!isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Admin access</CardTitle>
            <CardDescription>Enter the admin passcode to change the daily pace and scoring.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <input
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Admin passcode"
                className="h-10 flex-1 rounded-lg border border-[var(--color-input)] bg-[var(--color-card)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
                onKeyDown={(e) => e.key === "Enter" && unlock()}
              />
              <Button onClick={unlock} disabled={unlocking || !passcode}>
                {unlocking ? <Loader2 className="h-4 w-4 animate-spin" /> : "Unlock"}
              </Button>
            </div>
            {unlockErr && <p className="mt-2 text-sm text-[var(--color-danger)]">{unlockErr}</p>}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Daily pace</CardTitle>
          <CardDescription>How many new words are learned — and tested — each day.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Words per day</span>
            <Badge variant="default" className="tabular-nums">{wpd}</Badge>
          </div>
          <input
            type="range"
            min={25}
            max={300}
            step={25}
            value={wpd}
            disabled={ro}
            onChange={(e) => setWpd(Number(e.target.value))}
            className="w-full accent-[var(--color-primary)] disabled:opacity-50"
          />
          <div className="flex gap-2">
            {[50, 100, 150, 200].map((n) => (
              <Button key={n} variant={wpd === n ? "default" : "outline"} size="sm" disabled={ro} onClick={() => setWpd(n)} className="flex-1">
                {n}
              </Button>
            ))}
          </div>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            At {wpd}/day, all 5,002 words are covered in about <strong>{days} days</strong>. Each daily test has {wpd} questions.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Response-time thresholds</CardTitle>
          <CardDescription>Classify answers (strong / uncertain / guessing) per the analytics framework.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <NumberField label="Fast answer (≤)" hint="correct + fast = strong recall" value={fast} onChange={setFast} step={500} disabled={ro} />
          <NumberField label="Slow answer (≥)" hint="above this = uncertain / at risk" value={slow} onChange={setSlow} step={500} disabled={ro} />
          <NumberField label="Guess cutoff (≤)" hint="very fast + wrong = guessing" value={guess} onChange={setGuess} step={250} disabled={ro} />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        {isAdmin && (
          <>
            <Button onClick={save} disabled={saving} size="lg">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
              {saved ? "Saved" : "Save changes"}
            </Button>
            <Button variant="outline" onClick={lock}>
              <Lock className="h-4 w-4" /> Lock
            </Button>
          </>
        )}
        {err && <p className="text-sm text-[var(--color-danger)]">{err}</p>}
        <Button variant="ghost" onClick={signOut} className="ml-auto">
          <LogOut className="h-4 w-4" /> Sign out
        </Button>
      </div>
    </div>
  );
}

function NumberField({
  label,
  hint,
  value,
  onChange,
  step,
  disabled,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (n: number) => void;
  step: number;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-[var(--color-muted-foreground)]">{hint}</p>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-10 w-24 rounded-lg border border-[var(--color-input)] bg-[var(--color-card)] px-3 text-right text-sm tabular-nums outline-none focus:ring-2 focus:ring-[var(--color-ring)] disabled:opacity-60"
        />
        <span className="text-xs text-[var(--color-muted-foreground)]">ms</span>
      </div>
    </div>
  );
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
