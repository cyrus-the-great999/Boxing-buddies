-- Storage upsert needs SELECT as well as INSERT and UPDATE.
-- Owners can read only the folder named with their user id.
-- The avatars bucket is already public, so profile photo URLs keep working
-- for other boxers without this policy.

drop policy if exists "avatars owner read" on storage.objects;
create policy "avatars owner read"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
