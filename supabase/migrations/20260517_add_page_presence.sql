create table if not exists public.page_presence (
  page_id uuid not null references public.pages(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  last_seen_at timestamp with time zone not null default now(),
  primary key (page_id, user_id)
);

alter table public.page_presence enable row level security;

create index if not exists idx_page_presence_seen
  on public.page_presence(page_id, last_seen_at);

grant select, insert, update, delete on table public.page_presence to authenticated;

drop policy if exists "authenticated users can read page presence" on public.page_presence;
drop policy if exists "authenticated users can write page presence" on public.page_presence;

create policy "authenticated users can read page presence"
  on public.page_presence for select
  to authenticated
  using (true);

create policy "authenticated users can write page presence"
  on public.page_presence for all
  to authenticated
  using (true)
  with check (true);
