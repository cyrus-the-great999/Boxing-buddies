-- Launch safety: account deletion, 18+ confirmation, and abuse limits.
-- Safe to run more than once.
-- Applied to project evgdadutsupnxywtgfxh with the rest of this change.
-- Avatar files are removed by the app through the Storage API before this
-- function runs. Direct deletes on storage.objects are blocked by Supabase.

alter table public.profiles add column if not exists adult_confirmed boolean not null default false;
alter table public.profiles add column if not exists terms_accepted_at timestamptz;
alter table public.profiles add column if not exists safety_acknowledged_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_adult_confirmed_check') then
    alter table public.profiles
      add constraint profiles_adult_confirmed_check
      check (adult_confirmed = false or (age is not null and age >= 18));
  end if;
end $$;

comment on column public.profiles.adult_confirmed is 'Boxer checked that they are 18 or older during onboarding.';
comment on column public.profiles.terms_accepted_at is 'When the boxer agreed to the Terms and Privacy Policy.';
comment on column public.profiles.safety_acknowledged_at is 'When the boxer accepted the first-session safety reminder.';

create index if not exists swipes_swiper_created_idx on public.swipes (swiper_id, created_at desc);
create index if not exists messages_sender_created_idx on public.messages (sender_id, created_at desc);

-- Shared by the message trigger and profile bio updates.
create or replace function private.reject_spam(p_text text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  lowered text := lower(coalesce(p_text, ''));
  links int;
begin
  if p_text is null or length(p_text) = 0 then
    return;
  end if;
  if char_length(p_text) > 2000 then
    raise exception 'That is too long.';
  end if;
  select count(*) into links from regexp_matches(p_text, 'https?://|www\.', 'gi');
  if links > 2 then
    raise exception 'Too many links. Keep it to a couple.';
  end if;
  if lowered ~ '(telegram\.me|t\.me/|wa\.me/|crypto airdrop|buy followers|free btc|whatsapp me)' then
    raise exception 'That looks like spam.';
  end if;
  if lowered ~ '\m(fuck|shit|bitch|asshole|cunt)\M' then
    raise exception 'Keep it clean. No strong profanity.';
  end if;
end $$;

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

drop trigger if exists messages_guard on public.messages;
create trigger messages_guard
  before insert on public.messages
  for each row execute function private.guard_message();

create or replace function private.guard_swipe()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
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

drop trigger if exists swipes_guard on public.swipes;
create trigger swipes_guard
  before insert on public.swipes
  for each row execute function private.guard_swipe();

create or replace function private.guard_profile_text()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.bio is not null then
    if char_length(new.bio) > 500 then
      raise exception 'Bio is too long.';
    end if;
    perform private.reject_spam(new.bio);
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard_text on public.profiles;
create trigger profiles_guard_text
  before insert or update of bio on public.profiles
  for each row execute function private.guard_profile_text();

-- Deletes the auth user. Profile, swipes, matches, and messages they sent
-- cascade from that. The app deletes avatar files first via the Storage API.
create or replace function private.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sign in to delete your account';
  end if;
  delete from auth.refresh_tokens where user_id = v_uid::text;
  delete from auth.sessions where user_id = v_uid;
  delete from auth.users where id = v_uid;
end $$;

create or replace function public.delete_own_account()
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.delete_own_account();
$$;

revoke all on function public.delete_own_account() from public;
revoke all on function private.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;
grant execute on function private.delete_own_account() to authenticated;
grant usage on schema private to authenticated;
