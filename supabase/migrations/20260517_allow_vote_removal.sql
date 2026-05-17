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

grant execute on function public.current_app_user_id() to authenticated;

drop policy if exists "authenticated users can write own post votes" on public.post_votes;
create policy "authenticated users can write own post votes"
  on public.post_votes for all
  to authenticated
  using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());

drop policy if exists "authenticated users can write own comment votes" on public.comment_votes;
create policy "authenticated users can write own comment votes"
  on public.comment_votes for all
  to authenticated
  using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());
