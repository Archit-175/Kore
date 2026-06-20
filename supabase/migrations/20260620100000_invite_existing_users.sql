-- ============================================================================
-- Fix: invites must also resolve for users who already signed up.
-- The signup trigger (handle_new_user) links pending invites at signup time.
-- But if someone signs up FIRST (e.g. via Google) and is invited LATER, nothing
-- linked them. invite_member() handles both directions:
--   * email belongs to an existing user  → membership active immediately
--   * email has no user yet              → pending (trigger links it on signup)
-- SECURITY DEFINER so it can read profiles + write memberships past RLS.
-- ============================================================================
create or replace function public.invite_member(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ws   uuid;
  v_user uuid;
begin
  -- Phase 1: a single workspace.
  select id into v_ws from public.workspaces order by created_at limit 1;
  if v_ws is null then
    raise exception 'no workspace';
  end if;
  if not exists (
    select 1 from public.workspaces where id = v_ws and owner_id = auth.uid()
  ) then
    raise exception 'only the workspace owner can invite';
  end if;

  -- Existing user with this email? (profiles mirrors auth.users)
  select id into v_user from public.profiles where lower(email) = lower(p_email) limit 1;

  insert into public.memberships
    (workspace_id, user_id, invited_email, role, status, joined_at, invited_by)
  values (
    v_ws,
    v_user,
    lower(p_email),
    'editor',
    case when v_user is not null then 'active' else 'pending' end,
    case when v_user is not null then now()    else null     end,
    auth.uid()
  )
  on conflict (workspace_id, lower(invited_email)) do update
    set user_id   = excluded.user_id,
        status    = excluded.status,
        joined_at = coalesce(excluded.joined_at, public.memberships.joined_at);
end;
$$;

revoke all on function public.invite_member(text) from public;
grant execute on function public.invite_member(text) to authenticated;
