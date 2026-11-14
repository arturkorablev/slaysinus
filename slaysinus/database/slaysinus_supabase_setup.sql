-- SlaySinus 2026 — Supabase setup
-- Run this script in Supabase Dashboard -> SQL Editor -> New query.
-- This script is designed to be re-runnable.
-- IMPORTANT: Never put the Supabase service_role key into the website.

create extension if not exists pgcrypto;
grant usage on schema public to anon, authenticated;

-- 1) Core tables
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.site_settings (
  id integer primary key check (id = 1),
  voting_open boolean not null default true,
  results_published boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.site_settings (id, voting_open, results_published)
values (1, true, false)
on conflict (id) do nothing;

create table if not exists public.candidates (
  id uuid primary key default gen_random_uuid(),
  nomination_id text not null check (nomination_id in (
    'drunk', 'deer', 'doe', 'breakthrough', 'project',
    'meme', 'achievement', 'arrival', 'team', 'ragebait'
  )),
  name text not null check (char_length(trim(name)) between 1 and 60),
  note text not null default '' check (char_length(note) <= 180),
  photo_url text,
  photo_path text,
  created_at timestamptz not null default now()
);

create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  nomination_id text not null check (nomination_id in (
    'drunk', 'deer', 'doe', 'breakthrough', 'project',
    'meme', 'achievement', 'arrival', 'team', 'ragebait'
  )),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  voter_id uuid not null,
  created_at timestamptz not null default now(),
  constraint votes_one_per_voter_per_nomination unique (nomination_id, voter_id)
);

-- Extend an existing installation as well as a fresh schema.
alter table public.candidates drop constraint if exists candidates_nomination_id_check;
alter table public.candidates add constraint candidates_nomination_id_check
  check (nomination_id in ('drunk','deer','doe','breakthrough','project','meme','achievement','arrival','team','ragebait'));
alter table public.votes drop constraint if exists votes_nomination_id_check;
alter table public.votes add constraint votes_nomination_id_check
  check (nomination_id in ('drunk','deer','doe','breakthrough','project','meme','achievement','arrival','team','ragebait'));

create index if not exists candidates_nomination_idx on public.candidates(nomination_id, created_at);
create index if not exists votes_candidate_idx on public.votes(candidate_id);

-- 2) Admin check helper. The empty search_path and qualified table names are deliberate.
create or replace function public.is_slaysinus_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users au
    where au.user_id = (select auth.uid())
  );
$$;

-- 3) Public vote endpoint. The browser supplies a random persistent voter UUID.
-- It enforces one active choice per nomination for that browser profile.
-- It is suitable for a private friends' award, not for high-stakes or fraud-proof elections.
create or replace function public.cast_slaysinus_vote(
  p_nomination_id text,
  p_candidate_id uuid,
  p_voter_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_voter_id is null then
    raise exception 'Voter token is required';
  end if;

  if not exists (
    select 1 from public.site_settings ss
    where ss.id = 1 and ss.voting_open = true
  ) then
    raise exception 'Voting is closed';
  end if;

  if not exists (
    select 1 from public.candidates c
    where c.id = p_candidate_id and c.nomination_id = p_nomination_id
  ) then
    raise exception 'Candidate does not belong to this nomination';
  end if;

  insert into public.votes (nomination_id, candidate_id, voter_id)
  values (p_nomination_id, p_candidate_id, p_voter_id)
  on conflict (nomination_id, voter_id)
  do update set candidate_id = excluded.candidate_id;
end;
$$;

-- 4) Counts are only returned publicly after the organizer publishes results.
-- An authenticated admin can preview counts before publication.
create or replace function public.get_slaysinus_vote_counts()
returns table (candidate_id uuid, vote_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not coalesce((
    select ss.results_published from public.site_settings ss where ss.id = 1
  ), false) and not public.is_slaysinus_admin() then
    return;
  end if;

  return query
  select v.candidate_id, count(*)::bigint
  from public.votes v
  group by v.candidate_id;
end;
$$;

-- 5) Row Level Security and explicit grants.
alter table public.admin_users enable row level security;
alter table public.site_settings enable row level security;
alter table public.candidates enable row level security;
alter table public.votes enable row level security;

revoke all on table public.admin_users from anon, authenticated;
revoke all on table public.site_settings from anon, authenticated;
revoke all on table public.candidates from anon, authenticated;
revoke all on table public.votes from anon, authenticated;

-- Public visitors can read the candidate list and the two public event switches.
grant select on table public.site_settings to anon, authenticated;
grant select on table public.candidates to anon, authenticated;

-- Logged-in admins may manage candidates and event settings.
grant select on table public.admin_users to authenticated;
grant insert, update, delete on table public.candidates to authenticated;
grant update on table public.site_settings to authenticated;

-- Only admins can read detailed vote rows or delete votes; public visitors get aggregates via RPC.
grant select, delete on table public.votes to authenticated;

drop policy if exists "Admins can read own admin row" on public.admin_users;
create policy "Admins can read own admin row"
on public.admin_users for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Anyone can read site settings" on public.site_settings;
create policy "Anyone can read site settings"
on public.site_settings for select to anon, authenticated
using (true);

drop policy if exists "Admins can update site settings" on public.site_settings;
create policy "Admins can update site settings"
on public.site_settings for update to authenticated
using ((select public.is_slaysinus_admin()))
with check ((select public.is_slaysinus_admin()));

drop policy if exists "Anyone can read candidates" on public.candidates;
create policy "Anyone can read candidates"
on public.candidates for select to anon, authenticated
using (true);

drop policy if exists "Admins can insert candidates" on public.candidates;
create policy "Admins can insert candidates"
on public.candidates for insert to authenticated
with check ((select public.is_slaysinus_admin()));

drop policy if exists "Admins can update candidates" on public.candidates;
create policy "Admins can update candidates"
on public.candidates for update to authenticated
using ((select public.is_slaysinus_admin()))
with check ((select public.is_slaysinus_admin()));

drop policy if exists "Admins can delete candidates" on public.candidates;
create policy "Admins can delete candidates"
on public.candidates for delete to authenticated
using ((select public.is_slaysinus_admin()));

drop policy if exists "Admins can read votes" on public.votes;
create policy "Admins can read votes"
on public.votes for select to authenticated
using ((select public.is_slaysinus_admin()));

drop policy if exists "Admins can reset votes" on public.votes;
create policy "Admins can reset votes"
on public.votes for delete to authenticated
using ((select public.is_slaysinus_admin()));

-- 6) Base function permissions. The moderation extension below grants the boolean admin helper to anon for RLS.
revoke all on function public.is_slaysinus_admin() from public, anon, authenticated;
revoke all on function public.cast_slaysinus_vote(text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_slaysinus_vote_counts() from public, anon, authenticated;
grant execute on function public.is_slaysinus_admin() to authenticated;
grant execute on function public.cast_slaysinus_vote(text, uuid, uuid) to anon, authenticated;
grant execute on function public.get_slaysinus_vote_counts() to anon, authenticated;

-- 7) Public photo bucket. Only admins may upload, replace or delete photos.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('candidate-photos', 'candidate-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view SlaySinus photos" on storage.objects;
create policy "Public can view SlaySinus photos"
on storage.objects for select to anon, authenticated
using (bucket_id = 'candidate-photos');

drop policy if exists "Admins can upload SlaySinus photos" on storage.objects;
create policy "Admins can upload SlaySinus photos"
on storage.objects for insert to authenticated
with check (bucket_id = 'candidate-photos' and (select public.is_slaysinus_admin()));

drop policy if exists "Admins can update SlaySinus photos" on storage.objects;
create policy "Admins can update SlaySinus photos"
on storage.objects for update to authenticated
using (bucket_id = 'candidate-photos' and (select public.is_slaysinus_admin()))
with check (bucket_id = 'candidate-photos' and (select public.is_slaysinus_admin()));

drop policy if exists "Admins can delete SlaySinus photos" on storage.objects;
create policy "Admins can delete SlaySinus photos"
on storage.objects for delete to authenticated
using (bucket_id = 'candidate-photos' and (select public.is_slaysinus_admin()));

-- 8) Create your first administrator AFTER creating that user in Supabase Auth.
-- Replace admin@example.com with the exact email of your organizer account, then run:
-- insert into public.admin_users (user_id)
-- select id from auth.users where email = 'admin@example.com'
-- on conflict (user_id) do nothing;

-- Moderation extension (rerunnable).
-- Apply after the original setup. Existing candidates remain published.
begin;
alter table public.candidates add column if not exists is_published boolean not null default true;
alter table public.candidates add column if not exists media_type text not null default 'image';
alter table public.candidates add column if not exists media_path text;
alter table public.candidates add column if not exists submitted_by uuid;
alter table public.candidates add column if not exists vote_adjustment integer not null default 0;
alter table public.candidates drop constraint if exists candidates_media_type_check;
alter table public.candidates add constraint candidates_media_type_check check (
 media_type in ('image','video') and (media_type <> 'video' or (nomination_id in ('deer','doe','arrival','meme') and media_path is not null))
);
create index if not exists candidates_submission_limit_idx on public.candidates(submitted_by,created_at);
-- This boolean helper exposes only whether the caller is an admin.
grant execute on function public.is_slaysinus_admin() to anon,authenticated;
drop policy if exists "Anyone can read candidates" on public.candidates;
drop policy if exists "Published candidates or admin" on public.candidates;
create policy "Published candidates or admin" on public.candidates for select to anon,authenticated
 using (is_published or (select public.is_slaysinus_admin()));
-- Submitter tokens and unpublished vote adjustments are not public columns.
revoke select on public.candidates from anon,authenticated;
grant select(id,nomination_id,name,note,photo_url,photo_path,created_at,is_published,media_type,media_path) on public.candidates to anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('candidate-media','candidate-media',false,20971520,array['image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "Submit candidate media" on storage.objects;
create policy "Submit candidate media" on storage.objects for insert to anon,authenticated with check (
 bucket_id='candidate-media' and name ~ '^submissions/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|mp4|webm|mov)$'
);
drop policy if exists "Read published candidate media or admin" on storage.objects;
create policy "Read published candidate media or admin" on storage.objects for select to anon,authenticated using (
 bucket_id='candidate-media' and ((select public.is_slaysinus_admin()) or exists (
  select 1 from public.candidates c where c.media_path=storage.objects.name and c.is_published
 ))
);
drop policy if exists "Admins delete candidate media" on storage.objects;
create policy "Admins delete candidate media" on storage.objects for delete to authenticated using (
 bucket_id='candidate-media' and (select public.is_slaysinus_admin())
);

create or replace function public.submit_slaysinus_candidate(p_nomination_id text,p_name text,p_note text,p_submitter_id uuid,p_media_type text default 'image',p_media_path text default null)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_submitter_id is null or p_name is null or char_length(trim(p_name)) not between 1 and 60 or char_length(coalesce(p_note,''))>180 then raise exception 'Проверьте имя и описание'; end if;
 if p_nomination_id is null or p_nomination_id not in ('drunk','deer','doe','breakthrough','project','meme','achievement','arrival','team','ragebait') then raise exception 'Неизвестная категория'; end if;
 if p_media_type is null or p_media_type not in ('image','video') then raise exception 'Неверный тип вложения'; end if;
 if p_media_type='video' and (p_nomination_id not in ('deer','doe','arrival','meme') or p_media_path is null) then raise exception 'Видео недоступно для этой категории'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_submitter_id::text,0));
 if (select count(*) from public.candidates where submitted_by=p_submitter_id and created_at>now()-interval '1 hour')>=5 then raise exception 'Не более пяти предложений в час. Попробуйте позже.'; end if;
 if p_media_path is not null then
  if p_media_path not like 'submissions/'||p_submitter_id::text||'/%' or not exists(
   select 1 from storage.objects o where o.bucket_id='candidate-media' and o.name=p_media_path
    and case when p_media_type='video' then o.metadata->>'mimetype' in ('video/mp4','video/webm','video/quicktime') else o.metadata->>'mimetype' in ('image/jpeg','image/png','image/webp') end
  ) then raise exception 'Вложение не найдено или имеет неверный тип'; end if;
 end if;
 insert into public.candidates(nomination_id,name,note,is_published,submitted_by,media_type,media_path)
 values(p_nomination_id,trim(p_name),coalesce(p_note,''),false,p_submitter_id,p_media_type,p_media_path);
end $$;
revoke all on function public.submit_slaysinus_candidate(text,text,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.submit_slaysinus_candidate(text,text,text,uuid,text,text) to anon,authenticated;

create table if not exists public.vote_adjustment_log (
 id uuid primary key default gen_random_uuid(),candidate_id uuid references public.candidates(id) on delete set null,
 admin_id uuid,old_count bigint not null,new_count bigint not null,created_at timestamptz not null default now()
);
alter table public.vote_adjustment_log enable row level security;
revoke all on public.vote_adjustment_log from anon,authenticated;
grant select on public.vote_adjustment_log to authenticated;
drop policy if exists "Admins read vote adjustments" on public.vote_adjustment_log;
create policy "Admins read vote adjustments" on public.vote_adjustment_log for select to authenticated using ((select public.is_slaysinus_admin()));
create or replace function public.set_slaysinus_vote_count(p_candidate_id uuid,p_count integer)
returns void language plpgsql security definer set search_path='' as $$
declare adjustment integer; actual bigint;
begin
 if not public.is_slaysinus_admin() then raise exception 'Только администратор может менять голоса'; end if;
 if p_count is null or p_count<0 or p_count>1000000 then raise exception 'Количество голосов: от 0 до 1000000'; end if;
 select vote_adjustment into adjustment from public.candidates where id=p_candidate_id for update;
 if not found then raise exception 'Кандидат не найден'; end if;
 select count(*) into actual from public.votes where candidate_id=p_candidate_id;
 update public.candidates set vote_adjustment=p_count-actual where id=p_candidate_id;
 insert into public.vote_adjustment_log(candidate_id,admin_id,old_count,new_count) values(p_candidate_id,auth.uid(),greatest(0,actual+adjustment),p_count);
end $$;
revoke all on function public.set_slaysinus_vote_count(uuid,integer) from public,anon,authenticated;
grant execute on function public.set_slaysinus_vote_count(uuid,integer) to authenticated;

create or replace function public.cast_slaysinus_vote(p_nomination_id text,p_candidate_id uuid,p_voter_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_voter_id is null then raise exception 'Voter token is required'; end if;
 if not exists(select 1 from public.site_settings where id=1 and voting_open) then raise exception 'Voting is closed'; end if;
 perform 1 from public.candidates where id=p_candidate_id and nomination_id=p_nomination_id and is_published for update;
 if not found then raise exception 'Кандидат ещё не опубликован или не относится к категории'; end if;
 insert into public.votes(nomination_id,candidate_id,voter_id) values(p_nomination_id,p_candidate_id,p_voter_id)
 on conflict(nomination_id,voter_id) do update set candidate_id=excluded.candidate_id;
end $$;
create or replace function public.get_slaysinus_vote_counts()
returns table(candidate_id uuid,vote_count bigint) language plpgsql stable security definer set search_path='' as $$
begin
 if not coalesce((select results_published from public.site_settings where id=1),false) and not public.is_slaysinus_admin() then return; end if;
 return query select c.id,greatest(0,count(v.id)+c.vote_adjustment)::bigint from public.candidates c
 left join public.votes v on v.candidate_id=c.id where c.is_published or public.is_slaysinus_admin() group by c.id,c.vote_adjustment;
end $$;
-- Moving a candidate to another category resets votes tied to the old category.
create or replace function public.reset_moved_candidate_votes() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.nomination_id is distinct from new.nomination_id then delete from public.votes where candidate_id=old.id; new.vote_adjustment=0; end if;
 return new;
end $$;
revoke all on function public.reset_moved_candidate_votes() from public,anon,authenticated;
drop trigger if exists reset_moved_candidate_votes on public.candidates;
create trigger reset_moved_candidate_votes before update of nomination_id on public.candidates for each row execute function public.reset_moved_candidate_votes();

create or replace function public.reset_slaysinus_votes() returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_slaysinus_admin() then raise exception 'Только администратор'; end if;
 perform 1 from public.candidates for update;
 delete from public.votes;
 update public.candidates set vote_adjustment=0;
end $$;
revoke all on function public.reset_slaysinus_votes() from public,anon,authenticated;
grant execute on function public.reset_slaysinus_votes() to authenticated;

notify pgrst,'reload schema';
commit;

-- Optional private submitter contact
-- Private optional contact for candidate proposals. Apply after moderation migration.
begin;
alter table public.candidates add column if not exists submitter_contact text not null default '';
alter table public.candidates drop constraint if exists candidates_contact_length;
alter table public.candidates add constraint candidates_contact_length check (char_length(submitter_contact)<=200);
-- Do not grant SELECT on the contact column to visitors or ordinary authenticated users.
drop function if exists public.submit_slaysinus_candidate(text,text,text,uuid,text,text);
create or replace function public.submit_slaysinus_candidate(p_nomination_id text,p_name text,p_note text,p_submitter_id uuid,p_media_type text default 'image',p_media_path text default null,p_contact text default '')
returns void language plpgsql security definer set search_path='' as $$
begin
 if char_length(coalesce(p_contact,''))>200 then raise exception 'Контакт должен быть не длиннее 200 символов'; end if;
 if p_submitter_id is null or p_name is null or char_length(trim(p_name)) not between 1 and 60 or char_length(coalesce(p_note,''))>180 then raise exception 'Проверьте имя и описание'; end if;
 if p_nomination_id is null or p_nomination_id not in ('drunk','deer','doe','breakthrough','project','meme','achievement','arrival','team','ragebait') then raise exception 'Неизвестная категория'; end if;
 if p_media_type is null or p_media_type not in ('image','video') then raise exception 'Неверный тип вложения'; end if;
 if p_media_type='video' and (p_nomination_id not in ('deer','doe','arrival','meme') or p_media_path is null) then raise exception 'Видео недоступно для этой категории'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_submitter_id::text,0));
 if (select count(*) from public.candidates where submitted_by=p_submitter_id and created_at>now()-interval '1 hour')>=5 then raise exception 'Не более пяти предложений в час. Попробуйте позже.'; end if;
 if p_media_path is not null then
  if p_media_path not like 'submissions/'||p_submitter_id::text||'/%' or not exists(
   select 1 from storage.objects o where o.bucket_id='candidate-media' and o.name=p_media_path
    and case when p_media_type='video' then o.metadata->>'mimetype' in ('video/mp4','video/webm','video/quicktime') else o.metadata->>'mimetype' in ('image/jpeg','image/png','image/webp') end
  ) then raise exception 'Вложение не найдено или имеет неверный тип'; end if;
 end if;
 insert into public.candidates(nomination_id,name,note,is_published,submitted_by,media_type,media_path,submitter_contact)
 values(p_nomination_id,trim(p_name),coalesce(p_note,''),false,p_submitter_id,p_media_type,p_media_path,trim(coalesce(p_contact,'')));
end $$;
revoke all on function public.submit_slaysinus_candidate(text,text,text,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.submit_slaysinus_candidate(text,text,text,uuid,text,text,text) to anon,authenticated;

create or replace function public.get_slaysinus_candidate_contacts()
returns table(candidate_id uuid,contact text) language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_slaysinus_admin() then raise exception 'Только администратор'; end if;
 return query select c.id,c.submitter_contact from public.candidates c;
end $$;
revoke all on function public.get_slaysinus_candidate_contacts() from public,anon,authenticated;
grant execute on function public.get_slaysinus_candidate_contacts() to authenticated;
notify pgrst,'reload schema';
commit;
