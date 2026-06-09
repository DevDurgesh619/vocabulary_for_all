"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, Home, Loader2, Sparkles, XCircle, Zap } from "lucide-react";
import { useProfile, useSupabase } from "@/lib/hooks";
import { getWord } from "@/lib/bank";
import {
  classifyResponse,
  guessingProbability,
  masteryScore,
  summarize,
  thresholdsFromProfile,
} from "@/lib/analytics";
import type { QuestionResponse, TestSession } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatMs } from "@/lib/utils";

const CLASS_META: Record<string, { label: string; tone: "success" | "warning" | "danger" }> = {
  strong: { label: "Strong", tone: "success" },
  uncertain: { label: "Knows but slow", tone: "warning" },
  misconception: { label: "Misconception", tone: "danger" },
  unknown: { label: "Doesn't know", tone: "danger" },
};

export default function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const sb = useSupabase();
  const profile = useProfile();
  const [test, setTest] = useState<TestSession | null>(null);
  const [responses, setResponses] = useState<QuestionResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: ts }, { data: rs }] = await Promise.all([
        sb.from("test_sessions").select("*").eq("id", id).maybeSingle(),
        sb.from("question_responses").select("*").eq("test_session_id", id).order("answered_at"),
      ]);
      setTest(ts as TestSession);
      setResponses((rs ?? []) as QuestionResponse[]);
      setLoading(false);
    })();
  }, [sb, id]);

  if (loading || profile.isLoading) return <Center><Loader2 className="h-6 w-6 animate-spin" /></Center>;
  if (!test) return <Center>Test not found.</Center>;

  const t = thresholdsFromProfile(profile.data);
  const stats = summarize(responses, t);
  const mastery = masteryScore(stats, t);
  const guessProb = guessingProbability(stats);
  const correct = responses.filter((r) => r.is_correct);
  const wrong = responses.filter((r) => !r.is_correct);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Hero score */}
      <Card className="overflow-hidden border-0 bg-[var(--color-primary)] text-[var(--color-primary-foreground)] shadow-lg">
        <CardContent className="p-6 text-center">
          <p className="text-sm opacity-80">Test complete</p>
          <p className="my-1 text-5xl font-extrabold tabular-nums">{Number(test.score_pct)}%</p>
          <p className="text-sm opacity-90">
            {test.correct} of {test.total} correct · avg {formatMs(test.avg_response_ms)}
          </p>
        </CardContent>
      </Card>

      {/* Insight tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile icon={Sparkles} label="Mastery score" value={`${mastery}`} />
        <Tile icon={Zap} label="Strong recall" value={`${stats.fastCorrect}`} sub="fast + correct" />
        <Tile icon={Clock} label="Avg time" value={formatMs(stats.avgMs)} />
        <Tile icon={XCircle} label="Guessing" value={`${Math.round(guessProb * 100)}%`} sub="fast + wrong" />
      </div>

      {/* Needs review bucket */}
      <Bucket
        title="Needs Review"
        icon={XCircle}
        tone="danger"
        empty="Nothing wrong — perfect run! 🎉"
        rows={wrong.map((r) => ({ r }))}
        t={t}
      />
      {/* Mastered bucket */}
      <Bucket
        title="Mastered"
        icon={CheckCircle2}
        tone="success"
        empty="No correct answers this round."
        rows={correct.map((r) => ({ r }))}
        t={t}
        collapsedCount={8}
      />

      <div className="flex gap-3">
        <Link href="/dashboard" className="flex-1">
          <Button variant="outline" className="w-full">
            <Home className="h-4 w-4" /> Dashboard
          </Button>
        </Link>
        {wrong.length > 0 && (
          <Link href={`/test?words=${wrong.map((r) => r.word_id).join(",")}&kind=revision`} className="flex-1">
            <Button className="w-full">Retest {wrong.length} weak words</Button>
          </Link>
        )}
      </div>
    </div>
  );
}

function Bucket({
  title,
  icon: Icon,
  tone,
  rows,
  empty,
  t,
  collapsedCount,
}: {
  title: string;
  icon: React.ElementType;
  tone: "success" | "danger";
  rows: { r: QuestionResponse }[];
  empty: string;
  t: ReturnType<typeof thresholdsFromProfile>;
  collapsedCount?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const color = tone === "success" ? "var(--color-success)" : "var(--color-danger)";
  const shown = collapsedCount && !expanded ? rows.slice(0, collapsedCount) : rows;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="h-[1.15rem] w-[1.15rem]" style={{ color }} />
          {title}
          <Badge variant="muted">{rows.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-2 text-sm text-[var(--color-muted-foreground)]">{empty}</p>
        ) : (
          <>
            <ul className="divide-y divide-[var(--color-border)]">
              {shown.map(({ r }) => {
                const w = getWord(r.word_id);
                const cls = classifyResponse(r.is_correct, r.response_ms, t);
                const meta = CLASS_META[cls.class];
                return (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{w?.word}</p>
                      <p className="truncate text-xs text-[var(--color-muted-foreground)]">{w?.definition}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-xs tabular-nums text-[var(--color-muted-foreground)]">{formatMs(r.response_ms)}</span>
                      <Badge variant={meta.tone}>{meta.label}</Badge>
                    </div>
                  </li>
                );
              })}
            </ul>
            {collapsedCount && rows.length > collapsedCount && (
              <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => setExpanded((e) => !e)}>
                {expanded ? "Show less" : `Show all ${rows.length}`}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Tile({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-3.5">
        <Icon className="mb-1.5 h-4 w-4 text-[var(--color-primary)]" />
        <p className="text-xl font-bold tabular-nums">{value}</p>
        <p className="text-[0.7rem] font-medium">{label}</p>
        {sub && <p className="text-[0.65rem] text-[var(--color-muted-foreground)]">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-[60dvh] items-center justify-center text-sm text-[var(--color-muted-foreground)]">{children}</div>;
}
