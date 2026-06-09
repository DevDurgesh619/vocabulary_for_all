-- Vocabulary Mastery — schema + Row Level Security.
-- Single-student app: every row belongs to the signed-in user (auth.uid()).
-- The static question bank ships in the app bundle; only user progress lives here.

-- ============================================================
-- profiles : per-user settings (1 row per auth user)
-- ============================================================
create table if not exists public.profiles (
  user_id           uuid primary key references auth.users (id) on delete cascade,
  words_per_day     int  not null default 150 check (words_per_day between 5 and 500),
  fast_threshold_ms int  not null default 4000   check (fast_threshold_ms between 500 and 60000),
  slow_threshold_ms int  not null default 12000  check (slow_threshold_ms between 1000 and 120000),
  guess_threshold_ms int not null default 1500   check (guess_threshold_ms between 200 and 10000),
  settings          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ============================================================
-- daily_sessions : one batch of words learned on a given day
-- word_ids = the words.json ids covered that day (default 150)
-- ============================================================
create table if not exists public.daily_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  day_number  int  not null,                 -- 1, 2, 3 ...
  word_ids    int[] not null,                -- ids from words.json
  status      text not null default 'learning' check (status in ('learning','tested')),
  created_at  timestamptz not null default now(),
  unique (user_id, day_number)
);

-- ============================================================
-- test_sessions : one completed test (daily or revision retake)
-- ============================================================
create table if not exists public.test_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  daily_session_id uuid references public.daily_sessions (id) on delete set null,
  kind             text not null default 'daily' check (kind in ('daily','revision')),
  attempt_number   int  not null default 1,
  total            int  not null,
  correct          int  not null,
  score_pct        numeric(5,2) not null,
  avg_response_ms  int  not null,
  created_at       timestamptz not null default now()
);

-- ============================================================
-- question_responses : every answered MCQ (drives all analytics)
-- ============================================================
create table if not exists public.question_responses (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  test_session_id uuid not null references public.test_sessions (id) on delete cascade,
  word_id         int  not null,
  question_id     text not null,                       -- e.g. "1-w2m"
  direction       text not null check (direction in ('w2m','m2w')),
  selected_index  int,                                 -- null = skipped/timed out
  selected_word_id int,                                -- which option was chosen (confusion analysis)
  is_correct      boolean not null,
  response_ms     int not null,
  answered_at     timestamptz not null default now()
);

-- ============================================================
-- word_progress : materialized per-word status for fast queries
-- (the two "buckets": mastered vs needs_review, + fluency tier)
-- ============================================================
create table if not exists public.word_progress (
  user_id          uuid not null references auth.users (id) on delete cascade,
  word_id          int  not null,
  status           text not null default 'new'
                     check (status in ('new','learning','mastered','needs_review')),
  fluency_tier     text check (fluency_tier in ('mastered','developing','needs_reinforcement','at_risk')),
  attempts         int  not null default 0,
  correct_count    int  not null default 0,
  last_correct     boolean,
  best_response_ms int,
  last_response_ms int,
  last_tested_at   timestamptz,
  updated_at       timestamptz not null default now(),
  primary key (user_id, word_id)
);

-- ---------- indexes ----------
create index if not exists idx_test_sessions_user      on public.test_sessions (user_id, created_at desc);
create index if not exists idx_responses_user          on public.question_responses (user_id);
create index if not exists idx_responses_session       on public.question_responses (test_session_id);
create index if not exists idx_responses_word          on public.question_responses (user_id, word_id);
create index if not exists idx_word_progress_status    on public.word_progress (user_id, status);

-- ============================================================
-- Row Level Security : a user can only touch their own rows
-- ============================================================
alter table public.profiles           enable row level security;
alter table public.daily_sessions     enable row level security;
alter table public.test_sessions      enable row level security;
alter table public.question_responses enable row level security;
alter table public.word_progress      enable row level security;

do $$
declare t text;
begin
  foreach t in array array['profiles','daily_sessions','test_sessions','question_responses','word_progress']
  loop
    execute format('drop policy if exists "own_select" on public.%I;', t);
    execute format('drop policy if exists "own_insert" on public.%I;', t);
    execute format('drop policy if exists "own_update" on public.%I;', t);
    execute format('drop policy if exists "own_delete" on public.%I;', t);

    if t = 'profiles' then
      execute format('create policy "own_select" on public.%I for select using (auth.uid() = user_id);', t);
      execute format('create policy "own_insert" on public.%I for insert with check (auth.uid() = user_id);', t);
      execute format('create policy "own_update" on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id);', t);
    else
      execute format('create policy "own_select" on public.%I for select using (auth.uid() = user_id);', t);
      execute format('create policy "own_insert" on public.%I for insert with check (auth.uid() = user_id);', t);
      execute format('create policy "own_update" on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id);', t);
      execute format('create policy "own_delete" on public.%I for delete using (auth.uid() = user_id);', t);
    end if;
  end loop;
end $$;

-- ============================================================
-- Auto-create a profile row when a new auth user signs up
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
