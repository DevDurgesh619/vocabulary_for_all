# Lexica — Vocabulary Mastery

Learn a **5,000-word vocabulary** in daily batches (default **150/day**, configurable), take a
same-day multiple-choice test, and watch every word sort into a **Mastered** or **Needs Review**
bucket. Built around the response-time + accuracy analytics in
`Vocabulary_Learning_Analytics_Framework.docx` — a word answered _correctly and fast_ counts as
strong recall, _correct but slow_ as uncertain, _wrong and fast_ as a guess, and so on.

Mobile- and desktop-friendly responsive web app (installable PWA), single student, cloud-synced
via Supabase.

## How it works

1. **Learn** — flip through the day's _N_ words (word · part of speech · meaning).
2. **Test** — _N_ multiple-choice questions, one per word, **mixed direction** (word→meaning and
   meaning→word). Per-question response time is recorded.
3. **Buckets** — correct answers → _Mastered_, wrong answers → _Needs Review_. Every word also gets
   a fluency tier (Mastered / Developing / Needs Reinforcement / At Risk).
4. **Dashboard** — progress toward 5,000, streak, bucket split, and every daily test with its score.
5. **Word Bank** — search/filter all words; retest your weak ones anytime.
6. **Analytics** — accuracy-vs-time scatter, hardest words, fluency tiers, score/speed trend.
7. **Revision** — once all words are covered (or anytime), retake the **same** questions to measure
   improvement.

## The question bank

The bank is a **pre-generated static asset** — no runtime/LLM API calls. Two build scripts turn the
source PDF into JSON:

```bash
npm run bank        # parse PDF -> src/data/words.json, then generate -> public/questions/*.json
```

- `scripts/build-bank/parse-pdf.mjs` → `src/data/words.json` (5,002 words; requires `pdftotext`).
- `scripts/build-bank/generate-questions.mjs` → `public/questions/chunk-*.json` (10,004 questions,
  both directions). Distractors are chosen with a **TF-IDF semantic model** over the definitions so
  wrong options are tempting same-part-of-speech "near misses", with near-synonyms excluded from the
  word→meaning direction so each question has exactly one correct answer. Output is **deterministic**
  (seeded), so retests reuse identical questions.

## Setup

### 1. Supabase

Create a project (or run locally with the Supabase CLI), then apply the schema:

```bash
supabase start                                   # local, OR use a cloud project
supabase db reset                                # applies supabase/migrations/0001_init.sql
```

The migration creates `profiles`, `daily_sessions`, `test_sessions`, `question_responses`,
`word_progress`, all with Row Level Security so a user only ever sees their own data, plus a trigger
that auto-creates a profile (words_per_day = 150) on sign-up.

### 2. Environment

```bash
cp .env.local.example .env.local
# fill NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
```

### 3. Run

```bash
npm install
npm run dev      # http://localhost:3000
```

Sign up with email + password, then start Day 1.

## Stack

Next.js (App Router) · TypeScript · Tailwind v4 · Recharts · TanStack Query · Supabase (Postgres +
Auth + RLS) · PWA.

## Project layout

```
scripts/build-bank/      PDF -> words.json -> questions/*.json generators
src/data/words.json      5,002 words (bundled)
public/questions/        question chunks (lazy-fetched) + manifest.json
supabase/migrations/     schema + RLS
src/lib/                 bank loader, analytics engine, Supabase clients, queries, hooks
src/app/(app)/           dashboard · learn · test · results · words · analytics · settings
```
