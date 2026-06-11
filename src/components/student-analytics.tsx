"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { getWord } from "@/lib/bank";
import {
  TIER_LABEL,
  type Thresholds,
  fluencyTier,
  guessingProbability,
  masteryScore,
  summarize,
  wordDifficulty,
} from "@/lib/analytics";
import type { FluencyTier, QuestionResponse, TestSession } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMs } from "@/lib/utils";

const TIER_COLOR: Record<FluencyTier, string> = {
  mastered: "var(--color-success)",
  developing: "oklch(0.7 0.13 200)",
  needs_reinforcement: "var(--color-warning)",
  at_risk: "var(--color-danger)",
};

export function StudentAnalytics({
  responses,
  history,
  thresholds: t,
}: {
  responses: QuestionResponse[];
  history: TestSession[];
  thresholds: Thresholds;
}) {
  const perWord = useMemo(() => {
    const map = new Map<number, QuestionResponse[]>();
    for (const r of responses) {
      if (!map.has(r.word_id)) map.set(r.word_id, []);
      map.get(r.word_id)!.push(r);
    }
    return [...map.entries()].map(([wordId, rs]) => {
      const correct = rs.filter((r) => r.is_correct).length;
      const accuracy = correct / rs.length;
      const avgMs = Math.round(rs.reduce((s, r) => s + r.response_ms, 0) / rs.length);
      return { wordId, word: getWord(wordId)?.word ?? String(wordId), accuracy, avgMs, difficulty: wordDifficulty(accuracy, avgMs, t) };
    });
  }, [responses, t]);

  const stats = summarize(responses, t);
  const mastery = masteryScore(stats, t);
  const guessProb = guessingProbability(stats);

  const scatter = perWord.map((w) => ({ x: Math.round(w.avgMs / 1000), y: Math.round(w.accuracy * 100), z: 1, word: w.word }));
  const hardest = [...perWord].sort((a, b) => b.difficulty - a.difficulty).slice(0, 12).map((w) => ({ word: w.word, difficulty: w.difficulty }));
  const trend = [...history].reverse().map((ts, i) => ({ name: `T${i + 1}`, score: Number(ts.score_pct), avgSec: Math.round(ts.avg_response_ms / 100) / 10 }));

  const tierCounts = useMemo(() => {
    const c: Record<FluencyTier, number> = { mastered: 0, developing: 0, needs_reinforcement: 0, at_risk: 0 };
    for (const w of perWord) c[fluencyTier(w.accuracy, w.avgMs, t)]++;
    return c;
  }, [perWord, t]);

  if (responses.length === 0)
    return <Card><CardContent className="py-12 text-center text-sm text-[var(--color-muted-foreground)]">No test data yet for this student.</CardContent></Card>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPI label="Mastery score" value={`${mastery}`} sub="accuracy × speed" />
        <KPI label="Accuracy" value={`${Math.round(stats.accuracy * 100)}%`} sub={`${stats.correct}/${stats.total}`} />
        <KPI label="Avg response" value={formatMs(stats.avgMs)} sub="per question" />
        <KPI label="Guessing" value={`${Math.round(guessProb * 100)}%`} sub="fast + wrong" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Fluency tiers</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {(Object.keys(tierCounts) as FluencyTier[]).map((tier) => {
              const total = perWord.length || 1;
              const v = tierCounts[tier];
              return (
                <div key={tier}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="font-medium">{TIER_LABEL[tier]}</span>
                    <span className="text-[var(--color-muted-foreground)]">{v}</span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--color-muted)]">
                    <div className="h-full rounded-full" style={{ width: `${(v / total) * 100}%`, background: TIER_COLOR[tier] }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Accuracy vs response time</CardTitle></CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer>
                <ScatterChart margin={{ top: 8, right: 8, bottom: 16, left: -16 }}>
                  <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                  <XAxis type="number" dataKey="x" unit="s" fontSize={11} stroke="var(--color-muted-foreground)" />
                  <YAxis type="number" dataKey="y" unit="%" domain={[0, 100]} fontSize={11} stroke="var(--color-muted-foreground)" />
                  <ZAxis dataKey="z" range={[40, 40]} />
                  <Tooltip cursor={{ strokeDasharray: "3 3" }} content={<ScatterTip />} />
                  <Scatter data={scatter} fill="var(--color-primary)" fillOpacity={0.55} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Hardest words</CardTitle></CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={hardest} layout="vertical" margin={{ left: 24, right: 12 }}>
                  <XAxis type="number" domain={[0, 100]} fontSize={11} stroke="var(--color-muted-foreground)" />
                  <YAxis type="category" dataKey="word" width={84} fontSize={11} stroke="var(--color-muted-foreground)" />
                  <Tooltip content={<DiffTip />} />
                  <Bar dataKey="difficulty" radius={[0, 4, 4, 0]}>
                    {hardest.map((_, i) => <Cell key={i} fill="var(--color-danger)" fillOpacity={0.8} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Progress over tests</CardTitle></CardHeader>
          <CardContent>
            {trend.length < 2 ? (
              <p className="py-16 text-center text-sm text-[var(--color-muted-foreground)]">Needs more tests to show a trend.</p>
            ) : (
              <div className="h-56">
                <ResponsiveContainer>
                  <LineChart data={trend} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
                    <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                    <XAxis dataKey="name" fontSize={11} stroke="var(--color-muted-foreground)" />
                    <YAxis fontSize={11} stroke="var(--color-muted-foreground)" />
                    <Tooltip />
                    <Line type="monotone" dataKey="score" name="Score %" stroke="var(--color-primary)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="avgSec" name="Avg sec" stroke="var(--color-warning)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KPI({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        <p className="text-xs font-medium">{label}</p>
        <p className="text-[0.7rem] text-[var(--color-muted-foreground)]">{sub}</p>
      </CardContent>
    </Card>
  );
}

function ScatterTip({ active, payload }: { active?: boolean; payload?: { payload: { word: string; x: number; y: number } }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return <Card className="px-3 py-2 text-xs"><p className="font-medium">{p.word}</p><p className="text-[var(--color-muted-foreground)]">{p.y}% · {p.x}s</p></Card>;
}

function DiffTip({ active, payload }: { active?: boolean; payload?: { payload: { word: string; difficulty: number } }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return <Card className="px-3 py-2 text-xs"><p className="font-medium">{p.word}</p><p className="text-[var(--color-muted-foreground)]">difficulty {p.difficulty}/100</p></Card>;
}
