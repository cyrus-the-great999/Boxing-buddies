-- Security and legal hardening. Safe to run more than once. Does not delete accounts.
-- Do not run this until the matching app deploy is live (or immediately after it).
-- The new app calls discover_profiles, partner_profiles, and my_profile, and falls
-- back to the old table reads only while those functions are missing. After this
-- file runs, other users can no longer select profiles.lat or profiles.lng.

-- ---------------------------------------------------------------------------
-- Approximate location. Two decimal degrees is about 1 km of latitude.
-- ---------------------------------------------------------------------------
create or replace function private.round_coord(p_value double precision)
returns double precision
language sql
immutable
set search_path = ''
as $$
  select case
    when p_value is null then null
    else round(p_value::numeric, 2)::double precision
  end;
$$;

-- Round what is already stored, before the write trigger exists. Idempotent.
update public.profiles
   set lat = private.round_coord(lat),
       lng = private.round_coord(lng)
 where lat is not null or lng is not null;

-- 18+, waiver lock, and coordinate rounding. Runs on every profile write.
create or replace function private.guard_profile_safety()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.lat := private.round_coord(new.lat);
  new.lng := private.round_coord(new.lng);
  if new.adult_confirmed is true and (new.age is null or new.age < 18) then
    raise exception 'Boxing Buddies is for adults 18 or older.';
  end if;
  if tg_op = 'UPDATE' then
    if old.adult_confirmed is true and new.adult_confirmed is distinct from true then
      raise exception 'The 18+ confirmation cannot be turned off.';
    end if;
    if old.adult_confirmed is true and (new.age is null or new.age < 18) then
      raise exception 'Age cannot be set under 18 after you confirm you are an adult.';
    end if;
    if old.waiver_accepted_at is not null and new.waiver_accepted_at is null then
      raise exception 'The waiver acceptance cannot be removed.';
    end if;
  end if;
  return new;
end $$;

alter table public.profiles add column if not exists waiver_accepted_at timestamptz;
alter table public.profiles add column if not exists waiver_version text;

comment on column public.profiles.waiver_accepted_at is 'When the boxer accepted the Assumption of Risk and Release. Lawyer review still required.';
comment on column public.profiles.waiver_version is 'Version string of the waiver the boxer accepted, for example 2026-11-02.';

drop trigger if exists profiles_guard_safety on public.profiles;
create trigger profiles_guard_safety
  before insert or update on public.profiles
  for each row execute function private.guard_profile_safety();

-- Others may read a profile only when it is a confirmed adult and not blocked.
drop policy if exists "profiles readable unless blocked" on public.profiles;
create policy "profiles readable unless blocked"
  on public.profiles
  for select
  to authenticated
  using (
    id = (select auth.uid())
    or (
      adult_confirmed is true
      and age >= 18
      and not private.is_blocked_between(id)
    )
  );

-- Column privileges are not row-specific. Nobody using the API can select
-- lat/lng directly, including the owner. The owner gets them from my_profile().
revoke select on table public.profiles from anon, authenticated;
grant select (
  id, display_name, age, height, town,
  weight_class, experience, stance, intensity, goal, gloves,
  availability_days, availability_times, home_gym_id, bio, avatar_url, verified,
  created_at, updated_at, adult_confirmed, terms_accepted_at, safety_acknowledged_at,
  waiver_accepted_at, waiver_version
) on table public.profiles to authenticated;

-- Distance for Discover. Does not return anyone else's coordinates.
create or replace function public.discover_profiles(
  origin_lat double precision,
  origin_lng double precision,
  radius_miles double precision
)
returns table (
  id uuid,
  display_name text,
  age integer,
  height text,
  town text,
  weight_class text,
  experience text,
  stance text,
  intensity text,
  goal text,
  gloves text,
  availability_days text[],
  availability_times text[],
  home_gym_id bigint,
  bio text,
  avatar_url text,
  verified boolean,
  distance_miles double precision,
  home_gym_name text,
  home_gym_town text,
  home_gym_state text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id, p.display_name, p.age, p.height, p.town,
    p.weight_class, p.experience, p.stance, p.intensity, p.goal, p.gloves,
    p.availability_days, p.availability_times, p.home_gym_id, p.bio, p.avatar_url, p.verified,
    round((3958.8 * 2 * asin(least(1::double precision, sqrt(
      power(sin(radians(p.lat - origin_lat) / 2), 2)
      + cos(radians(origin_lat)) * cos(radians(p.lat)) * power(sin(radians(p.lng - origin_lng) / 2), 2)
    ))))::numeric)::double precision as distance_miles,
    g.name, g.town, g.state
  from public.profiles p
  left join public.gyms g on g.id = p.home_gym_id
  where (select auth.uid()) is not null
    and p.id <> (select auth.uid())
    and p.adult_confirmed is true
    and p.age >= 18
    and p.lat is not null
    and p.lng is not null
    and origin_lat is not null
    and origin_lng is not null
    and radius_miles between 1 and 100
    and not private.is_blocked_between(p.id)
    and (3958.8 * 2 * asin(least(1::double precision, sqrt(
      power(sin(radians(p.lat - origin_lat) / 2), 2)
      + cos(radians(origin_lat)) * cos(radians(p.lat)) * power(sin(radians(p.lng - origin_lng) / 2), 2)
    )))) <= radius_miles
  order by distance_miles
  limit 200;
$$;

create or replace function public.partner_profiles(profile_ids uuid[])
returns table (
  id uuid,
  display_name text,
  age integer,
  height text,
  town text,
  weight_class text,
  experience text,
  stance text,
  intensity text,
  goal text,
  gloves text,
  availability_days text[],
  availability_times text[],
  home_gym_id bigint,
  bio text,
  avatar_url text,
  verified boolean,
  distance_miles double precision,
  home_gym_name text,
  home_gym_town text,
  home_gym_state text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id, p.display_name, p.age, p.height, p.town,
    p.weight_class, p.experience, p.stance, p.intensity, p.goal, p.gloves,
    p.availability_days, p.availability_times, p.home_gym_id, p.bio, p.avatar_url, p.verified,
    case
      when me.lat is null or p.lat is null then null
      else round((3958.8 * 2 * asin(least(1::double precision, sqrt(
        power(sin(radians(p.lat - me.lat) / 2), 2)
        + cos(radians(me.lat)) * cos(radians(p.lat)) * power(sin(radians(p.lng - me.lng) / 2), 2)
      ))))::numeric)::double precision
    end,
    g.name, g.town, g.state
  from public.profiles p
  left join public.gyms g on g.id = p.home_gym_id
  left join public.profiles me on me.id = (select auth.uid())
  where (select auth.uid()) is not null
    and p.id = any (coalesce(profile_ids, array[]::uuid[]))
    and p.adult_confirmed is true
    and p.age >= 18
    and not private.is_blocked_between(p.id);
$$;

create or replace function public.my_profile()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(p) || jsonb_build_object(
    'home_gym',
    case when g.id is null then null
      else jsonb_build_object('id', g.id, 'name', g.name, 'town', g.town, 'state', g.state)
    end
  )
  from public.profiles p
  left join public.gyms g on g.id = p.home_gym_id
  where p.id = (select auth.uid());
$$;

revoke all on function public.discover_profiles(double precision, double precision, double precision) from public;
revoke all on function public.partner_profiles(uuid[]) from public;
revoke all on function public.my_profile() from public;
grant execute on function public.discover_profiles(double precision, double precision, double precision) to authenticated;
grant execute on function public.partner_profiles(uuid[]) to authenticated;
grant execute on function public.my_profile() to authenticated;

-- A profile is usable only after the 18+ confirmation.
create or replace function private.require_adult(p_uid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles p
     where p.id = p_uid and p.adult_confirmed is true and p.age >= 18
  ) then
    raise exception 'Confirm you are 18 or older before using Boxing Buddies.';
  end if;
end $$;

create or replace function private.guard_swipe()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  perform private.require_adult(new.swiper_id);
  if auth.uid() is not null and new.swiper_id = auth.uid() then
    select count(*) into n
      from public.swipes s
     where s.swiper_id = new.swiper_id
       and s.created_at > now() - interval '10 minutes';
    if n >= 60 then
      raise exception 'Too many swipes. Wait a few minutes and try again.';
    end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Blocks stop messages and session plans, in either direction.
-- ---------------------------------------------------------------------------
create or replace function private.match_is_blocked(p_match_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.matches m
      join public.blocks b
        on (b.blocker_id = m.user_a and b.blocked_id = m.user_b)
        or (b.blocker_id = m.user_b and b.blocked_id = m.user_a)
     where m.id = p_match_id
  );
$$;

create or replace function private.guard_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  perform private.reject_spam(new.body);
  perform private.require_adult(new.sender_id);
  if private.match_is_blocked(new.match_id) then
    raise exception 'You cannot message someone you blocked, or who blocked you.';
  end if;
  if auth.uid() is not null and new.sender_id = auth.uid() then
    select count(*) into n
      from public.messages m
     where m.sender_id = new.sender_id
       and m.created_at > now() - interval '10 minutes';
    if n >= 20 then
      raise exception 'Too many messages. Wait a few minutes and try again.';
    end if;
  end if;
  return new;
end $$;

create or replace function private.guard_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.match_is_blocked(new.match_id) then
    raise exception 'You cannot plan a session with someone you blocked, or who blocked you.';
  end if;
  return new;
end $$;

drop trigger if exists sessions_guard_block on public.sessions;
create trigger sessions_guard_block
  before insert or update on public.sessions
  for each row execute function private.guard_session();

drop policy if exists "messages participants send" on public.messages;
create policy "messages participants send"
  on public.messages
  for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and private.is_match_participant(match_id)
    and not private.match_is_blocked(match_id)
  );

drop policy if exists "sessions participants propose" on public.sessions;
create policy "sessions participants propose"
  on public.sessions
  for insert
  to authenticated
  with check (
    proposer_id = (select auth.uid())
    and private.is_match_participant(match_id)
    and not private.match_is_blocked(match_id)
  );

drop policy if exists "sessions participants update" on public.sessions;
create policy "sessions participants update"
  on public.sessions
  for update
  to authenticated
  using (
    private.is_match_participant(match_id)
    and not private.match_is_blocked(match_id)
  )
  with check (
    private.is_match_participant(match_id)
    and not private.match_is_blocked(match_id)
  );

-- ---------------------------------------------------------------------------
-- Reports survive account deletion. New reports raise an admin alert row.
-- Cyrus can read alerts in the Supabase SQL editor:
--   select * from public.admin_alerts order by created_at desc;
-- There is no email sender wired up.
-- ---------------------------------------------------------------------------
alter table public.reports add column if not exists reported_user_id uuid;
alter table public.reports add column if not exists reported_display_name text;
alter table public.reports add column if not exists reporter_user_id uuid;
alter table public.reports add column if not exists reporter_display_name text;

alter table public.reports alter column reported_id drop not null;
alter table public.reports alter column reporter_id drop not null;

alter table public.reports drop constraint if exists reports_reported_id_fkey;
alter table public.reports
  add constraint reports_reported_id_fkey
  foreign key (reported_id) references public.profiles (id) on delete set null;

alter table public.reports drop constraint if exists reports_reporter_id_fkey;
alter table public.reports
  add constraint reports_reporter_id_fkey
  foreign key (reporter_id) references public.profiles (id) on delete set null;

update public.reports r
   set reported_user_id = r.reported_id
 where r.reported_user_id is null and r.reported_id is not null;

update public.reports r
   set reported_display_name = p.display_name
  from public.profiles p
 where r.reported_id = p.id
   and r.reported_display_name is null;

update public.reports r
   set reporter_user_id = r.reporter_id
 where r.reporter_user_id is null and r.reporter_id is not null;

update public.reports r
   set reporter_display_name = p.display_name
  from public.profiles p
 where r.reporter_id = p.id
   and r.reporter_display_name is null;

create or replace function private.snapshot_report_parties()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.reports r
     set reported_user_id = old.id,
         reported_display_name = coalesce(r.reported_display_name, old.display_name)
   where r.reported_id = old.id;
  update public.reports r
     set reporter_user_id = old.id,
         reporter_display_name = coalesce(r.reporter_display_name, old.display_name)
   where r.reporter_id = old.id;
  return old;
end $$;

drop trigger if exists profiles_snapshot_reports on public.profiles;
create trigger profiles_snapshot_reports
  before delete on public.profiles
  for each row execute function private.snapshot_report_parties();

create table if not exists public.admin_alerts (
  id bigint generated always as identity primary key,
  kind text not null,
  report_id bigint,
  body text,
  created_at timestamptz not null default now()
);

alter table public.admin_alerts enable row level security;
revoke all on table public.admin_alerts from anon, authenticated;

create or replace function private.alert_on_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.admin_alerts (kind, report_id, body)
  values (
    'report',
    new.id,
    'New report #' || new.id::text || ' about ' || coalesce(new.reported_display_name, new.reported_id::text, 'a boxer')
  );
  return new;
end $$;

drop trigger if exists reports_admin_alert on public.reports;
create trigger reports_admin_alert
  after insert on public.reports
  for each row execute function private.alert_on_report();

-- Avatar uploads: 5 MB, still images only.
update storage.buckets
   set file_size_limit = 5242880,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
 where id = 'avatars';
