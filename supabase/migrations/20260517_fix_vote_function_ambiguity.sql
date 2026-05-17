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
  v_next_value integer := case when p_delta >= 0 then 1 else -1 end;
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

  if v_previous_value is null then
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
    set likes = greatest(0, updated_post.likes + v_score_delta)
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
  v_next_value integer := case when p_delta >= 0 then 1 else -1 end;
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

  if v_previous_value is null then
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
    set likes = greatest(0, updated_comment.likes + v_score_delta)
    where updated_comment.id = p_comment_id
    returning updated_comment.id as id, updated_comment.likes as likes;
end;
$$;

grant execute on function public.increment_post_likes(uuid, integer) to authenticated;
grant execute on function public.increment_comment_likes(uuid, integer) to authenticated;
