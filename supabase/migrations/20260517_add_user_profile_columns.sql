alter table public.users
  add column if not exists auth_user_id uuid,
  add column if not exists display_name text,
  add column if not exists avatar_url text,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_auth_user_id_fkey'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_auth_user_id_fkey
      foreign key (auth_user_id)
      references auth.users(id)
      on delete set null;
  end if;
end
$$;

create unique index if not exists users_auth_user_id_unique_idx
  on public.users (auth_user_id)
  where auth_user_id is not null;

create unique index if not exists users_username_lower_unique_idx
  on public.users (lower(username))
  where username is not null;

create index if not exists idx_users_auth_user_id
  on public.users (auth_user_id);

create index if not exists idx_users_username
  on public.users (username);
