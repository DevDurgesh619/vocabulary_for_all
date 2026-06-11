-- Counsellor role: a counsellor can read every student's data and edit any
-- student's settings, while students stay locked to their own rows.

-- ============================================================
-- profiles: add role + denormalized email/name for the overview
-- ============================================================
alter table public.profiles
  add column if not exists role text not null default 'student' check (role in ('student','counsellor')),
  add column if not exists email text,
  add column if not exists display_name text;

-- Populate email/name on new sign-ups (works for email + Google).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name')
  )
  on conflict (user_id) do nothing;
  return new;
end $$;

-- Backfill existing rows.
update public.profiles p
set email = u.email,
    display_name = coalesce(p.display_name, u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name')
from auth.users u
where u.id = p.user_id and (p.email is null or p.email <> u.email);

-- ============================================================
-- is_counsellor(): SECURITY DEFINER so reading the caller's role
-- doesn't recurse through profiles RLS.
-- ============================================================
create or replace function public.is_counsellor()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles where user_id = auth.uid() and role = 'counsellor'
  );
$$;

-- ============================================================
-- Counsellor read access (added alongside existing owner policies;
-- permissive policies combine with OR).
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['profiles','daily_sessions','test_sessions','question_responses','word_progress']
  loop
    execute format('drop policy if exists "counsellor_select" on public.%I;', t);
    execute format('create policy "counsellor_select" on public.%I for select using (public.is_counsellor());', t);
  end loop;
end $$;

-- Counsellor can update any student's profile (e.g. words_per_day, thresholds).
drop policy if exists "counsellor_update_profiles" on public.profiles;
create policy "counsellor_update_profiles" on public.profiles
  for update using (public.is_counsellor()) with check (public.is_counsellor());

-- ============================================================
-- Anti-escalation: role can only change via the service role
-- (used by the server-side claimCounsellor action). Students can't self-promote.
-- ============================================================
create or replace function public.prevent_role_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'role can only be changed by an administrator';
  end if;
  return new;
end $$;

drop trigger if exists trg_prevent_role_change on public.profiles;
create trigger trg_prevent_role_change
  before update on public.profiles
  for each row execute function public.prevent_role_change();

-- ============================================================
-- student_overview: per-student aggregates for the counsellor list.
-- security_invoker = on -> the counsellor's RLS applies (sees all students).
-- ============================================================
create or replace view public.student_overview with (security_invoker = on) as
select
  p.user_id,
  p.email,
  p.display_name,
  p.words_per_day,
  p.created_at,
  coalesce(wp.mastered, 0)      as mastered,
  coalesce(wp.needs_review, 0)  as needs_review,
  coalesce(wp.words_tested, 0)  as words_tested,
  coalesce(ts.tests_taken, 0)   as tests_taken,
  ts.avg_score,
  ts.last_tested_at
from public.profiles p
left join (
  select user_id,
    count(*) filter (where status = 'mastered')     as mastered,
    count(*) filter (where status = 'needs_review') as needs_review,
    count(*)                                         as words_tested
  from public.word_progress
  group by user_id
) wp on wp.user_id = p.user_id
left join (
  select user_id,
    count(*)                  as tests_taken,
    round(avg(score_pct), 1)  as avg_score,
    max(created_at)           as last_tested_at
  from public.test_sessions
  group by user_id
) ts on ts.user_id = p.user_id
where p.role = 'student';
