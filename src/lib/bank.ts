// Loads the static vocabulary bank: words (bundled) + question chunks (lazy-fetched).

import wordsData from "@/data/words.json";
import type { Question, Word, Direction, WordDetail } from "./types";

export const WORDS = wordsData as Word[];
export const TOTAL_WORDS = WORDS.length;

const byId = new Map<number, Word>(WORDS.map((w) => [w.id, w]));
export function getWord(id: number): Word | undefined {
  return byId.get(id);
}

// Manifest values mirror scripts/build-bank/generate-questions.mjs.
const CHUNK_SIZE = 250;

const chunkCache = new Map<number, Question[]>();

async function loadChunk(chunkIndex: number): Promise<Question[]> {
  if (chunkCache.has(chunkIndex)) return chunkCache.get(chunkIndex)!;
  const name = `chunk-${String(chunkIndex).padStart(4, "0")}.json`;
  const res = await fetch(`/questions/${name}`);
  if (!res.ok) throw new Error(`Failed to load ${name}`);
  const data = (await res.json()) as Question[];
  chunkCache.set(chunkIndex, data);
  return data;
}

// Which 1-based chunk holds a given word order.
function chunkForOrder(order: number): number {
  return Math.floor((order - 1) / CHUNK_SIZE) + 1;
}

// Load every question (both directions) for the given word ids.
export async function loadQuestionsForWords(wordIds: number[]): Promise<Map<number, Question[]>> {
  const orders = wordIds.map((id) => getWord(id)?.order).filter((o): o is number => o != null);
  const chunks = new Set(orders.map(chunkForOrder));
  const loaded = await Promise.all([...chunks].map(loadChunk));
  const byWord = new Map<number, Question[]>();
  for (const list of loaded) {
    for (const q of list) {
      if (!byWord.has(q.wordId)) byWord.set(q.wordId, []);
      byWord.get(q.wordId)!.push(q);
    }
  }
  const wanted = new Set(wordIds);
  const result = new Map<number, Question[]>();
  for (const [wid, qs] of byWord) if (wanted.has(wid)) result.set(wid, qs);
  return result;
}

// ---- Word detail bank (phonetic + meanings + examples) ----
// Chunked exactly like questions (by word.order / CHUNK_SIZE), lazy-fetched.
const detailChunkCache = new Map<number, WordDetail[]>();

async function loadDetailChunk(chunkIndex: number): Promise<WordDetail[]> {
  if (detailChunkCache.has(chunkIndex)) return detailChunkCache.get(chunkIndex)!;
  const name = `chunk-${String(chunkIndex).padStart(4, "0")}.json`;
  const res = await fetch(`/word-details/${name}`);
  if (!res.ok) throw new Error(`Failed to load ${name}`);
  const data = (await res.json()) as WordDetail[];
  detailChunkCache.set(chunkIndex, data);
  return data;
}

// Rich dictionary content for one word (null if the word/chunk is unavailable).
export async function loadWordDetail(wordId: number): Promise<WordDetail | null> {
  const w = getWord(wordId);
  if (!w) return null;
  const list = await loadDetailChunk(chunkForOrder(w.order));
  return list.find((d) => d.wordId === wordId) ?? null;
}

// Deterministic per-word direction so retests reuse the same question.
// attempt lets revision optionally flip direction while staying stable.
function directionFor(wordId: number, attempt: number): Direction {
  return (wordId + attempt) % 2 === 0 ? "w2m" : "m2w";
}

// Build the test: exactly one question per word, mixed direction, stable order.
export async function buildTest(wordIds: number[], attempt = 0): Promise<Question[]> {
  const byWord = await loadQuestionsForWords(wordIds);
  const test: Question[] = [];
  for (const id of wordIds) {
    const qs = byWord.get(id);
    if (!qs || qs.length === 0) continue;
    const dir = directionFor(id, attempt);
    test.push(qs.find((q) => q.direction === dir) ?? qs[0]);
  }
  return test;
}
