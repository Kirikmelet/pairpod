create table if not exists public.dm_threads (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dm_thread_members (
  thread_id uuid not null references public.dm_threads(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);

create table if not exists public.dm_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.dm_threads(id) on delete cascade,
  sender_id uuid references public.users(id) on delete set null,
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.dm_threads enable row level security;
alter table public.dm_thread_members enable row level security;
alter table public.dm_messages enable row level security;

create index if not exists idx_dm_thread_members_user_id
  on public.dm_thread_members(user_id);

create index if not exists idx_dm_messages_thread_id
  on public.dm_messages(thread_id);

create index if not exists idx_dm_messages_sender_id
  on public.dm_messages(sender_id);

create index if not exists idx_dm_messages_created_at
  on public.dm_messages(created_at);

grant select, insert, update on table public.dm_threads to authenticated;
grant select, insert on table public.dm_thread_members to authenticated;
grant select, insert on table public.dm_messages to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'dm_threads'
      and policyname = 'authenticated members can read dm_threads'
  ) then
    create policy "authenticated members can read dm_threads"
      on public.dm_threads
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.dm_thread_members m
          join public.users u on u.id = m.user_id
          where m.thread_id = dm_threads.id
            and u.auth_user_id = auth.uid()
        )
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'dm_threads'
      and policyname = 'authenticated users can create dm_threads'
  ) then
    create policy "authenticated users can create dm_threads"
      on public.dm_threads
      for insert
      to authenticated
      with check (
        exists (
          select 1
          from public.users u
          where u.id = dm_threads.created_by
            and u.auth_user_id = auth.uid()
        )
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'dm_threads'
      and policyname = 'authenticated members can update dm_threads'
  ) then
    create policy "authenticated members can update dm_threads"
      on public.dm_threads
      for update
      to authenticated
      using (
        exists (
          select 1
          from public.dm_thread_members m
          join public.users u on u.id = m.user_id
          where m.thread_id = dm_threads.id
            and u.auth_user_id = auth.uid()
        )
      )
      with check (
        exists (
          select 1
          from public.dm_thread_members m
          join public.users u on u.id = m.user_id
          where m.thread_id = dm_threads.id
            and u.auth_user_id = auth.uid()
        )
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'dm_thread_members'
      and policyname = 'authenticated members can read dm_thread_members'
  ) then
    create policy "authenticated members can read dm_thread_members"
      on public.dm_thread_members
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.dm_thread_members self_member
          join public.users u on u.id = self_member.user_id
          where self_member.thread_id = dm_thread_members.thread_id
            and u.auth_user_id = auth.uid()
        )
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'dm_thread_members'
      and policyname = 'thread creators can insert dm_thread_members'
  ) then
    create policy "thread creators can insert dm_thread_members"
      on public.dm_thread_members
      for insert
      to authenticated
      with check (
        exists (
          select 1
          from public.dm_threads t
          join public.users u on u.id = t.created_by
          where t.id = dm_thread_members.thread_id
            and u.auth_user_id = auth.uid()
        )
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'dm_messages'
      and policyname = 'authenticated members can read dm_messages'
  ) then
    create policy "authenticated members can read dm_messages"
      on public.dm_messages
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.dm_thread_members m
          join public.users u on u.id = m.user_id
          where m.thread_id = dm_messages.thread_id
            and u.auth_user_id = auth.uid()
        )
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'dm_messages'
      and policyname = 'authenticated members can insert dm_messages'
  ) then
    create policy "authenticated members can insert dm_messages"
      on public.dm_messages
      for insert
      to authenticated
      with check (
        exists (
          select 1
          from public.users sender
          join public.dm_thread_members m on m.user_id = sender.id
          where sender.id = dm_messages.sender_id
            and sender.auth_user_id = auth.uid()
            and m.thread_id = dm_messages.thread_id
        )
      );
  end if;
end
$$;
