-- Run once in the SQL Editor of an existing SlaySinus Supabase project.
-- Existing candidates and votes are preserved.
begin;
alter table public.candidates drop constraint if exists candidates_nomination_id_check;
alter table public.candidates add constraint candidates_nomination_id_check
  check (nomination_id in ('drunk','deer','doe','breakthrough','project','meme','achievement','arrival','team','ragebait'));
alter table public.votes drop constraint if exists votes_nomination_id_check;
alter table public.votes add constraint votes_nomination_id_check
  check (nomination_id in ('drunk','deer','doe','breakthrough','project','meme','achievement','arrival','team','ragebait'));
commit;
