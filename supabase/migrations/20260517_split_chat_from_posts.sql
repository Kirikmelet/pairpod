create table if not exists public.chat (
  room_id uuid not null,
  created_at timestamptz not null default now(),
  user_id uuid references public.users(id) on delete set null,
  body text,
  chat_id uuid not null default gen_random_uuid(),
  constraint chat_pkey primary key (chat_id),
  constraint chat_page_id_fkey foreign key (room_id) references public.pages(id) on delete cascade
);

insert into public.chat (chat_id, room_id, user_id, body, created_at)
select posts.id, rooms.page_id, posts.user_id, posts.content, posts.created_at
from public.posts
join public.rooms on rooms.id = posts.room_id
where posts.type = 'chat'
on conflict (chat_id) do nothing;

delete from public.posts
where type = 'chat';

alter table public.chat enable row level security;

create index if not exists idx_chat_room_id on public.chat(room_id);
create index if not exists idx_chat_user_id on public.chat(user_id);
create index if not exists idx_chat_created_at on public.chat(created_at);

grant select, insert, update, delete on table public.chat to authenticated;

drop policy if exists "authenticated users can read chat" on public.chat;
drop policy if exists "authenticated users can write chat" on public.chat;

create policy "authenticated users can read chat"
  on public.chat for select
  to authenticated
  using (true);

create policy "authenticated users can write chat"
  on public.chat for all
  to authenticated
  using (true)
  with check (true);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat'
  ) then
    alter publication supabase_realtime add table public.chat;
  end if;
end;
$$;
