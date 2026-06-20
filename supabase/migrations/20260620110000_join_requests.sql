-- ============================================================================
-- Request-to-join + owner approval (in addition to invite-gating).
--   * invited email signs up        → active (handled earlier)
--   * uninvited person signs up      → 'requested' (owner approves/denies)
--   * already-signed-up user         → can hit request_access() to ask
-- New membership status: 'requested'.
-- ============================================================================

alter table public.memberships drop constraint if exists memberships_status_check;
alter table public.memberships
  add constraint memberships_status_check
  check (status in ('pending', 'requested', 'active'));

-- Signup handler: mirror profile, resolve an invite, else file a join request.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update set email = excluded.email;

  -- Invited? auto-join as active Editor.
  update public.memberships
     set user_id   = new.id,
         status    = 'active',
         joined_at = now()
   where user_id is null
     and status = 'pending'
     and lower(invited_email) = lower(new.email);

  -- Not invited (and a workspace exists)? file a join request for the owner.
  if not exists (select 1 from public.memberships where user_id = new.id) then
    insert into public.memberships (workspace_id, user_id, invited_email, role, status)
    select w.id, new.id, lower(new.email), 'editor', 'requested'
      from public.workspaces w
      order by w.created_at
      limit 1
    on conflict (workspace_id, lower(invited_email)) do nothing;
  end if;

  return new;
end;
$$;

-- Let an already-signed-up, non-member user file/refresh their own request.
create or replace function public.request_access()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ws    uuid;
  v_email text;
begin
  if auth.uid() is null then return; end if;
  select id into v_ws from public.workspaces order by created_at limit 1;
  if v_ws is null then return; end if;
  if exists (
    select 1 from public.memberships where workspace_id = v_ws and user_id = auth.uid()
  ) then
    return; -- already a member or already requested
  end if;
  select email into v_email from auth.users where id = auth.uid();
  insert into public.memberships (workspace_id, user_id, invited_email, role, status)
  values (v_ws, auth.uid(), lower(v_email), 'editor', 'requested')
  on conflict (workspace_id, lower(invited_email)) do update
    set user_id = excluded.user_id;
end;
$$;
revoke all on function public.request_access() from public;
grant execute on function public.request_access() to authenticated;

-- The current user's own membership status (RLS hides non-member rows, so a
-- requester needs this to see "waiting for approval").
create or replace function public.my_membership_status()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select status from public.memberships
  where user_id = auth.uid()
  order by created_at desc
  limit 1;
$$;
revoke all on function public.my_membership_status() from public;
grant execute on function public.my_membership_status() to authenticated;
