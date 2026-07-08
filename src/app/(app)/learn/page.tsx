"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock,
  GraduationCap,
  Loader2,
  RotateCw,
  Volume2,
  X,
} from "lucide-react";
import { getTodaySession, type DayState } from "@/lib/queries";
import { getWord, loadQuestionsForWords, loadWordDetail } from "@/lib/bank";
import { readKnown, writeKnown } from "@/lib/learn-known";
import { useProfile, useSupabase } from "@/lib/hooks";
import type { DailySession, LocalAnswer, Question, Word, WordDetail } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const idxKey = (sessionId: string) => `lexica:learn:${sessionId}`;

// Prefer a female English voice (like Google's dictionary pronunciation).
// Voice availability varies by OS/browser, so we match known female voice names
// and fall back gracefully. undefined = not resolved yet (voices load async).
let cachedVoice: SpeechSynthesisVoice | null | undefined;

const FEMALE_HINTS = [
  "google us english",
  "google uk english female",
  "samantha",
  "microsoft zira",
  "microsoft aria",
  "microsoft jenny",
  "victoria",
  "karen",
  "moira",
  "tessa",
  "fiona",
  "serena",
  "allison",
  "susan",
  "female",
];

function pickFemaleVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null; // not loaded yet
  const en = voices.filter((v) => v.lang?.toLowerCase().startsWith("en"));
  const pool = en.length ? en : voices;
  for (const hint of FEMALE_HINTS) {
    const v = pool.find((x) => x.name.toLowerCase().includes(hint));
    if (v) return v;
  }
  return (
    pool.find((v) => v.lang.toLowerCase() === "en-us") ??
    pool.find((v) => v.lang.toLowerCase() === "en-gb") ??
    pool[0] ??
    null
  );
}

function resolveVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice !== undefined) return cachedVoice;
  const v = pickFemaleVoice();
  if (v) cachedVoice = v; // cache once voices are available
  return v;
}

// Speak a word aloud via the browser's built-in text-to-speech (female voice).
function speak(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = 0.9;
  const voice = resolveVoice();
  if (voice) u.voice = voice;
  window.speechSynthesis.speak(u);
}

type Quiz = {
  question: Question | null;
  loading: boolean;
  selected: number | null;
  isCorrect: boolean | null;
  startMs: number;
};

export default function LearnPage() {
  const sb = useSupabase();
  const router = useRouter();
  const profile = useProfile();
  const [session, setSession] = useState<DailySession | null>(null);
  const [state, setState] = useState<DayState | null>(null);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);

  const [idx, setIdx] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<WordDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [known, setKnown] = useState<LocalAnswer[]>([]);
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

  // Warm up TTS voices (Chrome populates them asynchronously) so the female
  // voice is selected before the first speaker tap.
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const refresh = () => {
      cachedVoice = undefined;
      resolveVoice();
    };
    refresh();
    window.speechSynthesis.addEventListener?.("voiceschanged", refresh);
    return () => window.speechSynthesis.removeEventListener?.("voiceschanged", refresh);
  }, []);

  // Restore card position + the "already known" buffer for this session.
  useEffect(() => {
    if (!session) return;
    restored.current = false;
    try {
      const raw = localStorage.getItem(idxKey(session.id));
      const savedIdx = raw ? (JSON.parse(raw).idx as number) : 0;
      const max = Math.max(0, session.word_ids.length - 1);
      setIdx(Math.min(savedIdx ?? 0, max));
    } catch {
      setIdx(0);
    }
    setKnown(readKnown(session.id));
    setExpanded(false);
    setQuiz(null);
    restored.current = true;
  }, [session]);

  // Persist card position.
  useEffect(() => {
    if (!session || !restored.current) return;
    localStorage.setItem(idxKey(session.id), JSON.stringify({ idx }));
  }, [session, idx]);

  const words: Word[] = useMemo(
    () => (session?.word_ids ?? []).map((id) => getWord(id)).filter((w): w is Word => !!w),
    [session],
  );

  const word = words[idx];

  // Load rich detail (phonetic + meanings + examples) for the current word.
  useEffect(() => {
    if (!word) return;
    let alive = true;
    setDetail(null);
    setDetailLoading(true);
    loadWordDetail(word.id)
      .then((d) => alive && setDetail(d))
      .catch(() => alive && setDetail(null))
      .finally(() => alive && setDetailLoading(false));
    return () => {
      alive = false;
    };
  }, [word]);

  if (loading || profile.isLoading)
    return (
      <Center>
        <Loader2 className="h-6 w-6 animate-spin" />
      </Center>
    );

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

  const knownSet = new Set(known.map((k) => k.question.wordId));
  const isKnown = knownSet.has(word.id);
  const progressPct = ((idx + (done ? 1 : 0)) / words.length) * 100;
  const isLast = idx === words.length - 1;
  const remaining = words.length - knownSet.size;

  function next() {
    setExpanded(false);
    setQuiz(null);
    if (isLast) setDone(true);
    else setIdx((i) => i + 1);
  }
  function prev() {
    setExpanded(false);
    setQuiz(null);
    setIdx((i) => Math.max(0, i - 1));
  }

  // "I know this" -> instantly quiz the student on this word. Always ask
  // word -> meaning (w2m): the word is the prompt (already on the card), and the
  // MEANING is the answer, so the card never leaks the answer. This is only
  // offered before the meaning is revealed, keeping it a fair blind check.
  async function startQuiz() {
    setQuiz({ question: null, loading: true, selected: null, isCorrect: null, startMs: 0 });
    try {
      const byWord = await loadQuestionsForWords([word.id]);
      const qs = byWord.get(word.id) ?? [];
      const q = qs.find((x) => x.direction === "w2m") ?? qs[0] ?? null;
      if (!q) {
        // No question available — just reveal the meaning instead.
        setQuiz(null);
        setExpanded(true);
        return;
      }
      setQuiz({ question: q, loading: false, selected: null, isCorrect: null, startMs: performance.now() });
    } catch {
      setQuiz(null);
      setExpanded(true);
    }
  }

  function chooseQuiz(i: number) {
    if (!quiz?.question || quiz.selected !== null) return;
    const responseMs = Math.round(performance.now() - quiz.startMs);
    const isCorrect = i === quiz.question.correctIndex;
    setQuiz({ ...quiz, selected: i, isCorrect });

    if (isCorrect) {
      const ans: LocalAnswer = {
        question: quiz.question,
        selectedIndex: i,
        selectedWordId: quiz.question.optionWordIds[i] ?? null,
        isCorrect: true,
        responseMs,
        alreadyKnown: true,
      };
      const nextKnown = [...known.filter((k) => k.question.wordId !== word.id), ans];
      setKnown(nextKnown);
      writeKnown(session!.id, nextKnown);
      setTimeout(() => next(), 900);
    } else {
      // Wrong: reveal the full meaning so they actually learn it; it stays for the daily test.
      setExpanded(true);
    }
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
                You reviewed {words.length} words
                {knownSet.size ? ` · already knew ${knownSet.size}` : ""}.{" "}
                {remaining > 0
                  ? `Time to test the remaining ${remaining}.`
                  : "You aced them all — finish to lock in your score."}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Button size="lg" onClick={() => router.push(`/test?session=${session.id}`)}>
                {remaining > 0 ? `Take the ${remaining}-question test` : "Finish & score"}{" "}
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setDone(false);
                  setIdx(0);
                }}
              >
                <RotateCw className="h-4 w-4" /> Review again
              </Button>
            </div>
          </CardContent>
        </Card>
      </Center>
    );

  const quizzing = quiz !== null;

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Learn — Day {session.day_number}</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Card {idx + 1} of {words.length}
            {knownSet.size ? ` · ${knownSet.size} known` : ""}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => router.push(`/test?session=${session.id}`)}>
          Skip to test
        </Button>
      </div>
      <Progress value={progressPct} />

      <Card className="min-h-[18rem] animate-in" key={word.id}>
        <CardContent className="p-0">
          {/* Word header — always visible */}
          <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] p-5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h2 className="text-2xl font-bold tracking-tight md:text-3xl">{word.word}</h2>
                <button
                  type="button"
                  onClick={() => speak(word.word)}
                  aria-label={`Pronounce ${word.word}`}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-muted)] hover:text-[var(--color-primary)]"
                >
                  <Volume2 className="h-4.5 w-4.5" />
                </button>
              </div>
              <p className="mt-0.5 flex items-center gap-2 text-sm text-[var(--color-muted-foreground)]">
                {detail?.phonetic && <span className="font-mono">{detail.phonetic}</span>}
                <Badge variant="muted">{word.posLabel}</Badge>
              </p>
            </div>
            {isKnown && (
              <Badge variant="success" className="shrink-0 gap-1">
                <Check className="h-3.5 w-3.5" /> Knew it
              </Badge>
            )}
          </div>

          {/* Body: quiz takes over when active, else the dictionary panel */}
          {quizzing ? (
            <QuizPanel quiz={quiz!} onChoose={chooseQuiz} detail={detail} onNext={next} />
          ) : (
            <DictionaryPanel
              expanded={expanded}
              detail={detail}
              detailLoading={detailLoading}
              fallbackDefinition={word.definition}
              onReveal={() => setExpanded(true)}
            />
          )}
        </CardContent>
      </Card>

      {/* Action row — hidden during the quiz */}
      {!quizzing && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={prev} disabled={idx === 0}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            {isKnown ? (
              <Button variant="success" className="flex-1" disabled>
                <Check className="h-4 w-4" /> Already known
              </Button>
            ) : !expanded ? (
              <Button variant="outline" className="flex-1" onClick={startQuiz}>
                <Check className="h-4 w-4" /> I know this
              </Button>
            ) : (
              <Button variant="outline" className="flex-1" disabled>
                Tested in daily test
              </Button>
            )}
            <Button className="flex-1" onClick={next}>
              {isLast ? "Finish" : "Next"} <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
          {!isKnown && !expanded && (
            <p className="text-center text-xs text-[var(--color-muted-foreground)]">
              Sure you know it? Tap <strong>I know this</strong> to prove it <em>before</em> revealing the meaning.
            </p>
          )}
          {!isKnown && expanded && (
            <p className="text-center text-xs text-[var(--color-muted-foreground)]">
              You revealed the meaning — this word will be checked in your daily test.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---- The Google-dictionary style meaning panel ----
function DictionaryPanel({
  expanded,
  detail,
  detailLoading,
  fallbackDefinition,
  onReveal,
}: {
  expanded: boolean;
  detail: WordDetail | null;
  detailLoading: boolean;
  fallbackDefinition: string;
  onReveal: () => void;
}) {
  if (!expanded)
    return (
      <button onClick={onReveal} className="flex min-h-[10rem] w-full flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-sm text-[var(--color-muted-foreground)]">Tap to reveal the meaning</p>
      </button>
    );

  const meanings = detail?.meanings?.length
    ? detail.meanings
    : [{ pos: "", definition: fallbackDefinition, examples: [] as string[] }];

  return (
    <div className="max-h-[26rem] space-y-5 overflow-y-auto p-5">
      {detailLoading && !detail && (
        <div className="flex items-center gap-2 text-sm text-[var(--color-muted-foreground)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      )}
      {meanings.map((m, i) => (
        <div key={i} className="space-y-1.5">
          <div className="flex items-baseline gap-2">
            {meanings.length > 1 && (
              <span className="text-sm font-bold text-[var(--color-primary)]">{i + 1}.</span>
            )}
            {m.pos && <span className="text-xs italic text-[var(--color-muted-foreground)]">{m.pos}</span>}
          </div>
          <p className="text-base leading-relaxed">{m.definition}</p>
          {m.examples?.map((ex, j) => (
            <p
              key={j}
              className="border-l-2 border-[var(--color-border)] pl-3 text-sm italic leading-relaxed text-[var(--color-muted-foreground)]"
            >
              &ldquo;{ex}&rdquo;
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}

// ---- The inline "prove you know it" quiz ----
function QuizPanel({
  quiz,
  onChoose,
  detail,
  onNext,
}: {
  quiz: Quiz;
  onChoose: (i: number) => void;
  detail: WordDetail | null;
  onNext: () => void;
}) {
  if (quiz.loading || !quiz.question)
    return (
      <div className="flex min-h-[10rem] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );

  const q = quiz.question;
  const answered = quiz.selected !== null;
  const isW2M = q.direction === "w2m";

  return (
    <div className="space-y-4 p-5">
      <div className="text-center">
        <Badge variant="default" className="mb-2">
          {isW2M ? "Choose the meaning" : "Choose the word"}
        </Badge>
        <p className={cn("leading-relaxed", isW2M ? "text-xl font-bold" : "text-base")}>{q.prompt}</p>
      </div>

      <div className="grid gap-2.5">
        {q.options.map((opt, i) => {
          const isPicked = quiz.selected === i;
          const isAnswer = i === q.correctIndex;
          const tone = !answered
            ? "idle"
            : isAnswer
              ? "correct"
              : isPicked
                ? "wrong"
                : "idle";
          return (
            <button
              key={i}
              onClick={() => onChoose(i)}
              disabled={answered}
              className={cn(
                "flex items-center gap-3 rounded-[var(--radius)] border p-3.5 text-left text-sm transition-all disabled:cursor-default",
                tone === "idle" &&
                  "border-[var(--color-border)] bg-[var(--color-card)] hover:border-[var(--color-primary)] hover:bg-[var(--color-muted)]",
                tone === "correct" && "border-[var(--color-success)] bg-[var(--color-success)]/10",
                tone === "wrong" && "border-[var(--color-danger)] bg-[var(--color-danger)]/10",
              )}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-muted)] text-xs font-bold">
                {String.fromCharCode(65 + i)}
              </span>
              <span className="flex-1">{opt}</span>
              {answered && isAnswer && <Check className="h-4 w-4 shrink-0 text-[var(--color-success)]" />}
              {answered && isPicked && !isAnswer && <X className="h-4 w-4 shrink-0 text-[var(--color-danger)]" />}
            </button>
          );
        })}
      </div>

      {answered && quiz.isCorrect && (
        <p className="text-center text-sm font-semibold text-[var(--color-success)]">Correct! ✓ Marked as known.</p>
      )}

      {answered && quiz.isCorrect === false && (
        <div className="space-y-3">
          <p className="text-center text-sm font-semibold text-[var(--color-danger)]">
            Not quite — here&apos;s what it means:
          </p>
          <div className="max-h-[16rem] space-y-3 overflow-y-auto rounded-[var(--radius)] bg-[var(--color-muted)] p-4">
            {(detail?.meanings ?? []).map((m, i) => (
              <div key={i} className="space-y-1">
                {m.pos && <span className="text-xs italic text-[var(--color-muted-foreground)]">{m.pos}</span>}
                <p className="text-sm leading-relaxed">{m.definition}</p>
                {m.examples?.[0] && (
                  <p className="text-xs italic text-[var(--color-muted-foreground)]">&ldquo;{m.examples[0]}&rdquo;</p>
                )}
              </div>
            ))}
          </div>
          <Button className="w-full" onClick={onNext}>
            Got it — next <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[60dvh] items-center justify-center text-sm text-[var(--color-muted-foreground)]">
      {children}
    </div>
  );
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
