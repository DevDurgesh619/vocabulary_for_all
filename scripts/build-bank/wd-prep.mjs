// Split all words into batch input files for the parallel word-detail agents.
// Usage: node scripts/build-bank/wd-prep.mjs <inDir> [batchSize]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const words = JSON.parse(fs.readFileSync(path.join(__dirname, "../../src/data/words.json"), "utf8"));

const inDir = process.argv[2];
const batchSize = Number(process.argv[3] ?? 70);
if (!inDir) { console.error("Usage: node wd-prep.mjs <inDir> [batchSize]"); process.exit(1); }
fs.mkdirSync(inDir, { recursive: true });

const sorted = [...words].sort((a, b) => a.order - b.order);
let batch = 0;
for (let i = 0; i < sorted.length; i += batchSize, batch++) {
  const slice = sorted.slice(i, i + batchSize).map((w) => ({
    id: w.id, word: w.word, posLabel: w.posLabel, definition: w.definition,
  }));
  const name = `batch-${String(batch).padStart(3, "0")}.json`;
  fs.writeFileSync(path.join(inDir, name), JSON.stringify(slice));
}
console.log(JSON.stringify({ totalWords: sorted.length, batches: batch, batchSize }));
