// Deeper content audit over the assembled word-detail bank.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "../..");
const words = JSON.parse(fs.readFileSync(path.join(root, "src/data/words.json"), "utf8"));
const byId = new Map(words.map((w) => [w.id, w]));

const dir = path.join(root, "public/word-details");
const all = [];
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  all.push(...JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
}

// crude stem match: word minus last 2 chars (handles -ed/-s/-ing-ish), min 4 chars
function usesWord(word, sentence) {
  const w = word.toLowerCase();
  const s = sentence.toLowerCase();
  if (s.includes(w)) return true;
  const stem = w.length > 5 ? w.slice(0, w.length - 2) : w.slice(0, Math.min(4, w.length));
  return s.includes(stem);
}

let multi = 0, totalMeanings = 0, totalEx = 0, exMissingWord = 0, badPhonetic = 0, longDef = 0;
const exMissExamples = [];
for (const e of all) {
  const w = byId.get(e.wordId);
  if (e.meanings.length > 1) multi++;
  if (!/^\/.+\/$/.test(e.phonetic)) badPhonetic++;
  for (const m of e.meanings) {
    totalMeanings++;
    if (m.definition.length > 160) longDef++;
    for (const ex of m.examples) {
      totalEx++;
      if (!usesWord(w.word, ex)) { exMissingWord++; if (exMissExamples.length < 25) exMissExamples.push(`${w.word}: ${ex}`); }
    }
  }
}

console.log(JSON.stringify({
  totalWords: all.length,
  multiMeaningWords: multi,
  multiMeaningPct: Math.round((multi / all.length) * 100),
  avgMeanings: +(totalMeanings / all.length).toFixed(2),
  avgExamples: +(totalEx / all.length).toFixed(2),
  badPhonetic,
  longDefinitions: longDef,
  examplesNotUsingWord: exMissingWord,
}, null, 2));
if (exMissExamples.length) {
  console.log("\nExamples flagged as possibly not using the word (manual check — stem matcher is crude):");
  exMissExamples.forEach((x) => console.log("  -", x));
}
