"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Clock, Loader2 } from "lucide-react";
import { buildTest, getWord } from "@/lib/bank";
import { submitTest } from "@/lib/queries";
import { useProfile, useSupabase } from "@/lib/hooks";
import { useQueryClient } from "@tanstack/react-query";
import type { DailySession, LocalAnswer, Question } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn, formatMs } from "@/lib/utils";

export default function TestPage() {
  return (
    <Suspense fallback={<Center><Loader2 className="h-6 w-6 animate-spin" /></Center>}>
      <TestRunner />
    </Suspense>
  );
}

function TestRunner() {
  const sb = useSupabase();
  const router = useRouter();
  const qc = useQueryClient();
  const params = useSearchParams();
  const profile = useProfile();

  const sessionId = params.get("session");
  const wordsParam = params.get("words");
  const kind = (params.get("kind") as "daily" | "revision") ?? (wordsParam ? "revision" : "daily");

  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [dailySession, setDailySession] = useState<DailySession | null>(null);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<LocalAnswer[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const [blocked, setBlocked] = useState(false);
  const startRef = useRef<number>(0);
  const lockRef = useRef(false);

  // Load the word list + build the test.
  useEffect(() => {
    (async () => {
      let wordIds: number[] = [];
      const attempt = 0; // attempt 0 keeps each word's direction stable, so retests reuse identical questions
      if (wordsParam) {
        wordIds = wordsParam.split(",").map(Number).filter(Boolean);
      } else if (sessionId) {
        const { data } = await sb.from("daily_sessions").select("*").eq("id", sessionId).maybeSingle();
        if (data) {
          const ds = data as DailySession;
          // One test per day: a finished batch can't be re-taken as a daily test.
          if (ds.status === "tested") {
            setBlocked(true);
            setQuestions([]);
            return;
          }
          setDailySession(ds);
          wordIds = ds.word_ids;
        }
      }
      const test = await buildTest(wordIds, attempt);
      setQuestions(test);
    })();
  }, [sb, sessionId, wordsParam]);

  // Per-question timer.
  useEffect(() => {
    startRef.current = performance.now();
    setElapsed(0);
    setSelected(null);
    lockRef.current = false;
    const t = setInterval(() => setElapsed(performance.now() - startRef.current), 100);
    return () => clearInterval(t);
  }, [idx]);

  const total = questions?.length ?? 0;
  const current = questions?.[idx];

  function choose(optionIndex: number) {
    if (lockRef.current || !current) return;
    lockRef.current = true;
    const responseMs = Math.round(performance.now() - startRef.current);
    setSelected(optionIndex);
    const isCorrect = optionIndex === current.correctIndex;
    const answer: LocalAnswer = {
      question: current,
      selectedIndex: optionIndex,
      selectedWordId: current.optionWordIds[optionIndex] ?? null,
      isCorrect,
      responseMs,
    };
    const nextAnswers = [...answers, answer];
    setAnswers(nextAnswers);
    setTimeout(() => {
      if (idx + 1 < total) setIdx((i) => i + 1);
      else finish(nextAnswers);
    }, 280);
  }

  async function finish(all: LocalAnswer[]) {
    if (!profile.data) return;
    setSubmitting(true);
    try {
      const { testSession } = await submitTest(sb, {
        profile: profile.data,
        answers: all,
        dailySessionId: dailySession?.id ?? null,
        kind,
      });
      await qc.invalidateQueries();
      router.replace(`/test/${testSession.id}/results`);
    } catch (e) {
      console.error(e);
      setSubmitting(false);
    }
  }

  if (blocked)
    return (
      <Center>
        <div className="flex max-w-sm flex-col items-center gap-4 text-center">
          <p>This day&apos;s test is already complete. Only one test per day — come back tomorrow for the next batch.</p>
          <Button onClick={() => router.push("/dashboard")}>Back to dashboard</Button>
        </div>
      </Center>
    );
  if (!questions || profile.isLoading) return <Center><Loader2 className="h-6 w-6 animate-spin" /></Center>;
  if (submitting) return <Center><div className="flex flex-col items-center gap-3"><Loader2 className="h-6 w-6 animate-spin" />Scoring your test…</div></Center>;
  if (total === 0) return <Center>No questions available for this test.</Center>;
  if (!current) return <Center><Loader2 className="h-6 w-6 animate-spin" /></Center>;

  const word = getWord(current.wordId);
  const isW2M = current.direction === "w2m";

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">
          Question {idx + 1} / {total}
        </span>
        <Badge variant="muted" className="gap-1 tabular-nums">
          <Clock className="h-3.5 w-3.5" /> {formatMs(elapsed)}
        </Badge>
      </div>
      <Progress value={(idx / total) * 100} />

      <Card className="animate-in" key={current.id}>
        <CardContent className="space-y-1 p-6 text-center">
          <Badge variant="default" className="mb-2">
            {isW2M ? "Choose the meaning" : "Choose the word"}
          </Badge>
          {isW2M ? (
            <>
              <h2 className="text-3xl font-bold tracking-tight">{current.prompt}</h2>
              <p className="text-xs text-[var(--color-muted-foreground)]">{word?.posLabel}</p>
            </>
          ) : (
            <p className="text-lg leading-relaxed">{current.prompt}</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3">
        {current.options.map((opt, i) => (
          <button
            key={i}
            onClick={() => choose(i)}
            disabled={selected !== null}
            className={cn(
              "flex items-center gap-3 rounded-[var(--radius)] border p-4 text-left text-sm transition-all active:scale-[0.99] disabled:cursor-default",
              selected === i
                ? "border-[var(--color-primary)] bg-[var(--color-accent)]"
                : "border-[var(--color-border)] bg-[var(--color-card)] hover:border-[var(--color-primary)] hover:bg-[var(--color-muted)]",
            )}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-muted)] text-xs font-bold">
              {String.fromCharCode(65 + i)}
            </span>
            <span>{opt}</span>
          </button>
        ))}
      </div>
      <p className="text-center text-xs text-[var(--color-muted-foreground)]">
        Answers and your score are revealed after the test.
      </p>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-[60dvh] items-center justify-center text-sm text-[var(--color-muted-foreground)]">{children}</div>;
}
