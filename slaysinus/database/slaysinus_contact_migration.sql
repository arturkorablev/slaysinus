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
