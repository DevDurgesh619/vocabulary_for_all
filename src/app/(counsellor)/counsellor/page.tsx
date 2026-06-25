"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Loader2, Search, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getStudents } from "@/lib/counsellor";
import { TOTAL_WORDS } from "@/lib/bank";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function CounsellorOverview() {
  const sb = useMemo(() => createClient(), []);
  const students = useQuery({ queryKey: ["students"], queryFn: () => getStudents(sb) });
  const [q, setQ] = useState("");

  const rows = (students.data ?? []).filter((s) => {
    const n = q.trim().toLowerCase();
    if (!n) return true;
    return (s.display_name ?? "").toLowerCase().includes(n) || (s.email ?? "").toLowerCase().includes(n);
  });

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Students</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {students.data ? `${students.data.length} student${students.data.length === 1 ? "" : "s"}` : "Loading…"} · monitor progress and tune each plan.
          </p>
        </div>
      </header>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or email…"
          className="h-11 w-full rounded-[calc(var(--radius)-0.25rem)] border border-[var(--color-input)] bg-[var(--color-card)] pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
        />
      </div>

      {students.isLoading ? (
        <Center><Loader2 className="h-6 w-6 animate-spin" /></Center>
      ) : rows.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-14 text-center text-sm text-[var(--color-muted-foreground)]"><Users className="h-8 w-8" />No students yet. They'll appear here once they sign up.</CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {rows.map((s) => {
            const coveredPct = Math.round((s.words_tested / TOTAL_WORDS) * 1000) / 10;
            return (
              <Link key={s.user_id} href={`/counsellor/${s.user_id}`}>
                <Card className="transition-shadow hover:shadow-md">
                  <CardContent className="flex items-center gap-4 p-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] text-sm font-bold text-[var(--color-accent-foreground)]">
                      {initials(s.display_name || s.email || "?")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{s.display_name || s.email || "Unnamed student"}</p>
                      <p className="truncate text-xs text-[var(--color-muted-foreground)]">
                        {coveredPct}% covered · {s.words_per_day}/day · {s.tests_taken} tests
                        {s.avg_score != null ? ` · avg ${s.avg_score}%` : ""}
                      </p>
                    </div>
                    <div className="hidden shrink-0 gap-1.5 sm:flex">
                      <Badge variant="success">{s.mastered} mastered</Badge>
                      <Badge variant="default">{s.already_known ?? 0} known</Badge>
                      <Badge variant="danger">{s.needs_review} review</Badge>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]" />
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function initials(s: string): string {
  return s.replace(/@.*/, "").split(/[.\s_-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-[40dvh] items-center justify-center text-sm text-[var(--color-muted-foreground)]">{children}</div>;
}
