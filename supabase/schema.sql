create extension if not exists pgcrypto;

drop table if exists events;
drop table if exists dm_messages;
drop table if exists dm_thread_members;
drop table if exists dm_threads;
drop table if exists comment_votes;
drop table if exists post_votes;
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
  display_name text,
  avatar_url text,
  email text,
  url text,
  configurations jsonb not null default '{}'::jsonb,
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

create table if not exists post_votes (
  post_id uuid not null references posts(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  value integer not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists comment_votes (
  comment_id uuid not null references comments(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  value integer not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (comment_id, user_id)
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

create table if not exists dm_threads (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists dm_thread_members (
  thread_id uuid not null references dm_threads(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);

create table if not exists dm_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references dm_threads(id) on delete cascade,
  sender_id uuid references users(id) on delete set null,
  content text not null,
  created_at timestamptz not null default now()
);

alter table users enable row level security;
alter table pages enable row level security;
alter table rooms enable row level security;
alter table posts enable row level security;
alter table comments enable row level security;
alter table post_votes enable row level security;
alter table comment_votes enable row level security;
alter table events enable row level security;
alter table dm_threads enable row level security;
alter table dm_thread_members enable row level security;
alter table dm_messages enable row level security;

create index if not exists idx_rooms_page_id on rooms(page_id);
create index if not exists idx_posts_room_id on posts(room_id);
create index if not exists idx_posts_user_id on posts(user_id);
create index if not exists idx_comments_post_id on comments(post_id);
create index if not exists idx_comments_reply_id on comments(reply_id);
create index if not exists idx_comments_user_id on comments(user_id);
create index if not exists idx_post_votes_user_id on post_votes(user_id);
create index if not exists idx_comment_votes_user_id on comment_votes(user_id);
create index if not exists idx_events_user_id on events(user_id);
create index if not exists idx_events_page_id on events(page_id);
create index if not exists idx_events_room_id on events(room_id);
create index if not exists idx_events_post_id on events(post_id);
create index if not exists idx_events_comment_id on events(comment_id);
create index if not exists idx_events_event_type on events(event_type);
create index if not exists idx_dm_thread_members_user_id on dm_thread_members(user_id);
create index if not exists idx_dm_messages_thread_id on dm_messages(thread_id);
create index if not exists idx_dm_messages_sender_id on dm_messages(sender_id);
create index if not exists idx_dm_messages_created_at on dm_messages(created_at);
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

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'posts'
  ) then
    alter publication supabase_realtime add table posts;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'comments'
  ) then
    alter publication supabase_realtime add table comments;
  end if;
end;
$$;

grant usage on schema public to authenticated;
grant select, insert, update, delete on table users to authenticated;
grant select, insert, update, delete on table pages to authenticated;
grant select, insert, update, delete on table rooms to authenticated;
grant select, insert, update, delete on table posts to authenticated;
grant select, insert, update, delete on table comments to authenticated;
grant select, insert, update, delete on table post_votes to authenticated;
grant select, insert, update, delete on table comment_votes to authenticated;
grant select, insert, update, delete on table events to authenticated;
grant select, insert, update on table dm_threads to authenticated;
grant select, insert on table dm_thread_members to authenticated;
grant select, insert on table dm_messages to authenticated;

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
drop policy if exists "authenticated users can read post votes" on post_votes;
drop policy if exists "authenticated users can write own post votes" on post_votes;
drop policy if exists "authenticated users can read comment votes" on comment_votes;
drop policy if exists "authenticated users can write own comment votes" on comment_votes;
drop policy if exists "authenticated users can read events" on events;
drop policy if exists "authenticated users can write events" on events;
drop policy if exists "authenticated members can read dm_threads" on dm_threads;
drop policy if exists "authenticated users can create dm_threads" on dm_threads;
drop policy if exists "authenticated members can update dm_threads" on dm_threads;
drop policy if exists "authenticated members can read dm_thread_members" on dm_thread_members;
drop policy if exists "thread creators can insert dm_thread_members" on dm_thread_members;
drop policy if exists "authenticated members can read dm_messages" on dm_messages;
drop policy if exists "authenticated members can insert dm_messages" on dm_messages;

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

create policy "authenticated users can read post votes"
  on post_votes for select
  to authenticated
  using (true);

create policy "authenticated users can write own post votes"
  on post_votes for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "authenticated users can read comment votes"
  on comment_votes for select
  to authenticated
  using (true);

create policy "authenticated users can write own comment votes"
  on comment_votes for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "authenticated users can read events"
  on events for select
  to authenticated
  using (true);

create policy "authenticated users can write events"
  on events for all
  to authenticated
  using (true)
  with check (true);

-- DM routes authenticate the request and enforce membership server-side.
-- Leave RLS enabled on DM tables without browser-facing policies so direct
-- client access stays blocked by default and server-side service role access
-- can perform the necessary membership checks explicitly.

create or replace function public.increment_post_likes(
  p_post_id uuid,
  p_delta integer
)
returns table(id uuid, likes integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_next_value integer := case when p_delta >= 0 then 1 else -1 end;
  v_previous_value integer;
  v_score_delta integer := 0;
begin
  if v_user_id is null then
    raise exception 'You must be signed in to vote';
  end if;

  insert into users (id)
  values (v_user_id)
  on conflict (id) do nothing;

  select post_votes.value
    into v_previous_value
    from post_votes
    where post_votes.post_id = p_post_id
      and post_votes.user_id = v_user_id
    for update;

  if v_previous_value is null then
    insert into post_votes (post_id, user_id, value)
    values (p_post_id, v_user_id, v_next_value);
    v_score_delta := v_next_value;
  elsif v_previous_value <> v_next_value then
    update post_votes
    set value = v_next_value,
        updated_at = now()
    where post_votes.post_id = p_post_id
      and post_votes.user_id = v_user_id;
    v_score_delta := v_next_value - v_previous_value;
  end if;

  return query
    update posts
    set likes = greatest(0, posts.likes + v_score_delta)
    where posts.id = p_post_id
    returning posts.id, posts.likes;
end;
$$;

create or replace function public.increment_comment_likes(
  p_comment_id uuid,
  p_delta integer
)
returns table(id uuid, likes integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_next_value integer := case when p_delta >= 0 then 1 else -1 end;
  v_previous_value integer;
  v_score_delta integer := 0;
begin
  if v_user_id is null then
    raise exception 'You must be signed in to vote';
  end if;

  insert into users (id)
  values (v_user_id)
  on conflict (id) do nothing;

  select comment_votes.value
    into v_previous_value
    from comment_votes
    where comment_votes.comment_id = p_comment_id
      and comment_votes.user_id = v_user_id
    for update;

  if v_previous_value is null then
    insert into comment_votes (comment_id, user_id, value)
    values (p_comment_id, v_user_id, v_next_value);
    v_score_delta := v_next_value;
  elsif v_previous_value <> v_next_value then
    update comment_votes
    set value = v_next_value,
        updated_at = now()
    where comment_votes.comment_id = p_comment_id
      and comment_votes.user_id = v_user_id;
    v_score_delta := v_next_value - v_previous_value;
  end if;

  return query
    update comments
    set likes = greatest(0, comments.likes + v_score_delta)
    where comments.id = p_comment_id
    returning comments.id, comments.likes;
end;
$$;

grant execute on function public.increment_post_likes(uuid, integer) to authenticated;
grant execute on function public.increment_comment_likes(uuid, integer) to authenticated;
