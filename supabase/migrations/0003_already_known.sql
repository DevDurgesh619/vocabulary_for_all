-- "Already Known" bucket: words a student proves they know via the inline
-- "I know this" quick-check on the Learn screen. Additive + backward compatible:
-- existing word_progress rows keep their status; only NEW results use the new value.

-- ============================================================
-- Allow the new status value on word_progress.
-- ============================================================
alter table public.word_progress
  drop constraint if exists word_progress_status_check;
alter table public.word_progress
  add constraint word_progress_status_check
  check (status in ('new','learning','mastered','needs_review','already_known'));

-- ============================================================
-- Surface the new bucket on the counsellor overview.
-- Drop + recreate (CREATE OR REPLACE VIEW can't insert a column mid-list).
-- Views hold no data, so dropping is safe; RLS/security_invoker is reapplied below.
-- ============================================================
drop view if exists public.student_overview;
create view public.student_overview with (security_invoker = on) as
select
  p.user_id,
  p.email,
  p.display_name,
  p.words_per_day,
  p.created_at,
  coalesce(wp.mastered, 0)        as mastered,
  coalesce(wp.needs_review, 0)    as needs_review,
  coalesce(wp.already_known, 0)   as already_known,
  coalesce(wp.words_tested, 0)    as words_tested,
  coalesce(ts.tests_taken, 0)     as tests_taken,
  ts.avg_score,
  ts.last_tested_at
from public.profiles p
left join (
  select user_id,
    count(*) filter (where status = 'mastered')      as mastered,
    count(*) filter (where status = 'needs_review')  as needs_review,
    count(*) filter (where status = 'already_known') as already_known,
    count(*)                                          as words_tested
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
