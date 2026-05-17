create extension if not exists pgcrypto;

drop table if exists events;
drop table if exists dm_messages;
drop table if exists dm_thread_reads;
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
drop table if exists chat;
drop table if exists pages;
drop table if exists "TrainingData";
drop table if exists users;

-- Writes use authenticated Supabase sessions from the app, extension, or server routes.
-- RLS stays enabled so anonymous clients cannot write project data.

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete set null,
  username text unique,
  display_name text,
  avatar_url text default 'https://xgfgqzveuyeceupfaebh.supabase.co/storage/v1/object/public/profile_pictures/default_user.png',
  clothing_url text,
  email text,
  password text,
  url text,
  configurations jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table users add column if not exists display_name text;
alter table users add column if not exists avatar_url text;
alter table users alter column avatar_url set default 'https://xgfgqzveuyeceupfaebh.supabase.co/storage/v1/object/public/profile_pictures/default_user.png';
alter table users add column if not exists clothing_url text;
alter table users add column if not exists password text;
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

create table if not exists page_routes (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references pages(id) on delete cascade,
  path text not null,
  label text,
  source text not null default 'discovered',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (page_id, path)
);

create table if not exists page_presence (
  page_id uuid not null references pages(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  primary key (page_id, user_id)
);

create table if not exists chat (
  room_id uuid not null,
  created_at timestamptz not null default now(),
  user_id uuid references users(id) on delete set null,
  body text,
  chat_id uuid not null default gen_random_uuid(),
  constraint chat_pkey primary key (chat_id),
  constraint chat_page_id_fkey foreign key (room_id) references pages(id) on delete cascade
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
  post_id uuid references posts(id) on delete cascade,
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

create table if not exists dm_thread_reads (
  thread_id uuid not null references dm_threads(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  last_opened_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
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
alter table page_routes enable row level security;
alter table page_presence enable row level security;
alter table chat enable row level security;
alter table rooms enable row level security;
alter table posts enable row level security;
alter table comments enable row level security;
alter table post_votes enable row level security;
alter table comment_votes enable row level security;
alter table events enable row level security;
alter table dm_threads enable row level security;
alter table dm_thread_members enable row level security;
alter table dm_thread_reads enable row level security;
alter table dm_messages enable row level security;

create index if not exists idx_chat_room_id on chat(room_id);
create index if not exists idx_page_routes_page_id on page_routes(page_id);
create index if not exists idx_page_presence_seen on page_presence(page_id, last_seen_at);
create index if not exists idx_chat_user_id on chat(user_id);
create index if not exists idx_chat_created_at on chat(created_at);
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
create index if not exists idx_dm_thread_reads_user_id on dm_thread_reads(user_id);
create index if not exists idx_dm_thread_reads_updated_at on dm_thread_reads(updated_at);
create index if not exists idx_dm_messages_thread_id on dm_messages(thread_id);
create index if not exists idx_dm_messages_sender_id on dm_messages(sender_id);
create index if not exists idx_dm_messages_created_at on dm_messages(created_at);
create index if not exists idx_users_auth_user_id on users(auth_user_id);
create index if not exists idx_users_username on users(username);
create unique index if not exists users_auth_user_id_unique_idx on users(auth_user_id) where auth_user_id is not null;
create unique index if not exists users_username_lower_unique_idx on users(lower(username)) where username is not null;

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

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'public can read profile pictures'
  ) then
    create policy "public can read profile pictures"
      on storage.objects
      for select
      to public
      using (bucket_id = 'profile_pictures');
  end if;
end
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'character_clothing',
  'character_clothing',
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
      and policyname = 'public can read character clothing'
  ) then
    create policy "public can read character clothing"
      on storage.objects
      for select
      to public
      using (bucket_id = 'character_clothing');
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
      and policyname = 'authenticated users can insert own character clothing'
  ) then
    create policy "authenticated users can insert own character clothing"
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'character_clothing'
        and (storage.foldername(name))[1] = auth.uid()::text
        and name = auth.uid()::text || '/clothing.png'
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
      and policyname = 'authenticated users can update own character clothing'
  ) then
    create policy "authenticated users can update own character clothing"
      on storage.objects
      for update
      to authenticated
      using (
        bucket_id = 'character_clothing'
        and (storage.foldername(name))[1] = auth.uid()::text
        and name = auth.uid()::text || '/clothing.png'
      )
      with check (
        bucket_id = 'character_clothing'
        and (storage.foldername(name))[1] = auth.uid()::text
        and name = auth.uid()::text || '/clothing.png'
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
      and policyname = 'authenticated users can insert own profile picture'
  ) then
    create policy "authenticated users can insert own profile picture"
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'profile_pictures'
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
      and policyname = 'authenticated users can update own profile picture'
  ) then
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

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat'
  ) then
    alter publication supabase_realtime add table chat;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'dm_messages'
  ) then
    alter publication supabase_realtime add table dm_messages;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'dm_thread_reads'
  ) then
    alter publication supabase_realtime add table dm_thread_reads;
  end if;
end;
$$;

grant usage on schema public to authenticated;
grant select, insert, update, delete on table users to authenticated;
grant select, insert, update, delete on table pages to authenticated;
grant select, insert, update, delete on table chat to authenticated;
grant select, insert, update, delete on table rooms to authenticated;
grant select, insert, update, delete on table page_routes to authenticated;
grant select, insert, update, delete on table page_presence to authenticated;
grant select, insert, update, delete on table posts to authenticated;
grant select, insert, update, delete on table comments to authenticated;
grant select, insert, update, delete on table post_votes to authenticated;
grant select, insert, update, delete on table comment_votes to authenticated;
grant select, insert, update, delete on table events to authenticated;
grant select, insert, update on table dm_threads to authenticated;
grant select, insert on table dm_thread_members to authenticated;
grant select, insert, update on table dm_thread_reads to authenticated;
grant select, insert on table dm_messages to authenticated;

drop policy if exists "authenticated users can read users" on users;
drop policy if exists "authenticated users can write users" on users;
drop policy if exists "authenticated users can read pages" on pages;
drop policy if exists "authenticated users can write pages" on pages;
drop policy if exists "authenticated users can read page routes" on page_routes;
drop policy if exists "authenticated users can write page routes" on page_routes;
drop policy if exists "authenticated users can read page presence" on page_presence;
drop policy if exists "authenticated users can write page presence" on page_presence;
drop policy if exists "authenticated users can read chat" on chat;
drop policy if exists "authenticated users can write chat" on chat;
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
drop policy if exists "authenticated members can read dm_thread_reads" on dm_thread_reads;
drop policy if exists "authenticated members can upsert own dm_thread_reads" on dm_thread_reads;
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

create policy "authenticated users can read page routes"
  on page_routes for select
  to authenticated
  using (true);

create policy "authenticated users can write page routes"
  on page_routes for all
  to authenticated
  using (true)
  with check (true);

create policy "authenticated users can read page presence"
  on page_presence for select
  to authenticated
  using (true);

create policy "authenticated users can write page presence"
  on page_presence for all
  to authenticated
  using (true)
  with check (true);

create policy "authenticated users can read chat"
  on chat for select
  to authenticated
  using (true);

create policy "authenticated users can write chat"
  on chat for all
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

create or replace function public.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select users.id
  from public.users
  where users.auth_user_id = auth.uid()
  limit 1
$$;

create policy "authenticated users can write own post votes"
  on post_votes for all
  to authenticated
  using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());

create policy "authenticated users can read comment votes"
  on comment_votes for select
  to authenticated
  using (true);

create policy "authenticated users can write own comment votes"
  on comment_votes for all
  to authenticated
  using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());

create policy "authenticated users can read events"
  on events for select
  to authenticated
  using (true);

create policy "authenticated users can write events"
  on events for all
  to authenticated
  using (true)
  with check (true);

create or replace function public.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select users.id
  from public.users
  where users.auth_user_id = auth.uid()
  limit 1
$$;

create or replace function public.can_access_dm_thread(p_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.dm_thread_members member
    where member.thread_id = p_thread_id
      and member.user_id = public.current_app_user_id()
  )
$$;

create or replace function public.can_manage_dm_thread(p_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.dm_threads thread
    where thread.id = p_thread_id
      and thread.created_by = public.current_app_user_id()
  )
$$;

create policy "authenticated members can read dm_threads"
  on dm_threads for select
  to authenticated
  using (public.can_access_dm_thread(id));

create policy "authenticated users can create dm_threads"
  on dm_threads for insert
  to authenticated
  with check (created_by = public.current_app_user_id());

create policy "authenticated members can update dm_threads"
  on dm_threads for update
  to authenticated
  using (public.can_access_dm_thread(id))
  with check (public.can_access_dm_thread(id));

create policy "authenticated members can read dm_thread_members"
  on dm_thread_members for select
  to authenticated
  using (public.can_access_dm_thread(thread_id));

create policy "thread creators can insert dm_thread_members"
  on dm_thread_members for insert
  to authenticated
  with check (public.can_manage_dm_thread(thread_id));

create policy "authenticated members can read dm_thread_reads"
  on dm_thread_reads for select
  to authenticated
  using (public.can_access_dm_thread(thread_id));

create policy "authenticated members can upsert own dm_thread_reads"
  on dm_thread_reads for all
  to authenticated
  using (
    user_id = public.current_app_user_id()
    and public.can_access_dm_thread(thread_id)
  )
  with check (
    user_id = public.current_app_user_id()
    and public.can_access_dm_thread(thread_id)
  );

create policy "authenticated members can read dm_messages"
  on dm_messages for select
  to authenticated
  using (public.can_access_dm_thread(thread_id));

create policy "authenticated members can insert dm_messages"
  on dm_messages for insert
  to authenticated
  with check (
    sender_id = public.current_app_user_id()
    and public.can_access_dm_thread(thread_id)
  );

grant execute on function public.current_app_user_id() to authenticated;
grant execute on function public.can_access_dm_thread(uuid) to authenticated;
grant execute on function public.can_manage_dm_thread(uuid) to authenticated;

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
  v_auth_user_id uuid := auth.uid();
  v_user_id uuid;
  v_next_value integer := case when p_delta > 0 then 1 when p_delta < 0 then -1 else null end;
  v_previous_value integer;
  v_score_delta integer := 0;
begin
  if v_auth_user_id is null then
    raise exception 'You must be signed in to vote';
  end if;

  select app_users.id
    into v_user_id
    from public.users as app_users
    where app_users.auth_user_id = v_auth_user_id
       or app_users.id = v_auth_user_id
    order by app_users.auth_user_id is null
    limit 1;

  if v_user_id is null then
    insert into public.users (auth_user_id)
    values (v_auth_user_id)
    returning users.id into v_user_id;
  end if;

  select post_votes.value
    into v_previous_value
    from public.post_votes as post_votes
    where post_votes.post_id = p_post_id
      and post_votes.user_id = v_user_id
    for update;

  if v_next_value is null then
    if v_previous_value is not null then
      delete from public.post_votes as post_votes
      where post_votes.post_id = p_post_id
        and post_votes.user_id = v_user_id;
      v_score_delta := -v_previous_value;
    end if;
  elsif v_previous_value is null then
    insert into public.post_votes (post_id, user_id, value)
    values (p_post_id, v_user_id, v_next_value);
    v_score_delta := v_next_value;
  elsif v_previous_value <> v_next_value then
    update public.post_votes as post_votes
    set value = v_next_value,
        updated_at = now()
    where post_votes.post_id = p_post_id
      and post_votes.user_id = v_user_id;
    v_score_delta := v_next_value - v_previous_value;
  end if;

  return query
    update public.posts as updated_post
    set likes = updated_post.likes + v_score_delta
    where updated_post.id = p_post_id
    returning updated_post.id as id, updated_post.likes as likes;
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
  v_auth_user_id uuid := auth.uid();
  v_user_id uuid;
  v_next_value integer := case when p_delta > 0 then 1 when p_delta < 0 then -1 else null end;
  v_previous_value integer;
  v_score_delta integer := 0;
begin
  if v_auth_user_id is null then
    raise exception 'You must be signed in to vote';
  end if;

  select app_users.id
    into v_user_id
    from public.users as app_users
    where app_users.auth_user_id = v_auth_user_id
       or app_users.id = v_auth_user_id
    order by app_users.auth_user_id is null
    limit 1;

  if v_user_id is null then
    insert into public.users (auth_user_id)
    values (v_auth_user_id)
    returning users.id into v_user_id;
  end if;

  select comment_votes.value
    into v_previous_value
    from public.comment_votes as comment_votes
    where comment_votes.comment_id = p_comment_id
      and comment_votes.user_id = v_user_id
    for update;

  if v_next_value is null then
    if v_previous_value is not null then
      delete from public.comment_votes as comment_votes
      where comment_votes.comment_id = p_comment_id
        and comment_votes.user_id = v_user_id;
      v_score_delta := -v_previous_value;
    end if;
  elsif v_previous_value is null then
    insert into public.comment_votes (comment_id, user_id, value)
    values (p_comment_id, v_user_id, v_next_value);
    v_score_delta := v_next_value;
  elsif v_previous_value <> v_next_value then
    update public.comment_votes as comment_votes
    set value = v_next_value,
        updated_at = now()
    where comment_votes.comment_id = p_comment_id
      and comment_votes.user_id = v_user_id;
    v_score_delta := v_next_value - v_previous_value;
  end if;

  return query
    update public.comments as updated_comment
    set likes = updated_comment.likes + v_score_delta
    where updated_comment.id = p_comment_id
    returning updated_comment.id as id, updated_comment.likes as likes;
end;
$$;

grant execute on function public.increment_post_likes(uuid, integer) to authenticated;
grant execute on function public.increment_comment_likes(uuid, integer) to authenticated;
