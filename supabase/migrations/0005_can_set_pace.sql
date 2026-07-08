-- Per-student self-serve pace: let selected students set their own words-per-day
-- (minimum enforced in the app) without the admin passcode and without exposing
-- the response-time thresholds. Additive + OFF by default, so nothing changes for
-- existing students and no stored data is touched. A counsellor turns it on.

alter table public.profiles
  add column if not exists can_set_pace boolean not null default false;

-- Only a counsellor (or admin/SQL) may flip this flag — a student cannot
-- self-grant it via the API. Mirrors prevent_unlimited_daily_change (0004).
create or replace function public.prevent_can_set_pace_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.can_set_pace is distinct from old.can_set_pace
     and auth.uid() is not null
     and not public.is_counsellor() then
    raise exception 'can_set_pace can only be changed by a counsellor';
  end if;
  return new;
end $$;

drop trigger if exists trg_prevent_can_set_pace_change on public.profiles;
create trigger trg_prevent_can_set_pace_change
  before update on public.profiles
  for each row execute function public.prevent_can_set_pace_change();
