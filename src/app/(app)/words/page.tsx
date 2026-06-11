"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { WORDS } from "@/lib/bank";
import { useProgress } from "@/lib/hooks";
import type { WordProgress, WordStatus } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, formatMs } from "@/lib/utils";

const FILTERS: { key: "all" | WordStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "needs_review", label: "Needs review" },
  { key: "mastered", label: "Mastered" },
  { key: "new", label: "Not yet seen" },
];

const STATUS_BADGE: Record<WordStatus, { label: string; variant: "success" | "danger" | "muted" }> = {
  mastered: { label: "Mastered", variant: "success" },
  needs_review: { label: "Needs review", variant: "danger" },
  learning: { label: "Learning", variant: "muted" },
  new: { label: "New", variant: "muted" },
};

const PAGE = 60;

export default function WordsPage() {
  const progress = useProgress();
  const [filter, setFilter] = useState<"all" | WordStatus>("all");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(PAGE);

  const progressMap = useMemo(() => {
    const m = new Map<number, WordProgress>();
    (progress.data ?? []).forEach((p) => m.set(p.word_id, p));
    return m;
  }, [progress.data]);

  const statusOf = (id: number): WordStatus => progressMap.get(id)?.status ?? "new";

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return WORDS.filter((w) => {
      const st = statusOf(w.id);
      if (filter !== "all" && st !== filter) return false;
      if (needle && !w.word.toLowerCase().includes(needle) && !w.definition.toLowerCase().includes(needle))
        return false;
      return true;
    });
  }, [filter, q, progressMap]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Word Bank</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Browse all {WORDS.length.toLocaleString()} words. Filter to your weak words to study them — a review round will be scheduled later.
        </p>
      </header>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setLimit(PAGE);
          }}
          placeholder="Search a word or meaning…"
          className="h-11 w-full rounded-[calc(var(--radius)-0.25rem)] border border-[var(--color-input)] bg-[var(--color-card)] pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => {
              setFilter(f.key);
              setLimit(PAGE);
            }}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
              filter === f.key
                ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                : "bg-[var(--color-muted)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <p className="text-xs text-[var(--color-muted-foreground)]">{filtered.length.toLocaleString()} words</p>

      <Card>
        <CardContent className="p-0">
          <ul className="divide-y divide-[var(--color-border)]">
            {filtered.slice(0, limit).map((w) => {
              const st = statusOf(w.id);
              const p = progressMap.get(w.id);
              const badge = STATUS_BADGE[st];
              return (
                <li key={w.id} className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium">
                      {w.word}
                      <span className="text-xs font-normal text-[var(--color-muted-foreground)]">{w.posLabel}</span>
                    </p>
                    <p className="text-sm text-[var(--color-muted-foreground)]">{w.definition}</p>
                    {p?.last_response_ms != null && (
                      <p className="mt-0.5 text-[0.7rem] text-[var(--color-muted-foreground)]">
                        last answer {formatMs(p.last_response_ms)} · {p.correct_count}/{p.attempts} correct
                      </p>
                    )}
                  </div>
                  <Badge variant={badge.variant} className="shrink-0">{badge.label}</Badge>
                </li>
              );
            })}
          </ul>
          {filtered.length === 0 && (
            <p className="p-8 text-center text-sm text-[var(--color-muted-foreground)]">No words match.</p>
          )}
          {limit < filtered.length && (
            <div className="p-4">
              <Button variant="outline" className="w-full" onClick={() => setLimit((l) => l + PAGE)}>
                Load more
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
