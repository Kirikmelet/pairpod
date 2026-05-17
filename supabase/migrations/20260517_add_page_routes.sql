create table if not exists public.page_routes (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages(id) on delete cascade,
  path text not null,
  label text,
  source text not null default 'discovered',
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (page_id, path)
);

alter table public.page_routes enable row level security;

create index if not exists idx_page_routes_page_id
  on public.page_routes(page_id);

grant select, insert, update, delete on table public.page_routes to authenticated;

drop policy if exists "authenticated users can read page routes" on public.page_routes;
drop policy if exists "authenticated users can write page routes" on public.page_routes;

create policy "authenticated users can read page routes"
  on public.page_routes for select
  to authenticated
  using (true);

create policy "authenticated users can write page routes"
  on public.page_routes for all
  to authenticated
  using (true)
  with check (true);
