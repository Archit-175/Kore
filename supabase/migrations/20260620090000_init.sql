-- ============================================================================
-- Kore — Phase 1 (Foundation) initial migration
-- ----------------------------------------------------------------------------
-- Single workspace · teams = org grouping (no visibility walls) ·
-- roles: owner + editor (no viewer) · invite-gated access.
--
-- Security model: RLS enabled on EVERY table. Membership checks go through
-- SECURITY DEFINER helper functions so policies never recurse into the
-- memberships policy that calls them.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Enum
-- ----------------------------------------------------------------------------
create type public.member_role as enum ('owner', 'editor');

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

-- profiles: app-readable mirror of auth.users (avatars, names for presence)
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index profiles_email_key on public.profiles (lower(email));

-- workspaces: there is exactly one in Phase 1, but scoped for future-proofing
create table public.workspaces (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  owner_id   uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

-- teams: organizational grouping inside the workspace (NO visibility isolation)
create table public.teams (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name         text not null,
  icon         text,
  position     int  not null default 0,
  created_by   uuid references auth.users (id),
  created_at   timestamptz not null default now()
);
create index teams_workspace_idx on public.teams (workspace_id);

-- memberships: email-keyed invites. Owner creates a 'pending' row; the auth
-- trigger flips it to 'active' + stamps user_id when that email signs up.
create table public.memberships (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  user_id       uuid references auth.users (id) on delete cascade,        -- NULL while pending
  invited_email text not null,
  role          public.member_role not null default 'editor',
  status        text not null default 'pending' check (status in ('pending', 'active')),
  invited_by    uuid references auth.users (id),
  created_at    timestamptz not null default now(),
  joined_at     timestamptz
);
create unique index memberships_ws_email_key on public.memberships (workspace_id, lower(invited_email));
create unique index memberships_ws_user_key  on public.memberships (workspace_id, user_id) where user_id is not null;
create index        memberships_user_idx      on public.memberships (user_id);

-- projects: belong to a team; workspace_id denormalized so RLS is a single hop
create table public.projects (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  team_id      uuid not null references public.teams (id) on delete cascade,
  name         text not null,
  icon         text,
  position     int  not null default 0,
  created_by   uuid references auth.users (id),
  created_at   timestamptz not null default now()
);
create index projects_team_idx      on public.projects (team_id);
create index projects_workspace_idx on public.projects (workspace_id);

-- favorites / recents: per-user lists
create table public.favorites (
  user_id      uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  target_type  text not null,                    -- 'project' | 'page' | 'whiteboard' | ...
  target_id    uuid not null,
  created_at   timestamptz not null default now(),
  primary key (user_id, target_type, target_id)
);

create table public.recents (
  user_id      uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  target_type  text not null,
  target_id    uuid not null,
  visited_at   timestamptz not null default now(),
  primary key (user_id, target_type, target_id)
);
create index recents_user_visited_idx on public.recents (user_id, visited_at desc);

-- yjs_documents: one full Yjs snapshot per collaborative doc (last-writer-wins).
-- Phase 1 uses doc_type='scratchpad', doc_id = projects.id. bytea (not base64
-- text): native binary, no ~33% inflation, opaque (never queried by content).
create table public.yjs_documents (
  doc_type     text not null,
  doc_id       uuid not null,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  state        bytea not null,
  seq          bigint not null default 0,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users (id),
  primary key (doc_type, doc_id)
);
create index yjs_documents_workspace_idx on public.yjs_documents (workspace_id);

-- ----------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER → bypass RLS internally → no recursion)
-- ----------------------------------------------------------------------------
create or replace function public.is_workspace_member(p_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.workspace_id = p_workspace
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function public.is_workspace_owner(p_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- Reads workspaces (not memberships) so the owner check is also recursion-proof
  select exists (
    select 1 from public.workspaces w
    where w.id = p_workspace and w.owner_id = auth.uid()
  );
$$;

create or replace function public.current_user_role(p_workspace uuid)
returns public.member_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role from public.memberships m
  where m.workspace_id = p_workspace
    and m.user_id = auth.uid()
    and m.status = 'active'
  limit 1;
$$;

-- co-membership check for profile visibility (single workspace ⇒ everyone, but
-- kept correct for future multi-workspace)
create or replace function public.are_co_members(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m_self
    join public.memberships m_other on m_other.workspace_id = m_self.workspace_id
    where m_self.user_id = auth.uid() and m_self.status = 'active'
      and m_other.user_id = p_user   and m_other.status = 'active'
  );
$$;

revoke all on function public.is_workspace_member(uuid) from public;
revoke all on function public.is_workspace_owner(uuid)  from public;
revoke all on function public.current_user_role(uuid)   from public;
revoke all on function public.are_co_members(uuid)      from public;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.is_workspace_owner(uuid)  to authenticated;
grant execute on function public.current_user_role(uuid)   to authenticated;
grant execute on function public.are_co_members(uuid)      to authenticated;

-- ----------------------------------------------------------------------------
-- Auth trigger: mirror profile + resolve email invite, in the signup txn
-- ----------------------------------------------------------------------------
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

  -- Invite-gated auto-join: flip any pending invite for this email to active.
  -- Works for both password and Google signups (both populate new.email).
  update public.memberships
     set user_id   = new.id,
         status    = 'active',
         joined_at = now()
   where user_id is null
     and status = 'pending'
     and lower(invited_email) = lower(new.email);

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- keep profiles.updated_at fresh
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- RPC: bootstrap the single workspace (solves the RLS chicken-and-egg)
-- ----------------------------------------------------------------------------
create or replace function public.bootstrap_workspace(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ws    uuid;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if exists (select 1 from public.workspaces) then
    raise exception 'workspace already exists';
  end if;

  select email into v_email from auth.users where id = auth.uid();

  insert into public.workspaces (name, owner_id)
  values (coalesce(nullif(trim(p_name), ''), 'Kore'), auth.uid())
  returning id into v_ws;

  insert into public.memberships (workspace_id, user_id, invited_email, role, status, joined_at)
  values (v_ws, auth.uid(), v_email, 'owner', 'active', now());

  return v_ws;
end;
$$;

revoke all on function public.bootstrap_workspace(text) from public;
grant execute on function public.bootstrap_workspace(text) to authenticated;

-- Lets a not-yet-member tell setup (first run) from request-access, without
-- exposing any workspace data (workspaces RLS hides rows from non-members).
create or replace function public.workspace_exists()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.workspaces);
$$;
revoke all on function public.workspace_exists() from public;
grant execute on function public.workspace_exists() to authenticated;

-- ----------------------------------------------------------------------------
-- RPCs: Yjs snapshot save/load (base64 only at the wire boundary; RLS applies)
-- ----------------------------------------------------------------------------
create or replace function public.save_yjs_snapshot(
  p_doc_type     text,
  p_doc_id       uuid,
  p_workspace_id uuid,
  p_state_b64    text
)
returns void
language plpgsql
security invoker           -- RLS on yjs_documents authorizes the writer
set search_path = ''
as $$
begin
  insert into public.yjs_documents (doc_type, doc_id, workspace_id, state, updated_by, updated_at, seq)
  values (p_doc_type, p_doc_id, p_workspace_id, decode(p_state_b64, 'base64'), auth.uid(), now(), 0)
  on conflict (doc_type, doc_id) do update
    set state      = excluded.state,
        updated_by = excluded.updated_by,
        updated_at = now(),
        seq        = public.yjs_documents.seq + 1;
end;
$$;
grant execute on function public.save_yjs_snapshot(text, uuid, uuid, text) to authenticated;

create or replace function public.load_yjs_snapshot(p_doc_type text, p_doc_id uuid)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select encode(state, 'base64')
  from public.yjs_documents
  where doc_type = p_doc_type and doc_id = p_doc_id;
$$;
grant execute on function public.load_yjs_snapshot(text, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Table privileges (RLS remains the security boundary)
-- ----------------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- ============================================================================
-- RLS — every table
-- ============================================================================

-- profiles ------------------------------------------------------------------
alter table public.profiles enable row level security;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.are_co_members(public.profiles.id));
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- workspaces ----------------------------------------------------------------
-- No INSERT policy: creation only via bootstrap_workspace() (security definer).
alter table public.workspaces enable row level security;
create policy workspaces_select on public.workspaces
  for select to authenticated
  using (owner_id = auth.uid() or public.is_workspace_member(id));
create policy workspaces_update on public.workspaces
  for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy workspaces_delete on public.workspaces
  for delete to authenticated
  using (owner_id = auth.uid());

-- memberships ---------------------------------------------------------------
-- Members read the roster; only the owner creates/edits/revokes invites.
-- (Auto-join writes happen via the SECURITY DEFINER trigger, bypassing these.)
alter table public.memberships enable row level security;
create policy memberships_select on public.memberships
  for select to authenticated
  using (public.is_workspace_member(workspace_id) or public.is_workspace_owner(workspace_id));
create policy memberships_insert on public.memberships
  for insert to authenticated
  with check (public.is_workspace_owner(workspace_id));
create policy memberships_update on public.memberships
  for update to authenticated
  using (public.is_workspace_owner(workspace_id)) with check (public.is_workspace_owner(workspace_id));
create policy memberships_delete on public.memberships
  for delete to authenticated
  using (public.is_workspace_owner(workspace_id));

-- teams ---------------------------------------------------------------------
alter table public.teams enable row level security;
create policy teams_select on public.teams
  for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy teams_insert on public.teams
  for insert to authenticated
  with check (public.is_workspace_owner(workspace_id));
create policy teams_update on public.teams
  for update to authenticated
  using (public.is_workspace_owner(workspace_id)) with check (public.is_workspace_owner(workspace_id));
create policy teams_delete on public.teams
  for delete to authenticated
  using (public.is_workspace_owner(workspace_id));

-- projects ------------------------------------------------------------------
-- Members read AND create/edit (editors edit everything); delete is owner-only.
alter table public.projects enable row level security;
create policy projects_select on public.projects
  for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy projects_insert on public.projects
  for insert to authenticated
  with check (public.is_workspace_member(workspace_id));
create policy projects_update on public.projects
  for update to authenticated
  using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy projects_delete on public.projects
  for delete to authenticated
  using (public.is_workspace_owner(workspace_id));

-- favorites -----------------------------------------------------------------
alter table public.favorites enable row level security;
create policy favorites_all on public.favorites
  for all to authenticated
  using (user_id = auth.uid() and public.is_workspace_member(workspace_id))
  with check (user_id = auth.uid() and public.is_workspace_member(workspace_id));

-- recents -------------------------------------------------------------------
alter table public.recents enable row level security;
create policy recents_all on public.recents
  for all to authenticated
  using (user_id = auth.uid() and public.is_workspace_member(workspace_id))
  with check (user_id = auth.uid() and public.is_workspace_member(workspace_id));

-- yjs_documents -------------------------------------------------------------
alter table public.yjs_documents enable row level security;
create policy yjs_select on public.yjs_documents
  for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy yjs_insert on public.yjs_documents
  for insert to authenticated
  with check (public.is_workspace_member(workspace_id));
create policy yjs_update on public.yjs_documents
  for update to authenticated
  using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

-- ----------------------------------------------------------------------------
-- Realtime channel authorization (private broadcast channels)
-- Channel topics:
--   doc:{workspace_id}:{doc_type}:{doc_id}   per-document collaboration
--   presence:{workspace_id}                  workspace-wide who's-online
-- The workspace id is segment 2 in both, so one helper call gates each.
-- Locks subscribe + broadcast + presence to workspace members, reusing the
-- same helper as table RLS. RLS is already enabled on realtime.messages by
-- Supabase; we only add policies. Requires "Realtime Authorization" enabled.
-- ----------------------------------------------------------------------------
create policy "kore_realtime_read_channels"
  on realtime.messages
  for select to authenticated
  using (
    (realtime.topic() like 'doc:%' or realtime.topic() like 'presence:%')
    and public.is_workspace_member((split_part(realtime.topic(), ':', 2))::uuid)
  );

create policy "kore_realtime_write_channels"
  on realtime.messages
  for insert to authenticated
  with check (
    (realtime.topic() like 'doc:%' or realtime.topic() like 'presence:%')
    and public.is_workspace_member((split_part(realtime.topic(), ':', 2))::uuid)
  );
