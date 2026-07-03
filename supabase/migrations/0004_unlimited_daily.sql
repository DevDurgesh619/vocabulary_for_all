-- Per-student flexibility: let selected fast learners do unlimited lessons +
-- tests in a single day (bypasses the once-per-calendar-day lock). Additive and
-- OFF by default, so every existing student keeps the normal one-a-day pace and
-- no stored session/progress data is touched. A counsellor turns it on per student.

alter table public.profiles
  add column if not exists unlimited_daily boolean not null default false;

-- Only a counsellor (or the service role) may flip this flag — students cannot
-- self-grant it through the API. Mirrors prevent_role_change (migration 0002).
create or replace function public.prevent_unlimited_daily_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Block only an authenticated end-user who is NOT a counsellor (i.e. a student
  -- self-granting via the API). Counsellors (is_counsellor) and admin/SQL access
  -- (auth.uid() is null) are allowed.
  if new.unlimited_daily is distinct from old.unlimited_daily
     and auth.uid() is not null
     and not public.is_counsellor() then
    raise exception 'unlimited_daily can only be changed by a counsellor';
  end if;
  return new;
end $$;

drop trigger if exists trg_prevent_unlimited_daily_change on public.profiles;
create trigger trg_prevent_unlimited_daily_change
  before update on public.profiles
  for each row execute function public.prevent_unlimited_daily_change();
