-- User-submitted gyms.
--
-- A gym added in the app is visible to the person who added it right away.
-- Everyone else sees it when status is 'approved'. That happens when:
--   * the owner approves it in the SQL editor (service role / postgres bypasses RLS), or
--   * three other boxers confirm the same name, city, and state.
--
-- Owner approval:
--   update public.gyms set status = 'approved' where id = <gym id>;
--
-- Bulk import later (all states):
--   Insert rows with status = 'approved' and submitted_by null. Prefer a source
--   that already has coordinates, such as OpenStreetMap features tagged
--   leisure=sports_centre with sport=boxing, or a licensed gym directory.
--   Do not geocode thousands of rows through Nominatim (its usage policy is
--   one request per second and forbids bulk scraping). Load in batches and
--   skip rows that collide with gyms_name_place_key (lower name + city + state).
--
-- This file is safe to run more than once.

alter table public.gyms add column if not exists website text;
alter table public.gyms add column if not exists submitted_by uuid references public.profiles (id) on delete set null;
alter table public.gyms add column if not exists status text not null default 'approved';
alter table public.gyms add column if not exists confirmation_count integer not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'gyms_status_check') then
    alter table public.gyms
      add constraint gyms_status_check check (status = any (array['pending'::text, 'approved'::text]));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'gyms_confirmation_count_check') then
    alter table public.gyms
      add constraint gyms_confirmation_count_check check (confirmation_count >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'gyms_website_check') then
    alter table public.gyms
      add constraint gyms_website_check check (
        website is null
        or (char_length(website) <= 300 and website ~* '^https://[A-Za-z0-9.-]+\.[A-Za-z]{2,}')
      );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'gyms_lat_check') then
    alter table public.gyms
      add constraint gyms_lat_check check (lat is null or (lat >= -90 and lat <= 90));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'gyms_lng_check') then
    alter table public.gyms
      add constraint gyms_lng_check check (lng is null or (lng >= -180 and lng <= 180));
  end if;
end $$;

-- Nationwide gyms can share a name. Uniqueness is name + city + state.
alter table public.gyms drop constraint if exists gyms_name_key;
create unique index if not exists gyms_name_place_key
  on public.gyms (lower(name), lower(coalesce(town, '')), upper(coalesce(state, '')));
create index if not exists gyms_submitted_by_idx on public.gyms (submitted_by);
create index if not exists gyms_lat_lng_idx on public.gyms (lat, lng);
create index if not exists profiles_lat_lng_idx on public.profiles (lat, lng);

comment on column public.gyms.status is 'pending until the owner approves it or three other boxers confirm it; approved gyms are public.';
comment on column public.gyms.submitted_by is 'Null for seeded or imported gyms. Set for gyms a boxer added.';
comment on column public.gyms.confirmation_count is 'How many other boxers confirmed this gym. Three promotes a pending gym to approved.';

create table if not exists public.gym_confirmations (
  gym_id bigint not null references public.gyms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (gym_id, user_id)
);

alter table public.gym_confirmations enable row level security;
revoke all on table public.gym_confirmations from anon, authenticated;
grant select on table public.gym_confirmations to authenticated;

drop policy if exists "confirmations own read" on public.gym_confirmations;
create policy "confirmations own read"
  on public.gym_confirmations
  for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Pending gyms are visible to the submitter only. Approved gyms are public.
drop policy if exists "gyms readable" on public.gyms;
drop policy if exists "gyms listed or own" on public.gyms;
create policy "gyms listed or own"
  on public.gyms
  for select
  to anon, authenticated
  using (
    status = 'approved'
    or submitted_by = (select auth.uid())
  );

-- Writes go through private.submit_gym (security definer). No insert policy,
-- so a signed-in user cannot mark their own gym approved.

create or replace function private.sync_gym_confirmation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  gid bigint := coalesce(new.gym_id, old.gym_id);
  owner uuid;
  n integer;
begin
  if tg_op = 'INSERT' then
    select g.submitted_by into owner from public.gyms g where g.id = new.gym_id;
    if owner is not null and owner = new.user_id then
      raise exception 'You cannot confirm a gym you submitted';
    end if;
  end if;
  select count(*)::integer into n from public.gym_confirmations c where c.gym_id = gid;
  update public.gyms g
     set confirmation_count = n,
         status = case when g.status = 'pending' and n >= 3 then 'approved' else g.status end
   where g.id = gid;
  return coalesce(new, old);
end $$;

drop trigger if exists gym_confirmations_sync on public.gym_confirmations;
create trigger gym_confirmations_sync
  after insert or delete on public.gym_confirmations
  for each row execute function private.sync_gym_confirmation();

create or replace function private.submit_gym(
  p_name text,
  p_address text,
  p_town text,
  p_state text,
  p_website text,
  p_lat double precision,
  p_lng double precision
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_address text := regexp_replace(trim(coalesce(p_address, '')), '\s+', ' ', 'g');
  v_town text := regexp_replace(trim(coalesce(p_town, '')), '\s+', ' ', 'g');
  v_state text := upper(trim(coalesce(p_state, '')));
  v_website text := nullif(trim(coalesce(p_website, '')), '');
  v_states text[] := array[
    'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
    'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
    'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
    'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
    'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'
  ];
  v_row public.gyms;
  v_outcome text;
  v_visible boolean;
begin
  if v_uid is null then
    raise exception 'Sign in to add a gym';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception 'Finish your profile before adding a gym';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    raise exception 'Enter the gym name (2 to 80 characters)';
  end if;
  if char_length(v_address) < 4 or char_length(v_address) > 160 then
    raise exception 'Enter the street address';
  end if;
  if char_length(v_town) < 2 or char_length(v_town) > 60 then
    raise exception 'Enter the city';
  end if;
  if not (v_state = any (v_states)) then
    raise exception 'Choose a US state';
  end if;
  if p_lat is null or p_lng is null or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    raise exception 'That address could not be placed on the map';
  end if;
  if v_website is not null then
    if v_website ~* '^http://' then
      v_website := 'https://' || substr(v_website, 8);
    elsif v_website !~* '^https://' then
      v_website := 'https://' || v_website;
    end if;
    if char_length(v_website) > 300 or v_website !~* '^https://[A-Za-z0-9.-]+\.[A-Za-z]{2,}' then
      raise exception 'Enter a normal website link, or leave it blank';
    end if;
  end if;

  select * into v_row
    from public.gyms g
   where lower(g.name) = lower(v_name)
     and lower(coalesce(g.town, '')) = lower(v_town)
     and upper(coalesce(g.state, '')) = v_state
   limit 1;

  if found then
    if v_row.status = 'approved' then
      v_outcome := 'already_listed';
      v_visible := true;
    elsif v_row.submitted_by = v_uid then
      v_outcome := 'already_yours';
      v_visible := true;
    else
      if exists (
        select 1 from public.gym_confirmations c
        where c.gym_id = v_row.id and c.user_id = v_uid
      ) then
        v_outcome := 'already_confirmed';
      else
        insert into public.gym_confirmations (gym_id, user_id) values (v_row.id, v_uid);
        v_outcome := 'confirmed';
      end if;
      select * into v_row from public.gyms g where g.id = v_row.id;
      v_visible := v_row.status = 'approved';
    end if;
  else
    begin
      insert into public.gyms (name, address, town, state, lat, lng, website, submitted_by, status, confirmation_count)
      values (v_name, v_address, v_town, v_state, p_lat, p_lng, v_website, v_uid, 'pending', 0)
      returning * into v_row;
    exception
      when unique_violation then
        select * into v_row
          from public.gyms g
         where lower(g.name) = lower(v_name)
           and lower(coalesce(g.town, '')) = lower(v_town)
           and upper(coalesce(g.state, '')) = v_state
         limit 1;
        if v_row.submitted_by = v_uid or v_row.status = 'approved' then
          v_outcome := case when v_row.status = 'approved' then 'already_listed' else 'already_yours' end;
          v_visible := true;
        else
          raise exception 'That gym was just added. Try again to confirm it.';
        end if;
    end;
    if v_outcome is null then
      v_outcome := 'created';
      v_visible := true;
    end if;
  end if;

  if not v_visible then
    return jsonb_build_object(
      'visible', false,
      'outcome', v_outcome,
      'status', v_row.status,
      'confirmation_count', v_row.confirmation_count,
      'name', v_name,
      'town', v_town,
      'state', v_state
    );
  end if;

  return jsonb_build_object(
    'visible', true,
    'outcome', v_outcome,
    'id', v_row.id,
    'name', v_row.name,
    'address', v_row.address,
    'town', v_row.town,
    'state', v_row.state,
    'lat', v_row.lat,
    'lng', v_row.lng,
    'website', v_row.website,
    'status', v_row.status,
    'submitted_by', v_row.submitted_by,
    'confirmation_count', v_row.confirmation_count
  );
end $$;

create or replace function public.submit_gym(
  p_name text,
  p_address text,
  p_town text,
  p_state text,
  p_website text,
  p_lat double precision,
  p_lng double precision
) returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.submit_gym(p_name, p_address, p_town, p_state, p_website, p_lat, p_lng);
$$;

revoke all on function public.submit_gym(text, text, text, text, text, double precision, double precision) from public;
revoke all on function private.submit_gym(text, text, text, text, text, double precision, double precision) from public;
grant execute on function public.submit_gym(text, text, text, text, text, double precision, double precision) to authenticated;
grant execute on function private.submit_gym(text, text, text, text, text, double precision, double precision) to authenticated;
grant usage on schema private to authenticated;

-- Stop a boxer from marking their own profile verified. The SQL editor and
-- service role (auth.role() is null or service_role) can still set the flag.
create or replace function private.protect_profile_verified()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.role() in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.verified := false;
    elsif new.verified is distinct from old.verified then
      new.verified := old.verified;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists profiles_protect_verified on public.profiles;
create trigger profiles_protect_verified
  before insert or update on public.profiles
  for each row execute function private.protect_profile_verified();
