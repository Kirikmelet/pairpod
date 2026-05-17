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

-- Backend writes use SUPABASE_SERVICE_ROLE_KEY through Next.js API routes.
-- RLS stays enabled so clients cannot bypass the backend by writing directly.

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  username text unique,
  email text,
  url text,
  configurations jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

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
