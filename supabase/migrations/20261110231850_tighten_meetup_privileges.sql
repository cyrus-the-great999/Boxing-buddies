-- Narrow privilege tightening for public meetup tables and their identity sequence.
-- Default GRANT ALL had left authenticated with TRUNCATE, TRIGGER, and REFERENCES
-- (and UPDATE on meetup_joins). Restore only the intended grant set.
-- Does not change RLS, functions, policies, or any other objects.

revoke all on table public.meetups from authenticated;
revoke all on table public.meetup_joins from authenticated;
grant select, insert, update, delete on table public.meetups to authenticated;
grant select, insert, delete on table public.meetup_joins to authenticated;

revoke all on sequence public.meetups_id_seq from authenticated;
grant usage, select on sequence public.meetups_id_seq to authenticated;

-- Keep public and anon without privileges on these objects.
revoke all on table public.meetups from public;
revoke all on table public.meetup_joins from public;
revoke all on table public.meetups from anon;
revoke all on table public.meetup_joins from anon;
revoke all on sequence public.meetups_id_seq from public;
revoke all on sequence public.meetups_id_seq from anon;
