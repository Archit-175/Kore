-- Phase 8 — Team membership & team-scoped powers.
--
-- Teams stop being grouping-only: a team gets a roster (`team_members`). Being on
-- a team's roster grants OWNER-LIKE control over that team's PROJECTS — permanent
-- delete, empty-trash, delete-project — without any visibility wall (every active
-- workspace member still reads + edits all content, exactly as before). The
-- workspace owner manages each roster (insert/delete) and the team icon.
--
-- Mechanism: a new `can_admin_project(project)` SECURITY DEFINER helper (workspace
-- owner OR a team member of the project's team) replaces `is_workspace_owner` in
-- the four permanent-delete policies. The `empty_*_trash` RPCs are all
-- SECURITY INVOKER, so they ride these policies automatically — no RPC changes.

-- ----------------------------------------------------------------------------
-- team_members roster
-- ----------------------------------------------------------------------------
create table public.team_members (
  team_id      uuid not null references public.teams (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  added_by     uuid references auth.users (id),
  created_at   timestamptz not null default now(),
  primary key (team_id, user_id)
);

alter table public.team_members enable row level security;

-- Rosters are visible to every active workspace member (no walls).
create policy team_members_select on public.team_members
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

-- Only the workspace owner manages who is on a team.
create policy team_members_insert on public.team_members
  for insert to authenticated
  with check (public.is_workspace_owner(workspace_id));

create policy team_members_delete on public.team_members
  for delete to authenticated
  using (public.is_workspace_owner(workspace_id));

-- New tables need an explicit grant (init's blanket grant was a one-time snapshot).
grant select, insert, delete on public.team_members to authenticated;

-- Realtime (parity with the other content tables, though the UI mainly uses
-- router.refresh() for roster changes).
alter table public.team_members replica identity full;
alter publication supabase_realtime add table public.team_members;

-- ----------------------------------------------------------------------------
-- Authorization helpers (SECURITY DEFINER, recursion-safe — same style as
-- is_workspace_member / is_workspace_owner in the init migration).
-- ----------------------------------------------------------------------------
create or replace function public.is_team_member(p_team uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.team_members tm
    where tm.team_id = p_team
      and tm.user_id = auth.uid()
  );
$$;

-- Can the caller perform owner-like admin on a project? True if they are the
-- workspace owner OR a member of the project's team.
create or replace function public.can_admin_project(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = p_project
      and (
        public.is_workspace_owner(p.workspace_id)
        or exists (
          select 1 from public.team_members tm
          where tm.team_id = p.team_id
            and tm.user_id = auth.uid()
        )
      )
  );
$$;

-- ----------------------------------------------------------------------------
-- Relax the four permanent-delete policies: owner-only → can_admin_project /
-- team member. Trash/restore stay member-level UPDATEs (unchanged). The
-- workspace-wide /notes board stays owner-only (notes_delete unchanged).
-- ----------------------------------------------------------------------------
drop policy pages_delete on public.pages;
create policy pages_delete on public.pages
  for delete to authenticated
  using (public.can_admin_project(project_id));

drop policy databases_delete on public.databases;
create policy databases_delete on public.databases
  for delete to authenticated
  using (public.can_admin_project(project_id));

drop policy whiteboards_delete on public.whiteboards;
create policy whiteboards_delete on public.whiteboards
  for delete to authenticated
  using (public.can_admin_project(project_id));

drop policy projects_delete on public.projects;
create policy projects_delete on public.projects
  for delete to authenticated
  using (
    public.is_workspace_owner(workspace_id)
    or public.is_team_member(team_id)
  );
