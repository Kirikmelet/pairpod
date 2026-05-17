insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile_pictures',
  'profile_pictures',
  true,
  2097152,
  array['image/png']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public can read avatars" on storage.objects;
drop policy if exists "authenticated users can insert own avatar" on storage.objects;
drop policy if exists "authenticated users can update own avatar" on storage.objects;
drop policy if exists "public can read profile pictures" on storage.objects;
drop policy if exists "authenticated users can insert own profile picture" on storage.objects;
drop policy if exists "authenticated users can update own profile picture" on storage.objects;

create policy "public can read profile pictures"
  on storage.objects
  for select
  to public
  using (bucket_id = 'profile_pictures');

create policy "authenticated users can insert own profile picture"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'profile_pictures'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name = auth.uid()::text || '/avatar.png'
  );

create policy "authenticated users can update own profile picture"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'profile_pictures'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name = auth.uid()::text || '/avatar.png'
  )
  with check (
    bucket_id = 'profile_pictures'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name = auth.uid()::text || '/avatar.png'
  );
