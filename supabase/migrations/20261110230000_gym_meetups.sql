-- Gym-hosted meetups. Separate from match sessions, which stay private to a match.
-- Safe to run more than once. Does not delete rows.
-- Do not run this until the matching app is deployed. Until it runs, the app
-- refuses to pretend a meetup was saved.

create table if not exists public.meetups (
  id bigint generated always as identity primary key,
  host_id uuid not null references public.profiles (id) on delete cascade,
  gym_id bigint not null references public.gyms (id),
  starts_at timestamptz not null,
  rules text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.meetup_joins (
  meetup_id bigint not null references public.meetups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (meetup_id, user_id)
);

create index if not exists meetups_starts_at_idx on public.meetups (starts_at);
create index if not exists meetup_joins_user_idx on public.meetup_joins (user_id);

create or replace function private.guard_meetup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.host_id is distinct from (select auth.uid()) then
      raise exception 'You can only host a meetup as yourself.';
    end if;
    perform private.require_adult(new.host_id);
  elsif new.host_id is distinct from old.host_id then
    raise exception 'The host cannot be changed.';
  end if;
  new.rules := btrim(coalesce(new.rules, ''));
  if char_length(new.rules) < 1 or char_length(new.rules) > 1000 then
    raise exception 'Write the rules, up to 1000 characters.';
  end if;
  perform private.reject_spam(new.rules);
  if new.starts_at <= now() then
    raise exception 'Pick a time in the future.';
  end if;
  if not exists (select 1 from public.gyms g where g.id = new.gym_id) then
    raise exception 'Choose a gym that is listed.';
  end if;
  return new;
end $$;

create or replace function private.guard_meetup_join()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is distinct from (select auth.uid()) then
    raise exception 'You can only join as yourself.';
  end if;
  perform private.require_adult(new.user_id);
  if exists (
    select 1 from public.meetups m
     where m.id = new.meetup_id and m.host_id = new.user_id
  ) then
    raise exception 'You are already hosting this meetup.';
  end if;
  return new;
end $$;

drop trigger if exists meetups_guard on public.meetups;
create trigger meetups_guard
  before insert or update on public.meetups
  for each row execute function private.guard_meetup();

drop trigger if exists meetup_joins_guard on public.meetup_joins;
create trigger meetup_joins_guard
  before insert on public.meetup_joins
  for each row execute function private.guard_meetup_join();

alter table public.meetups enable row level security;
alter table public.meetup_joins enable row level security;

drop policy if exists "meetups readable" on public.meetups;
create policy "meetups readable"
  on public.meetups
  for select
  to authenticated
  using (true);

drop policy if exists "meetups host insert" on public.meetups;
create policy "meetups host insert"
  on public.meetups
  for insert
  to authenticated
  with check (host_id = (select auth.uid()));

drop policy if exists "meetups host update" on public.meetups;
create policy "meetups host update"
  on public.meetups
  for update
  to authenticated
  using (host_id = (select auth.uid()))
  with check (host_id = (select auth.uid()));

drop policy if exists "meetups host delete" on public.meetups;
create policy "meetups host delete"
  on public.meetups
  for delete
  to authenticated
  using (host_id = (select auth.uid()));

drop policy if exists "meetup joins readable" on public.meetup_joins;
create policy "meetup joins readable"
  on public.meetup_joins
  for select
  to authenticated
  using (true);

drop policy if exists "meetup joins insert" on public.meetup_joins;
create policy "meetup joins insert"
  on public.meetup_joins
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "meetup joins delete" on public.meetup_joins;
create policy "meetup joins delete"
  on public.meetup_joins
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update, delete on table public.meetups to authenticated;
grant select, insert, delete on table public.meetup_joins to authenticated;
grant usage, select on sequence public.meetups_id_seq to authenticated;

revoke all on table public.meetups from anon;
revoke all on table public.meetup_joins from anon;
