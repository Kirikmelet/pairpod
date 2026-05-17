create extension if not exists pgcrypto;

drop table if exists events;
drop table if exists comments;
drop table if exists posts;
drop table if exists accessibility_notes;
drop table if exists ai_summaries;
drop table if exists answers;
drop table if exists chat_messages;
drop table if exists questions;
drop table if exists guides;
drop table if exists rooms;
drop table if exists pages;
drop table if exists users;

-- Writes use authenticated Supabase sessions from the app, extension, or server routes.
-- RLS stays enabled so anonymous clients cannot write project data.

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete set null,
  username text unique,
  email text,
  url text,
  configurations jsonb not null default '{}'::jsonb,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table users add column if not exists display_name text;
alter table users add column if not exists avatar_url text;
alter table users add column if not exists updated_at timestamptz not null default now();
alter table users add column if not exists auth_user_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_auth_user_id_fkey'
      and conrelid = 'public.users'::regclass
  ) then
    alter table users
      add constraint users_auth_user_id_fkey
      foreign key (auth_user_id)
      references auth.users(id)
      on delete set null;
  end if;
end
$$;

create table if not exists pages (
  id uuid primary key default gen_random_uuid(),
  normalized_url text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references pages(id) on delete cascade,
  max_users integer not null default 50,
  configurations jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  type text not null,
  section_id text,
  header text,
  content text not null,
  likes integer not null default 0,
  user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  reply_id uuid references comments(id) on delete cascade,
  content text not null,
  likes integer not null default 0,
  user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  page_id uuid references pages(id) on delete set null,
  room_id uuid references rooms(id) on delete set null,
  post_id uuid references posts(id) on delete set null,
  comment_id uuid references comments(id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table users enable row level security;
alter table pages enable row level security;
alter table rooms enable row level security;
alter table posts enable row level security;
alter table comments enable row level security;
alter table events enable row level security;

create index if not exists idx_rooms_page_id on rooms(page_id);
create index if not exists idx_posts_room_id on posts(room_id);
create index if not exists idx_posts_user_id on posts(user_id);
create index if not exists idx_comments_post_id on comments(post_id);
create index if not exists idx_comments_reply_id on comments(reply_id);
create index if not exists idx_comments_user_id on comments(user_id);
create index if not exists idx_events_user_id on events(user_id);
create index if not exists idx_events_page_id on events(page_id);
create index if not exists idx_events_room_id on events(room_id);
create index if not exists idx_events_post_id on events(post_id);
create index if not exists idx_events_comment_id on events(comment_id);
create index if not exists idx_events_event_type on events(event_type);
create index if not exists idx_users_auth_user_id on users(auth_user_id);
create index if not exists idx_users_username on users(username);
create unique index if not exists users_auth_user_id_unique_idx on users(auth_user_id) where auth_user_id is not null;
create unique index if not exists users_username_lower_unique_idx on users(lower(username)) where username is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152,
  array['image/png']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'public can read avatars'
  ) then
    create policy "public can read avatars"
      on storage.objects
      for select
      to public
      using (bucket_id = 'avatars');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'authenticated users can insert own avatar'
  ) then
    create policy "authenticated users can insert own avatar"
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
        and name = auth.uid()::text || '/avatar.png'
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'authenticated users can update own avatar'
  ) then
    create policy "authenticated users can update own avatar"
      on storage.objects
      for update
      to authenticated
      using (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
        and name = auth.uid()::text || '/avatar.png'
      )
      with check (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
        and name = auth.uid()::text || '/avatar.png'
      );
  end if;
end
$$;

grant usage on schema public to authenticated;
grant select, insert, update, delete on table users to authenticated;
grant select, insert, update, delete on table pages to authenticated;
grant select, insert, update, delete on table rooms to authenticated;
grant select, insert, update, delete on table posts to authenticated;
grant select, insert, update, delete on table comments to authenticated;
grant select, insert, update, delete on table events to authenticated;

drop policy if exists "authenticated users can read users" on users;
drop policy if exists "authenticated users can write users" on users;
drop policy if exists "authenticated users can read pages" on pages;
drop policy if exists "authenticated users can write pages" on pages;
drop policy if exists "authenticated users can read rooms" on rooms;
drop policy if exists "authenticated users can write rooms" on rooms;
drop policy if exists "authenticated users can read posts" on posts;
drop policy if exists "authenticated users can write posts" on posts;
drop policy if exists "authenticated users can read comments" on comments;
drop policy if exists "authenticated users can write comments" on comments;
drop policy if exists "authenticated users can read events" on events;
drop policy if exists "authenticated users can write events" on events;

create policy "authenticated users can read users"
  on users for select
  to authenticated
  using (true);

create policy "authenticated users can write users"
  on users for all
  to authenticated
  using (true)
  with check (true);

create policy "authenticated users can read pages"
  on pages for select
  to authenticated
  using (true);

create policy "authenticated users can write pages"
  on pages for all
  to authenticated
  using (true)
  with check (true);

create policy "authenticated users can read rooms"
  on rooms for select
  to authenticated
  using (true);

create policy "authenticated users can write rooms"
  on rooms for all
  to authenticated
  using (true)
  with check (true);

create policy "authenticated users can read posts"
  on posts for select
  to authenticated
  using (true);

create policy "authenticated users can write posts"
  on posts for all
  to authenticated
  using (true)
  with check (true);

create policy "authenticated users can read comments"
  on comments for select
  to authenticated
  using (true);

create policy "authenticated users can write comments"
  on comments for all
  to authenticated
  using (true)
  with check (true);

create policy "authenticated users can read events"
  on events for select
  to authenticated
  using (true);

create policy "authenticated users can write events"
  on events for all
  to authenticated
  using (true)
  with check (true);
