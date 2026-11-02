-- Profile writes go through save_my_profile so the API role does not need
-- SELECT on lat/lng. INSERT ... ON CONFLICT DO UPDATE reads those columns,
-- and that read was failing after they were revoked.
-- Safe to run more than once. Does not delete rows.
-- Deploy the app that calls this function first, then run this file.

create or replace function public.save_my_profile(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_age integer;
  v_lat double precision;
  v_lng double precision;
  v_days text[];
  v_times text[];
  v_gym bigint;
begin
  if v_uid is null then
    raise exception 'Sign in to save your profile.';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'Missing profile.';
  end if;

  -- The caller's id is the only row this function can write. A different id in
  -- the payload is ignored. verified is never taken from the client.
  v_name := btrim(coalesce(p->>'display_name', ''));
  if char_length(v_name) < 1 or char_length(v_name) > 60 then
    raise exception 'Enter your name, up to 60 characters.';
  end if;

  if coalesce(p->>'bio', '') <> '' then
    if char_length(p->>'bio') > 500 then
      raise exception 'Bio is too long.';
    end if;
    perform private.reject_spam(p->>'bio');
  end if;

  if coalesce(p->>'age', '') = '' then
    v_age := null;
  elsif p->>'age' !~ '^[0-9]+$' then
    raise exception 'Boxing Buddies is for adults 18 to 100.';
  else
    v_age := (p->>'age')::integer;
    if v_age < 18 or v_age > 100 then
      raise exception 'Boxing Buddies is for adults 18 to 100.';
    end if;
  end if;

  if coalesce(p->>'lat', '') = '' then
    v_lat := null;
  else
    v_lat := private.round_coord((p->>'lat')::double precision);
  end if;
  if coalesce(p->>'lng', '') = '' then
    v_lng := null;
  else
    v_lng := private.round_coord((p->>'lng')::double precision);
  end if;

  if jsonb_typeof(p->'availability_days') = 'array' then
    select coalesce(array_agg(value), '{}'::text[]) into v_days
      from jsonb_array_elements_text(p->'availability_days') as value;
  else
    v_days := '{}'::text[];
  end if;
  if jsonb_typeof(p->'availability_times') = 'array' then
    select coalesce(array_agg(value), '{}'::text[]) into v_times
      from jsonb_array_elements_text(p->'availability_times') as value;
  else
    v_times := '{}'::text[];
  end if;

  if coalesce(p->>'home_gym_id', '') = '' then
    v_gym := null;
  elsif p->>'home_gym_id' !~ '^[0-9]+$' then
    raise exception 'That gym is not valid.';
  else
    v_gym := (p->>'home_gym_id')::bigint;
  end if;

  insert into public.profiles (
    id, display_name, age, height, town, lat, lng,
    weight_class, experience, stance, intensity, goal, gloves,
    availability_days, availability_times, home_gym_id, bio, avatar_url,
    adult_confirmed, terms_accepted_at, safety_acknowledged_at,
    waiver_accepted_at, waiver_version, updated_at
  ) values (
    v_uid,
    v_name,
    v_age,
    nullif(p->>'height', ''),
    nullif(p->>'town', ''),
    v_lat,
    v_lng,
    nullif(p->>'weight_class', ''),
    nullif(p->>'experience', ''),
    nullif(p->>'stance', ''),
    nullif(p->>'intensity', ''),
    nullif(p->>'goal', ''),
    nullif(p->>'gloves', ''),
    v_days,
    v_times,
    v_gym,
    nullif(p->>'bio', ''),
    nullif(p->>'avatar_url', ''),
    coalesce((p->>'adult_confirmed')::boolean, false),
    nullif(p->>'terms_accepted_at', '')::timestamptz,
    nullif(p->>'safety_acknowledged_at', '')::timestamptz,
    nullif(p->>'waiver_accepted_at', '')::timestamptz,
    nullif(p->>'waiver_version', ''),
    now()
  )
  on conflict (id) do update set
    display_name = excluded.display_name,
    age = excluded.age,
    height = excluded.height,
    town = excluded.town,
    lat = excluded.lat,
    lng = excluded.lng,
    weight_class = excluded.weight_class,
    experience = excluded.experience,
    stance = excluded.stance,
    intensity = excluded.intensity,
    goal = excluded.goal,
    gloves = excluded.gloves,
    availability_days = excluded.availability_days,
    availability_times = excluded.availability_times,
    home_gym_id = excluded.home_gym_id,
    bio = excluded.bio,
    avatar_url = excluded.avatar_url,
    adult_confirmed = excluded.adult_confirmed,
    terms_accepted_at = excluded.terms_accepted_at,
    safety_acknowledged_at = excluded.safety_acknowledged_at,
    waiver_accepted_at = excluded.waiver_accepted_at,
    waiver_version = excluded.waiver_version,
    updated_at = now();

  return public.my_profile();
end $$;

revoke all on function public.save_my_profile(jsonb) from public;
revoke all on function public.save_my_profile(jsonb) from anon;
grant execute on function public.save_my_profile(jsonb) to authenticated;

-- Remove the temporary grant that let upserts read lat/lng.
revoke select (lat, lng) on table public.profiles from authenticated;
revoke select (lat, lng) on table public.profiles from anon;
