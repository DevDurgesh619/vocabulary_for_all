// Merge agent batch outputs into the chunked word-detail bank + validate coverage.
// Chunks are partitioned by word.order/250 to mirror the question bank loader.
// Usage: node scripts/build-bank/wd-merge.mjs <outDir> [--write]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const words = JSON.parse(fs.readFileSync(path.join(__dirname, "../../src/data/words.json"), "utf8"));
const byId = new Map(words.map((w) => [w.id, w]));

const CHUNK_SIZE = 250; // must match src/lib/bank.ts
const chunkForOrder = (order) => Math.floor((order - 1) / CHUNK_SIZE) + 1;

const outDir = process.argv[2];
const write = process.argv.includes("--write");
const finalDir = path.join(__dirname, "../../public/word-details");
if (!outDir) { console.error("Usage: node wd-merge.mjs <outDir> [--write]"); process.exit(1); }

const files = fs.readdirSync(outDir).filter((f) => f.endsWith(".json")).sort();
const details = new Map(); // wordId -> detail
const problems = [];

for (const f of files) {
  let arr;
  try { arr = JSON.parse(fs.readFileSync(path.join(outDir, f), "utf8")); }
  catch (e) { problems.push(`${f}: invalid JSON (${e.message})`); continue; }
  if (!Array.isArray(arr)) { problems.push(`${f}: not an array`); continue; }
  for (const e of arr) {
    const w = byId.get(e.wordId);
    if (!w) { problems.push(`${f}: unknown wordId ${e.wordId}`); continue; }
    if (!e.phonetic || !/^\/.*\/$/.test(e.phonetic)) problems.push(`${w.word} (#${e.wordId}): bad phonetic`);
    if (!Array.isArray(e.meanings) || e.meanings.length === 0) { problems.push(`${w.word} (#${e.wordId}): no meanings`); continue; }
    for (const m of e.meanings) {
      if (!m.pos || !m.definition) problems.push(`${w.word} (#${e.wordId}): meaning missing pos/definition`);
      if (!Array.isArray(m.examples) || m.examples.length === 0) problems.push(`${w.word} (#${e.wordId}): meaning has no examples`);
    }
    details.set(e.wordId, { wordId: e.wordId, phonetic: e.phonetic, meanings: e.meanings });
  }
}

const missing = words.filter((w) => !details.has(w.id)).map((w) => w.id);
console.log(JSON.stringify({
  outputFiles: files.length,
  wordsCovered: details.size,
  totalWords: words.length,
  missingCount: missing.length,
  problemCount: problems.length,
}, null, 2));
if (missing.length) console.log("MISSING ids (first 40):", missing.slice(0, 40));
if (problems.length) { console.log("PROBLEMS (first 40):"); problems.slice(0, 40).forEach((p) => console.log("  -", p)); }

if (write) {
  if (missing.length || problems.length) { console.error("\nRefusing to write: fix missing/problems first."); process.exit(1); }
  fs.mkdirSync(finalDir, { recursive: true });
  const chunks = new Map();
  for (const [wid, d] of details) {
    const c = chunkForOrder(byId.get(wid).order);
    if (!chunks.has(c)) chunks.set(c, []);
    chunks.get(c).push(d);
  }
  for (const [c, list] of chunks) {
    list.sort((a, b) => byId.get(a.wordId).order - byId.get(b.wordId).order);
    const name = `chunk-${String(c).padStart(4, "0")}.json`;
    fs.writeFileSync(path.join(finalDir, name), JSON.stringify(list));
  }
  console.log(`\nWrote ${chunks.size} chunks to public/word-details/`);
}
