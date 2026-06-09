// Generate the full MCQ question bank from src/data/words.json.
//
// For every word we build TWO questions (both directions):
//   - w2m  (word -> meaning):  prompt = word,        options = 4 definitions
//   - m2w  (meaning -> word):  prompt = definition,  options = 4 words
//
// Distractors are chosen for "AI quality" WITHOUT any runtime/LLM API:
//   * a TF-IDF model over the definitions finds semantically NEAR candidates
//     (same part of speech) so wrong options are tempting, not random;
//   * near-synonyms (very high similarity to the answer) are excluded for the
//     word->meaning direction so each question keeps exactly one correct answer.
//
// Everything is deterministic (seeded RNG) so retests reuse identical questions.
//
// Output:
//   src/data/questions/chunk-XXXX.json   (both directions, grouped by word order)
//   src/data/questions/manifest.json     ({ chunkSize, chunks, total })
//
// Run: node scripts/build-bank/generate-questions.mjs

import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const WORDS = resolve(ROOT, "src/data/words.json");
const OUT_DIR = resolve(ROOT, "public/questions"); // served as static files for lazy loading

const CHUNK_SIZE = 250; // words per chunk (each chunk holds both directions)
const NEAR_POOL = 40; // how many nearest same-POS neighbours to consider
const MAX_DEF_SIM_FOR_W2M = 0.5; // above this, a definition is too synonym-like to use as a wrong option

// ---------- deterministic RNG (mulberry32) ----------
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- text model ----------
const STOP = new Set(
  ("a an the of to in or and as for with by on at from into upon that which is are be " +
    "being been was were having have has had not no any one some such other any thing things " +
    "person who whom whose his her its their it he she they them used use using especially " +
    "etc esp also more most very much many each per off out up down over under who's like " +
    "something someone manner state act process quality being condition relating pertaining").split(/\s+/)
);

function stem(t) {
  return t
    .replace(/(ation|ions|ness|ment|ing|ies|ed|es|ly|s)$/i, "")
    .replace(/(.)\1$/, "$1"); // collapse trailing doubled consonant
}
function tokenize(text) {
  const out = [];
  for (const raw of text.toLowerCase().split(/[^a-z]+/)) {
    if (raw.length < 3 || STOP.has(raw)) continue;
    const s = stem(raw);
    if (s.length >= 3 && !STOP.has(s)) out.push(s);
  }
  return out;
}

function buildVectors(words) {
  const df = new Map();
  const tokensByWord = new Map();
  for (const w of words) {
    const toks = tokenize(w.definition);
    tokensByWord.set(w.id, toks);
    for (const t of new Set(toks)) df.set(t, (df.get(t) || 0) + 1);
  }
  const N = words.length;
  const idf = new Map();
  for (const [t, c] of df) idf.set(t, Math.log((N + 1) / (c + 1)) + 1);

  const vectors = new Map(); // id -> Map(token -> weight), L2-normalized
  for (const w of words) {
    const tf = new Map();
    for (const t of tokensByWord.get(w.id)) tf.set(t, (tf.get(t) || 0) + 1);
    const vec = new Map();
    let norm = 0;
    for (const [t, c] of tf) {
      const wt = (1 + Math.log(c)) * (idf.get(t) || 1);
      vec.set(t, wt);
      norm += wt * wt;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [t, v] of vec) vec.set(t, v / norm);
    vectors.set(w.id, vec);
  }
  return { vectors, idf };
}

function cosine(a, b) {
  // iterate the smaller vector
  const [s, l] = a.size < b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [t, v] of s) {
    const o = l.get(t);
    if (o) dot += v * o;
  }
  return dot;
}

// nearest same-POS neighbours via an inverted index (token -> word ids of same POS)
function nearestNeighbours(words, vectors) {
  const byPos = new Map();
  for (const w of words) {
    if (!byPos.has(w.pos)) byPos.set(w.pos, []);
    byPos.get(w.pos).push(w);
  }
  const neighbours = new Map(); // id -> [{id, sim}] sorted desc

  for (const [, group] of byPos) {
    // inverted index within this POS group
    const inv = new Map();
    for (const w of group) {
      for (const t of vectors.get(w.id).keys()) {
        if (!inv.has(t)) inv.set(t, []);
        inv.get(t).push(w.id);
      }
    }
    for (const w of group) {
      const vec = vectors.get(w.id);
      const candidates = new Set();
      for (const t of vec.keys()) for (const id of inv.get(t)) if (id !== w.id) candidates.add(id);
      const scored = [];
      for (const id of candidates) scored.push({ id, sim: cosine(vec, vectors.get(id)) });
      scored.sort((x, y) => y.sim - x.sim);
      neighbours.set(w.id, scored.slice(0, NEAR_POOL * 2));
    }
  }
  return { neighbours, byPos };
}

function pickDistractors({ word, neighbours, byId, byPos, allWords, rand, mode }) {
  // mode: "def" (need distinct definitions, exclude near-synonyms) or "word"
  const near = neighbours.get(word.id) || [];
  const chosen = [];
  const usedTexts = new Set([mode === "def" ? word.definition : word.word]);
  const usedIds = new Set([word.id]);

  const consider = (id, sim) => {
    if (chosen.length >= 3 || usedIds.has(id)) return;
    const cand = byId.get(id);
    if (!cand) return;
    const text = mode === "def" ? cand.definition : cand.word;
    if (usedTexts.has(text)) return;
    if (mode === "def" && sim !== undefined && sim > MAX_DEF_SIM_FOR_W2M) return; // too synonym-like
    usedTexts.add(text);
    usedIds.add(id);
    chosen.push({ id, text });
  };

  for (const n of near) consider(n.id, n.sim);

  // fallback 1: random same-POS words
  if (chosen.length < 3) {
    for (const cand of shuffle(byPos.get(word.pos), rand)) {
      if (chosen.length >= 3) break;
      consider(cand.id, undefined);
    }
  }
  // fallback 2: any POS (rare markers like conj./prep./interj. have tiny pools) —
  // guarantees every question ends up with 4 unique options.
  if (chosen.length < 3) {
    for (const cand of shuffle(allWords, rand)) {
      if (chosen.length >= 3) break;
      consider(cand.id, undefined);
    }
  }
  return chosen.slice(0, 3);
}

function main() {
  const words = JSON.parse(readFileSync(WORDS, "utf8"));
  const byId = new Map(words.map((w) => [w.id, w]));
  console.log(`Loaded ${words.length} words. Building TF-IDF model...`);

  const { vectors } = buildVectors(words);
  console.log("Computing nearest same-POS neighbours...");
  const { neighbours, byPos } = nearestNeighbours(words, vectors);

  console.log("Generating questions...");
  const questions = [];
  let w2mSynonymGuarded = 0;
  for (const word of words) {
    // ---- word -> meaning ----
    {
      const rand = rng(word.id * 2654435761);
      const distractors = pickDistractors({ word, neighbours, byId, byPos, allWords: words, rand, mode: "def" });
      const correct = { id: word.id, text: word.definition };
      const opts = shuffle([correct, ...distractors], rand);
      questions.push({
        id: `${word.id}-w2m`,
        wordId: word.id,
        direction: "w2m",
        prompt: word.word,
        promptPos: word.posLabel,
        options: opts.map((o) => o.text),
        optionWordIds: opts.map((o) => o.id),
        correctIndex: opts.findIndex((o) => o.id === word.id),
      });
    }
    // ---- meaning -> word ----
    {
      const rand = rng(word.id * 40503 + 7);
      const distractors = pickDistractors({ word, neighbours, byId, byPos, allWords: words, rand, mode: "word" });
      const correct = { id: word.id, text: word.word };
      const opts = shuffle([correct, ...distractors], rand);
      questions.push({
        id: `${word.id}-m2w`,
        wordId: word.id,
        direction: "m2w",
        prompt: word.definition,
        promptPos: word.posLabel,
        options: opts.map((o) => o.text),
        optionWordIds: opts.map((o) => o.id),
        correctIndex: opts.findIndex((o) => o.id === word.id),
      });
    }
  }

  // ---- write chunks (grouped by word order) ----
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  const chunkCount = Math.ceil(words.length / CHUNK_SIZE);
  for (let c = 0; c < chunkCount; c++) {
    const lo = c * CHUNK_SIZE + 1; // word order range [lo, hi]
    const hi = (c + 1) * CHUNK_SIZE;
    const slice = questions.filter((q) => {
      const order = byId.get(q.wordId).order;
      return order >= lo && order <= hi;
    });
    const name = `chunk-${String(c + 1).padStart(4, "0")}.json`;
    writeFileSync(resolve(OUT_DIR, name), JSON.stringify(slice));
  }
  writeFileSync(
    resolve(OUT_DIR, "manifest.json"),
    JSON.stringify({ chunkSize: CHUNK_SIZE, chunks: chunkCount, totalWords: words.length, totalQuestions: questions.length })
  );

  console.log(`Generated ${questions.length} questions across ${chunkCount} chunks -> ${OUT_DIR}`);
  console.log("Sample w2m:", questions[0]);
  console.log("Sample m2w:", questions[1]);
}

main();
