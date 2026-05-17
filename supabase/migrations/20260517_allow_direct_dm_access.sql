alter table if exists public.dm_threads enable row level security;
alter table if exists public.dm_thread_members enable row level security;
alter table if exists public.dm_messages enable row level security;

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

drop policy if exists "authenticated members can read dm_threads" on public.dm_threads;
drop policy if exists "authenticated users can create dm_threads" on public.dm_threads;
drop policy if exists "authenticated members can update dm_threads" on public.dm_threads;
drop policy if exists "authenticated members can read dm_thread_members" on public.dm_thread_members;
drop policy if exists "thread creators can insert dm_thread_members" on public.dm_thread_members;
drop policy if exists "authenticated members can read dm_messages" on public.dm_messages;
drop policy if exists "authenticated members can insert dm_messages" on public.dm_messages;

create policy "authenticated members can read dm_threads"
  on public.dm_threads
  for select
  to authenticated
  using (public.can_access_dm_thread(id));

create policy "authenticated users can create dm_threads"
  on public.dm_threads
  for insert
  to authenticated
  with check (created_by = public.current_app_user_id());

create policy "authenticated members can update dm_threads"
  on public.dm_threads
  for update
  to authenticated
  using (public.can_access_dm_thread(id))
  with check (public.can_access_dm_thread(id));

create policy "authenticated members can read dm_thread_members"
  on public.dm_thread_members
  for select
  to authenticated
  using (public.can_access_dm_thread(thread_id));

create policy "thread creators can insert dm_thread_members"
  on public.dm_thread_members
  for insert
  to authenticated
  with check (public.can_manage_dm_thread(thread_id));

create policy "authenticated members can read dm_messages"
  on public.dm_messages
  for select
  to authenticated
  using (public.can_access_dm_thread(thread_id));

create policy "authenticated members can insert dm_messages"
  on public.dm_messages
  for insert
  to authenticated
  with check (
    sender_id = public.current_app_user_id()
    and public.can_access_dm_thread(thread_id)
  );

grant execute on function public.current_app_user_id() to authenticated;
grant execute on function public.can_access_dm_thread(uuid) to authenticated;
grant execute on function public.can_manage_dm_thread(uuid) to authenticated;
