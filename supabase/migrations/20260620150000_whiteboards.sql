-- ============================================================================
-- Kore — Phase 5 (Whiteboard) — Excalidraw infinite canvas
-- ----------------------------------------------------------------------------
-- A whiteboard's RELATIONAL ENVELOPE (this table) mirrors pages/databases: one
-- row per (project, title) carrying title/icon/sort/trash. It syncs via Supabase
-- Postgres Changes for the sidebar tree + project-home list (the notes/pages
-- pattern). The CANVAS BODY (Excalidraw elements) is NOT here — it lives in the
-- existing unified `yjs_documents` table under doc_type='whiteboard' (the same
-- LWW-snapshot + Realtime-broadcast layer Phase 1 proved and Phase 3 Docs reuse;
-- save_yjs_snapshot / load_yjs_snapshot RPCs already exist). Image bytes live in
-- the `note-attachments` Storage bucket; the CRDT carries only file metadata.
--
-- A whiteboard lives in a PROJECT (whiteboards.project_id NOT NULL, like pages).
-- `sort` is a fractional rank (double) so reordering the list is a single
-- midpoint UPDATE.
--
-- Security mirrors Phase 1–4: RLS on the table via the SECURITY DEFINER helpers
-- (is_workspace_member / is_workspace_owner). workspace_id is denormalized for
-- single-hop RLS AND so the Postgres Changes feed can filter on it. A member
-- freely creates/edits/trashes a whiteboard; only the whole object's PERMANENT
-- delete + empty-trash are owner-only (whiteboards_delete) — trashing is a
-- member-allowed UPDATE of trashed_at.
--
-- New tables created after init need an EXPLICIT `grant ... to authenticated`
-- (init's blanket grant was a one-time snapshot).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Table
-- ----------------------------------------------------------------------------
create table public.whiteboards (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id   uuid not null references public.projects (id)   on delete cascade,
  title        text not null default '',
  icon         text,
  sort         double precision not null default 0,
  trashed_at   timestamptz,                          -- soft delete: member-reversible, owner purges
  created_by   uuid references auth.users (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index whiteboards_workspace_idx on public.whiteboards (workspace_id);
-- live list hot-path: a project's NON-trashed whiteboards in display order
create index whiteboards_project_sort_idx on public.whiteboards (project_id, sort)
  where trashed_at is null;
-- trash view: a project's trashed whiteboards, most-recently trashed first
create index whiteboards_trashed_idx on public.whiteboards (project_id, trashed_at)
  where trashed_at is not null;

create trigger whiteboards_set_updated_at
  before update on public.whiteboards
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Table privileges (RLS remains the security boundary). Explicit — init's
-- blanket grant does not cover tables created later.
-- ----------------------------------------------------------------------------
grant select, insert, update, delete on public.whiteboards to authenticated;

-- ============================================================================
-- RLS — members read/edit everything; only the whole whiteboard's PERMANENT
-- delete is owner-only (trashing is a member UPDATE of trashed_at). Every policy
-- keys off the row's own denormalized workspace_id (single-hop, realtime-safe).
-- ============================================================================
alter table public.whiteboards enable row level security;
create policy whiteboards_select on public.whiteboards
  for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy whiteboards_insert on public.whiteboards
  for insert to authenticated
  with check (public.is_workspace_member(workspace_id));
create policy whiteboards_update on public.whiteboards
  for update to authenticated
  using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy whiteboards_delete on public.whiteboards
  for delete to authenticated
  using (public.is_workspace_owner(workspace_id));   -- PERMANENT delete owner-only (trashing is a member UPDATE)

-- ----------------------------------------------------------------------------
-- Realtime: the whiteboard envelope syncs via Postgres Changes. RLS filters the
-- feed per subscriber; the single-whiteboard view filters on id=eq.{wb}, the
-- sidebar/project-home list on project_id. REPLICA IDENTITY FULL gives robust
-- UPDATE/DELETE payloads. (Guard publication creation so the migration is
-- reproducible on a bare database.)
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

alter publication supabase_realtime add table public.whiteboards;
alter table public.whiteboards replica identity full;

-- ----------------------------------------------------------------------------
-- Snapshot cleanup: yjs_documents has no FK to whiteboards (it is keyed by
-- (doc_type, doc_id) across every doc kind), so a whiteboard delete would orphan
-- its Yjs snapshot. This AFTER DELETE trigger purges the matching snapshot.
-- SECURITY DEFINER so it can delete the snapshot row regardless of the
-- yjs_documents RLS (the whiteboard delete itself was already owner-authorized).
-- (Image objects in the note-attachments bucket are left orphaned in v1 — same
-- as Docs page attachments; future cleanup.)
-- ----------------------------------------------------------------------------
create or replace function public.purge_whiteboard_yjs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.yjs_documents where doc_type = 'whiteboard' and doc_id = old.id;
  return old;
end;
$$;
create trigger whiteboards_purge_yjs
  after delete on public.whiteboards
  for each row execute function public.purge_whiteboard_yjs();

-- ----------------------------------------------------------------------------
-- empty_whiteboard_trash(project): hard-delete every trashed whiteboard in a
-- project (the purge trigger above cleans each one's yjs snapshot). Owner-only is
-- enforced by the calling Server Action (requireOwner) + the whiteboards_delete
-- RLS policy; this helper just scopes the bulk delete. SECURITY INVOKER so it
-- runs under the caller's RLS (the owner check still applies per row).
-- ----------------------------------------------------------------------------
create or replace function public.empty_whiteboard_trash(p_project_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  delete from public.whiteboards
  where project_id = p_project_id and trashed_at is not null;
$$;
grant execute on function public.empty_whiteboard_trash(uuid) to authenticated;
