alter table if exists public.dm_threads enable row level security;
alter table if exists public.dm_thread_members enable row level security;
alter table if exists public.dm_messages enable row level security;

drop policy if exists "authenticated members can read dm_threads" on public.dm_threads;
drop policy if exists "authenticated users can create dm_threads" on public.dm_threads;
drop policy if exists "authenticated members can update dm_threads" on public.dm_threads;

drop policy if exists "authenticated members can read dm_thread_members" on public.dm_thread_members;
drop policy if exists "thread creators can insert dm_thread_members" on public.dm_thread_members;

drop policy if exists "authenticated members can read dm_messages" on public.dm_messages;
drop policy if exists "authenticated members can insert dm_messages" on public.dm_messages;

comment on table public.dm_threads is
  'DM access is enforced in server-side API routes using the service role client; direct browser access remains blocked by RLS.';

comment on table public.dm_thread_members is
  'DM access is enforced in server-side API routes using the service role client; direct browser access remains blocked by RLS.';

comment on table public.dm_messages is
  'DM access is enforced in server-side API routes using the service role client; direct browser access remains blocked by RLS.';
