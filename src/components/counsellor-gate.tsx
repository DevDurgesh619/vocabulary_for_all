"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { claimCounsellor } from "@/app/(counsellor)/counsellor/actions";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function CounsellorGate() {
  const router = useRouter();
  const [secret, setSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setLoading(true);
    setErr(null);
    const res = await claimCounsellor(secret);
    setLoading(false);
    if (res.ok) {
      router.refresh(); // layout re-runs, now sees counsellor role -> dashboard
    } else {
      setErr(res.error ?? "Could not verify.");
    }
  }

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-5 py-10">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-primary)] text-[var(--color-primary-foreground)] shadow-lg">
          <ShieldCheck className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Counsellor access</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Enter the counsellor secret to open the oversight dashboard.
        </p>
      </div>
      <Card className="animate-in">
        <CardContent className="space-y-4 pt-6">
          <div className="relative">
            <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && secret && submit()}
              placeholder="Counsellor secret"
              className="h-11 w-full rounded-[calc(var(--radius)-0.25rem)] border border-[var(--color-input)] bg-[var(--color-card)] pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
            />
          </div>
          {err && <p className="text-sm text-[var(--color-danger)]">{err}</p>}
          <Button onClick={submit} size="lg" className="w-full" disabled={loading || !secret}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />} Unlock dashboard
          </Button>
          <Button variant="ghost" className="w-full" onClick={signOut}>
            Sign in as a different user
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
