// Parse "vocabulary 1.pdf" (5000 Collegiate Words) into structured words.json.
// Re-runnable build step. Requires `pdftotext` (poppler) on PATH.
//
// Output: src/data/words.json  ->  [{ id, order, word, pos, definition }]
//
// Run: node scripts/build-bank/parse-pdf.mjs

import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const PDF = resolve(ROOT, "vocabulary 1.pdf");
const OUT = resolve(ROOT, "src/data/words.json");

// Fixed seed for the shuffled learning order — keeps daily batches/retests reproducible.
const ORDER_SEED = 0x5645434f; // "VECO"

// Deterministic RNG (mulberry32) + Fisher–Yates over [1..n].
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
function shuffledSequence(n, seed) {
  const rand = rng(seed);
  const arr = Array.from({ length: n }, (_, i) => i + 1);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Part-of-speech markers seen in this list, longest-first so "n. pl." wins over "n.".
const POS_ALTERNATION = ["n\\. pl\\.", "n\\.", "v\\.", "adj\\.", "adv\\.", "prep\\.", "conj\\.", "pron\\.", "interj\\."];
const POS_RE = new RegExp(`^([A-Za-z][A-Za-z'\\- ]*?)\\s+(${POS_ALTERNATION.join("|")})\\s+(.*)$`);

const POS_LABELS = {
  "n.": "noun",
  "n. pl.": "noun (plural)",
  "v.": "verb",
  "adj.": "adjective",
  "adv.": "adverb",
  "prep.": "preposition",
  "conj.": "conjunction",
  "pron.": "pronoun",
  "interj.": "interjection",
};

function extractText() {
  return execFileSync("pdftotext", [PDF, "-"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function isNoise(line) {
  return (
    line.startsWith("5000 Collegiate") ||
    line.startsWith("7-CD") ||
    line.includes("FreeVocabulary.com")
  );
}

function parse(text) {
  const lines = text.split("\n");
  const entries = [];
  let cur = null;
  let stop = false; // once we hit the trailing math-notes section, ignore the rest

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.includes("Math Notes") || line.includes("Square Roots") || /^Page \d+/.test(line)) {
      stop = true;
    }
    if (stop) continue;
    if (isNoise(line)) continue;

    const m = POS_RE.exec(line);
    if (m) {
      if (cur) entries.push(cur);
      cur = { word: m[1].trim(), pos: m[2], definition: m[3].trim() };
    } else if (cur) {
      cur.definition += " " + line; // continuation of a multi-line definition
    }
  }
  if (cur) entries.push(cur);
  return entries;
}

function main() {
  const text = extractText();
  const raw = parse(text);

  // Normalize + de-duplicate. `id` stays the stable alphabetical index (1..N) so saved
  // progress/results keyed by word_id remain valid across rebuilds.
  const seen = new Set();
  const words = [];
  let id = 0;
  for (const e of raw) {
    const key = e.word.toLowerCase();
    if (!e.definition || seen.has(key)) continue;
    seen.add(key);
    id += 1;
    words.push({
      id,
      order: 0, // assigned below
      word: e.word,
      pos: e.pos,
      posLabel: POS_LABELS[e.pos] ?? e.pos,
      definition: e.definition.replace(/\s+/g, " ").trim(),
    });
  }

  // `order` is the SHUFFLED learning sequence: each day's batch (consecutive orders)
  // becomes a mixed-letter set, so the correct answer can't be guessed by its first
  // letter. Deterministic (fixed seed) so daily batches and retests stay stable.
  const perm = shuffledSequence(words.length, ORDER_SEED);
  words.forEach((w, i) => (w.order = perm[i]));

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(words));

  const byPos = words.reduce((acc, w) => ((acc[w.pos] = (acc[w.pos] || 0) + 1), acc), {});
  console.log(`Parsed ${words.length} words -> ${OUT}`);
  console.log("POS distribution:", byPos);
  console.log("Sample:", words.slice(0, 2));
}

main();
