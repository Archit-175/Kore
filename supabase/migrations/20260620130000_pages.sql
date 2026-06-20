-- ============================================================================
-- Kore — Phase 3 (Docs) — Notion-style nested pages
-- ----------------------------------------------------------------------------
-- Pages are Yjs-COLLABORATIVE (unlike Phase 2 notes, which are plain rows). The
-- block CONTENT lives in the existing unified `yjs_documents` table under
-- doc_type='page' (already anticipated by the Phase 1 schema + the
-- save_yjs_snapshot / load_yjs_snapshot RPCs) and syncs over Supabase Realtime
-- broadcast via lib/yjs/provider.ts. THIS migration only adds the relational
-- envelope: the page tree (title/icon/parent/sort) + the derived backlink graph.
--
-- Why a relational envelope at all (vs. everything in Yjs)? The sidebar tree,
-- the @-mention picker, and backlinks all need to QUERY pages by title/parent —
-- and Yjs state is opaque `bytea`, unscannable by SQL. So title/icon/parent/sort
-- are real columns synced via Postgres Changes (like notes), and page_links is a
-- derived table the editor rewrites on edit.
--
-- Security mirrors Phase 1/2: RLS on every table via the SECURITY DEFINER helpers
-- (is_workspace_member / is_workspace_owner). workspace_id is denormalized on
-- every table for single-hop RLS AND so the Postgres Changes feed can filter on
-- it. DELETE scoping (mirrors notes): any member moves a page + its subtree to
-- TRASH via trashed_at (a member-allowed UPDATE, fully reversible); PERMANENT
-- delete + empty-trash are owner-only (the pages_delete policy). Members
-- create/rename/nest/reorder/edit/trash/restore freely.
--
-- New tables created after init need an EXPLICIT `grant ... to authenticated`
-- (init's blanket grant was a one-time snapshot).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

-- pages: the tree. One row per page; the block body lives in yjs_documents
-- (doc_type='page', doc_id=pages.id). `sort` is a fractional rank (double) so a
-- drag-reorder is a single UPDATE to the midpoint between neighbours — no bulk
-- renumber. parent_page_id is a nullable self-reference (null = top-level);
-- ON DELETE CASCADE so deleting a page removes its whole subtree.
create table public.pages (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  project_id     uuid not null references public.projects (id)   on delete cascade,
  parent_page_id uuid references public.pages (id) on delete cascade,
  title          text not null default '',
  icon           text,
  sort           double precision not null default 0,
  trashed_at     timestamptz,                          -- soft delete: member-reversible, owner purges
  created_by     uuid references auth.users (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index pages_workspace_idx on public.pages (workspace_id);
create index pages_project_idx   on public.pages (project_id);
create index pages_parent_idx    on public.pages (parent_page_id);
-- live tree hot-path: a project's NON-trashed pages ordered within each parent
create index pages_project_sort_idx on public.pages (project_id, parent_page_id, sort)
  where trashed_at is null;
-- trash view: a project's trashed pages, most-recently trashed first
create index pages_trashed_idx on public.pages (project_id, trashed_at)
  where trashed_at is not null;

create trigger pages_set_updated_at
  before update on public.pages
  for each row execute function public.set_updated_at();

-- page_links: the DERIVED backlink graph. The editor extracts every @-mention's
-- target pageId on (debounced) edit and rewrites this source's rows
-- (delete-all-then-insert, see lib/actions/pages.ts). Backlinks for page X =
-- select source where target = X. No UPDATE path — a relink is delete + insert.
create table public.page_links (
  source_page_id uuid not null references public.pages (id) on delete cascade,
  target_page_id uuid not null references public.pages (id) on delete cascade,
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,  -- denormalized for RLS + realtime filter
  created_at     timestamptz not null default now(),
  primary key (source_page_id, target_page_id)
);
create index page_links_target_idx    on public.page_links (target_page_id);
create index page_links_workspace_idx  on public.page_links (workspace_id);

-- ----------------------------------------------------------------------------
-- Table privileges (RLS remains the security boundary). Explicit — init's
-- blanket grant does not cover tables created later.
-- ----------------------------------------------------------------------------
grant select, insert, update, delete on public.pages      to authenticated;
grant select, insert, update, delete on public.page_links to authenticated;

-- ============================================================================
-- RLS — members read/edit; page delete is owner-only (mirrors projects_delete)
-- ============================================================================

-- pages ---------------------------------------------------------------------
alter table public.pages enable row level security;
create policy pages_select on public.pages
  for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy pages_insert on public.pages
  for insert to authenticated
  with check (public.is_workspace_member(workspace_id));
create policy pages_update on public.pages
  for update to authenticated
  using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy pages_delete on public.pages
  for delete to authenticated
  using (public.is_workspace_owner(workspace_id));   -- PERMANENT delete owner-only (trashing is a member UPDATE)

-- page_links ----------------------------------------------------------------
-- Member-writable: maintaining links is part of editing an (already-editable)
-- page. Rewritten as delete + insert, so no UPDATE policy is needed.
alter table public.page_links enable row level security;
create policy page_links_select on public.page_links
  for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy page_links_insert on public.page_links
  for insert to authenticated
  with check (public.is_workspace_member(workspace_id));
create policy page_links_delete on public.page_links
  for delete to authenticated
  using (public.is_workspace_member(workspace_id));

-- ----------------------------------------------------------------------------
-- Realtime: the page TREE + backlinks sync via Postgres Changes (the block body
-- syncs separately via Yjs broadcast). RLS filters the feed per subscriber; the
-- client filters on workspace_id=eq.{ws}. REPLICA IDENTITY FULL gives robust
-- UPDATE/DELETE payloads. (The publication exists by default on Supabase; guard
-- creation so the migration is reproducible on a bare database.)
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

alter publication supabase_realtime add table public.pages;
alter publication supabase_realtime add table public.page_links;

alter table public.pages      replica identity full;
alter table public.page_links replica identity full;

-- ----------------------------------------------------------------------------
-- page_subtree_ids(root): all page ids in the subtree rooted at `root`
-- (inclusive). Used by movePage's cycle guard — reparenting page A under any
-- P in subtree(A) would create a cycle. SECURITY INVOKER so the recursion only
-- traverses pages the caller may read (all same-workspace anyway).
-- ----------------------------------------------------------------------------
create or replace function public.page_subtree_ids(p_root uuid)
returns table (id uuid)
language sql
stable
security invoker
set search_path = ''
as $$
  with recursive sub as (
    select pg.id from public.pages pg where pg.id = p_root
    union all
    select c.id from public.pages c join sub on c.parent_page_id = sub.id
  )
  select sub.id from sub;
$$;
grant execute on function public.page_subtree_ids(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Snapshot cleanup: yjs_documents has no FK to pages (it is keyed by
-- (doc_type, doc_id) across every doc kind), so a page delete would orphan its
-- Yjs snapshot. This AFTER DELETE trigger purges the matching snapshot; because
-- child pages cascade-delete, it fires per subtree row and cleans the whole
-- subtree automatically. SECURITY DEFINER so it can delete the snapshot row
-- regardless of the yjs_documents RLS (the page delete itself was already
-- owner-authorized).
-- ----------------------------------------------------------------------------
create or replace function public.purge_page_yjs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.yjs_documents where doc_type = 'page' and doc_id = old.id;
  return old;
end;
$$;
create trigger pages_purge_yjs
  after delete on public.pages
  for each row execute function public.purge_page_yjs();
