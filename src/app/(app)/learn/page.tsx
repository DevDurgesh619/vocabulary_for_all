"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Clock, GraduationCap, Loader2, RotateCw } from "lucide-react";
import { getTodaySession, type DayState } from "@/lib/queries";
import { getWord } from "@/lib/bank";
import { useProfile, useSupabase } from "@/lib/hooks";
import type { DailySession, Word } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

const storeKey = (sessionId: string) => `lexica:learn:${sessionId}`;

export default function LearnPage() {
  const sb = useSupabase();
  const router = useRouter();
  const profile = useProfile();
  const [session, setSession] = useState<DailySession | null>(null);
  const [state, setState] = useState<DayState | null>(null);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);

  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState<Set<number>>(new Set());
  const restored = useRef(false);

  useEffect(() => {
    if (!profile.data) return;
    (async () => {
      setLoading(true);
      const { session: s, state: st } = await getTodaySession(sb, profile.data!);
      setState(st);
      setSession(s);
      setLoading(false);
    })();
  }, [profile.data, sb]);

  // Restore the card position + "known" marks for this session (survives refresh / tab switch).
  useEffect(() => {
    if (!session) return;
    restored.current = false;
    try {
      const raw = localStorage.getItem(storeKey(session.id));
      if (raw) {
        const saved = JSON.parse(raw) as { idx: number; known: number[] };
        const max = Math.max(0, session.word_ids.length - 1);
        setIdx(Math.min(saved.idx ?? 0, max));
        setKnown(new Set(saved.known ?? []));
      } else {
        setIdx(0);
        setKnown(new Set());
      }
    } catch {
      setIdx(0);
    }
    restored.current = true;
  }, [session]);

  // Persist progress whenever it changes.
  useEffect(() => {
    if (!session || !restored.current) return;
    localStorage.setItem(storeKey(session.id), JSON.stringify({ idx, known: [...known] }));
  }, [session, idx, known]);

  const words: Word[] = useMemo(
    () => (session?.word_ids ?? []).map((id) => getWord(id)).filter((w): w is Word => !!w),
    [session],
  );

  if (loading || profile.isLoading) return <Center><Loader2 className="h-6 w-6 animate-spin" /></Center>;

  if (state?.kind === "all_done")
    return (
      <Notice icon={GraduationCap} title="All 5,000 words covered! 🎉">
        <p>Your weak words are saved. A review round for them will be scheduled later.</p>
        <Button onClick={() => router.push("/words")}>Browse your words</Button>
      </Notice>
    );

  if (state?.kind === "locked")
    return (
      <Notice icon={Clock} title="You're done for today ✅">
        <p>
          You finished today&apos;s learning and test. Come back <strong>tomorrow</strong> for the next batch — one
          day at a time keeps it sticky.
        </p>
        <div className="flex flex-col gap-2 pt-1">
          <Button onClick={() => router.push("/dashboard")}>Back to dashboard</Button>
          <Button variant="ghost" onClick={() => router.push("/words")}>
            Browse your words
          </Button>
        </div>
      </Notice>
    );

  if (!session || words.length === 0) return <Center>Nothing to learn right now.</Center>;

  const word = words[idx];
  const progressPct = ((idx + (done ? 1 : 0)) / words.length) * 100;
  const isLast = idx === words.length - 1;

  function next() {
    setFlipped(false);
    if (isLast) setDone(true);
    else setIdx((i) => i + 1);
  }
  function prev() {
    setFlipped(false);
    setIdx((i) => Math.max(0, i - 1));
  }
  function toggleKnown() {
    setKnown((k) => {
      const n = new Set(k);
      if (n.has(word.id)) n.delete(word.id);
      else n.add(word.id);
      return n;
    });
  }

  if (done)
    return (
      <Center>
        <Card className="max-w-md text-center animate-in">
          <CardContent className="space-y-4 pt-6">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-success)]/15 text-[var(--color-success)]">
              <Check className="h-7 w-7" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Day {session.day_number} learned</h2>
              <p className="text-sm text-[var(--color-muted-foreground)]">
                You reviewed {words.length} words{known.size ? ` · marked ${known.size} as known` : ""}. Time to test them.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Button size="lg" onClick={() => router.push(`/test?session=${session.id}`)}>
                Take the {words.length}-question test <ArrowRight className="h-4 w-4" />
              </Button>
              <Button variant="ghost" onClick={() => { setDone(false); setIdx(0); }}>
                <RotateCw className="h-4 w-4" /> Review again
              </Button>
            </div>
          </CardContent>
        </Card>
      </Center>
    );

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Learn — Day {session.day_number}</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Card {idx + 1} of {words.length}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => router.push(`/test?session=${session.id}`)}>
          Skip to test
        </Button>
      </div>
      <Progress value={progressPct} />

      <button onClick={() => setFlipped((f) => !f)} className="block w-full text-left" aria-label="Flip card">
        <Card className="min-h-[16rem] cursor-pointer select-none transition-shadow hover:shadow-md">
          <CardContent className="flex min-h-[16rem] flex-col items-center justify-center gap-3 p-8 text-center">
            {!flipped ? (
              <>
                <Badge variant="muted">{word.posLabel}</Badge>
                <h2 className="text-3xl font-bold tracking-tight md:text-4xl">{word.word}</h2>
                <p className="text-xs text-[var(--color-muted-foreground)]">Tap to reveal the meaning</p>
              </>
            ) : (
              <>
                <Badge variant="muted">{word.word}</Badge>
                <p className="text-lg leading-relaxed md:text-xl">{word.definition}</p>
              </>
            )}
          </CardContent>
        </Card>
      </button>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={prev} disabled={idx === 0}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Button variant={known.has(word.id) ? "success" : "outline"} className="flex-1" onClick={toggleKnown}>
          <Check className="h-4 w-4" /> {known.has(word.id) ? "Marked known" : "I know this"}
        </Button>
        <Button className="flex-1" onClick={next}>
          {isLast ? "Finish" : "Next"} <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-[60dvh] items-center justify-center text-sm text-[var(--color-muted-foreground)]">{children}</div>;
}

function Notice({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <Center>
      <Card className="max-w-md text-center animate-in">
        <CardContent className="space-y-3 pt-6">
          <Icon className="mx-auto h-10 w-10 text-[var(--color-primary)]" />
          <h2 className="text-lg font-semibold">{title}</h2>
          <div className="space-y-3 text-sm text-[var(--color-muted-foreground)]">{children}</div>
        </CardContent>
      </Card>
    </Center>
  );
}
