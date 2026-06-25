// Buffer of words a student proved they know via the inline "I know this"
// quick-check on the Learn screen. Stored locally per daily session, then
// merged into the end-of-day test submission (routed to the "already_known"
// bucket and excluded from the daily test). Mirrors how the Learn card index
// is already persisted in localStorage, so it survives refresh / tab switch.

import type { LocalAnswer } from "./types";

const key = (sessionId: string) => `lexica:known:${sessionId}`;

export function readKnown(sessionId: string): LocalAnswer[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key(sessionId));
    const arr = raw ? (JSON.parse(raw) as LocalAnswer[]) : [];
    return Array.isArray(arr) ? arr.map((a) => ({ ...a, alreadyKnown: true })) : [];
  } catch {
    return [];
  }
}

export function writeKnown(sessionId: string, answers: LocalAnswer[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(key(sessionId), JSON.stringify(answers));
}

export function knownWordIds(sessionId: string): Set<number> {
  return new Set(readKnown(sessionId).map((a) => a.question.wordId));
}

export function clearKnown(sessionId: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(key(sessionId));
}
