grant usage on schema public to authenticated;
grant select, insert, update, delete on table users to authenticated;
grant select, insert, update, delete on table pages to authenticated;
grant select, insert, update, delete on table rooms to authenticated;
grant select, insert, update, delete on table posts to authenticated;
grant select, insert, update, delete on table comments to authenticated;
grant select, insert, update, delete on table events to authenticated;

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
drop policy if exists "authenticated users can read events" on events;
drop policy if exists "authenticated users can write events" on events;

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

create policy "authenticated users can read events"
  on events for select
  to authenticated
  using (true);

create policy "authenticated users can write events"
  on events for all
  to authenticated
  using (true)
  with check (true);
