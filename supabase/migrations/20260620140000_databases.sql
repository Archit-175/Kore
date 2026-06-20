-- ============================================================================
-- Kore — Phase 4 (Databases) — Notion-style Table + Board views
-- ----------------------------------------------------------------------------
-- Databases are PLAIN STRUCTURED ROWS (like Phase 2 notes), NOT Yjs-collaborative
-- text. Realtime is Supabase Postgres Changes + a debounced full refetch of the
-- database aggregate (the notes/pages pattern) — there is no Yjs here.
--
-- A "database" lives in a PROJECT (databases.project_id NOT NULL, like pages).
-- Its schema is a set of `database_properties` (columns); its records are
-- `database_rows` whose cell values live in a single `data jsonb` keyed BY
-- property_id (flexible storage, no EAV). It can carry several saved
-- `database_views` (a Table or Board tab), each switchable, each with its own
-- per-view card order.
--
-- Per-view ordering: every row has a global `sort` (double, the default order)
-- plus a sparse `view_order jsonb` ({viewId: number}) that OVERRIDES the order in
-- a specific view. Effective order in view V = view_order[V] ?? sort (computed in
-- JS after refetch). A drag is one narrow UPDATE on the dragged row alone — LWW-
-- safe for distinct rows, no join table, no per-view rank fan-out.
--
-- Security mirrors Phase 1/2/3: RLS on every table via the SECURITY DEFINER
-- helpers (is_workspace_member / is_workspace_owner). workspace_id is denormalized
-- on every table for single-hop RLS AND so the Postgres Changes feed can filter on
-- it (or on database_id). DELETE scoping: a member freely creates/edits/deletes
-- ROWS, PROPERTIES (columns) and VIEWS; only the whole `databases` object's
-- PERMANENT delete + empty-trash are owner-only (databases_delete) — trashing a
-- database is a member-allowed UPDATE of trashed_at. (Database rows are lightweight
-- records, deleted by members like note_checklist_items — there is no row-level
-- trash.)
--
-- New tables created after init need an EXPLICIT `grant ... to authenticated`
-- (init's blanket grant was a one-time snapshot).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

-- databases: one per (project, name). `sort` is a fractional rank (double) so
-- reordering the project's database list is a single midpoint UPDATE. The block
-- body of a database is its rows/properties/views below (no Yjs doc).
create table public.databases (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id   uuid not null references public.projects (id)   on delete cascade,
  name         text not null default '',
  icon         text,
  sort         double precision not null default 0,
  trashed_at   timestamptz,                          -- soft delete: member-reversible, owner purges
  created_by   uuid references auth.users (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index databases_workspace_idx on public.databases (workspace_id);
-- live list hot-path: a project's NON-trashed databases in display order
create index databases_project_sort_idx on public.databases (project_id, sort)
  where trashed_at is null;
-- trash view: a project's trashed databases, most-recently trashed first
create index databases_trashed_idx on public.databases (project_id, trashed_at)
  where trashed_at is not null;

create trigger databases_set_updated_at
  before update on public.databases
  for each row execute function public.set_updated_at();

-- database_properties: the COLUMNS (schema). `type` is one of 7 (CHECK). For
-- select/multi_select/status, `options` holds the option set as a jsonb array of
-- {id, name, color}. `sort` orders the columns. The "title" property is the
-- primary/name column (non-deletable in the UI only — no DB constraint).
create table public.database_properties (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  database_id  uuid not null references public.databases (id)  on delete cascade,
  name         text not null default '',
  type         text not null default 'text'
    check (type in ('title', 'text', 'select', 'multi_select', 'status', 'date', 'person')),
  options      jsonb not null default '[]'::jsonb,
  sort         double precision not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index database_properties_db_sort_idx on public.database_properties (database_id, sort);
create index database_properties_workspace_idx on public.database_properties (workspace_id);

create trigger database_properties_set_updated_at
  before update on public.database_properties
  for each row execute function public.set_updated_at();

-- database_views: the saved Table/Board tabs. `group_property_id` is the board's
-- grouping column (ON DELETE SET NULL so deleting the grouping property degrades
-- the board to ungrouped instead of cascading it away). `sort` orders the tabs.
-- `config` is reserved for future per-view settings (hidden columns, etc.).
create table public.database_views (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces (id) on delete cascade,
  database_id       uuid not null references public.databases (id)  on delete cascade,
  name              text not null default 'Table',
  type              text not null default 'table' check (type in ('table', 'board')),
  group_property_id uuid references public.database_properties (id) on delete set null,
  sort              double precision not null default 0,
  config            jsonb not null default '{}'::jsonb,
  created_by        uuid references auth.users (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index database_views_db_sort_idx on public.database_views (database_id, sort);
create index database_views_workspace_idx on public.database_views (workspace_id);

create trigger database_views_set_updated_at
  before update on public.database_views
  for each row execute function public.set_updated_at();

-- database_rows: the RECORDS. `data` holds cell values keyed by property_id
-- (string for title/text/date(ISO)/status/select(optionId)/person(userId); array
-- of optionIds for multi_select). `sort` is the global/default fractional rank;
-- `view_order` is a sparse {viewId: number} of per-view overrides. No GIN on
-- `data` (v1 has no server-side jsonb predicates — pure write amplification).
create table public.database_rows (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  database_id  uuid not null references public.databases (id)  on delete cascade,
  data         jsonb not null default '{}'::jsonb,
  sort         double precision not null default 0,
  view_order   jsonb not null default '{}'::jsonb,
  created_by   uuid references auth.users (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index database_rows_db_sort_idx on public.database_rows (database_id, sort);
create index database_rows_workspace_idx on public.database_rows (workspace_id);

create trigger database_rows_set_updated_at
  before update on public.database_rows
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Table privileges (RLS remains the security boundary). Explicit — init's
-- blanket grant does not cover tables created later.
-- ----------------------------------------------------------------------------
grant select, insert, update, delete on public.databases           to authenticated;
grant select, insert, update, delete on public.database_properties to authenticated;
grant select, insert, update, delete on public.database_views      to authenticated;
grant select, insert, update, delete on public.database_rows       to authenticated;

-- ============================================================================
-- RLS — members read/edit everything; only the whole database's PERMANENT delete
-- is owner-only (trashing a database is a member UPDATE of trashed_at). Every
-- policy keys off the row's own denormalized workspace_id (single-hop, realtime-
-- compatible — never a join through database_id).
-- ============================================================================

-- databases ------------------------------------------------------------------
alter table public.databases enable row level security;
create policy databases_select on public.databases
  for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy databases_insert on public.databases
  for insert to authenticated
  with check (public.is_workspace_member(workspace_id));
create policy databases_update on public.databases
  for update to authenticated
  using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy databases_delete on public.databases
  for delete to authenticated
  using (public.is_workspace_owner(workspace_id));   -- PERMANENT delete owner-only (trashing is a member UPDATE)

-- database_properties --------------------------------------------------------
-- Member-writable: editing the schema (add/rename/recolor/delete a column) is
-- part of editing an (already-editable) database.
alter table public.database_properties enable row level security;
create policy database_properties_select on public.database_properties
  for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy database_properties_insert on public.database_properties
  for insert to authenticated
  with check (public.is_workspace_member(workspace_id));
create policy database_properties_update on public.database_properties
  for update to authenticated
  using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy database_properties_delete on public.database_properties
  for delete to authenticated
  using (public.is_workspace_member(workspace_id));

-- database_views -------------------------------------------------------------
alter table public.database_views enable row level security;
create policy database_views_select on public.database_views
  for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy database_views_insert on public.database_views
  for insert to authenticated
  with check (public.is_workspace_member(workspace_id));
create policy database_views_update on public.database_views
  for update to authenticated
  using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy database_views_delete on public.database_views
  for delete to authenticated
  using (public.is_workspace_member(workspace_id));

-- database_rows --------------------------------------------------------------
-- Member-writable: records are freely created/edited/deleted by editors (a row
-- delete is a member hard DELETE, like note_checklist_items — no row-level trash).
alter table public.database_rows enable row level security;
create policy database_rows_select on public.database_rows
  for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy database_rows_insert on public.database_rows
  for insert to authenticated
  with check (public.is_workspace_member(workspace_id));
create policy database_rows_update on public.database_rows
  for update to authenticated
  using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy database_rows_delete on public.database_rows
  for delete to authenticated
  using (public.is_workspace_member(workspace_id));

-- ----------------------------------------------------------------------------
-- Realtime: the database, its columns, views and rows all sync via Postgres
-- Changes. RLS filters the feed per subscriber; the single-database view filters
-- on database_id=eq.{db}, the sidebar/project-home list on project_id/workspace_id.
-- REPLICA IDENTITY FULL gives robust UPDATE/DELETE payloads. (Guard publication
-- creation so the migration is reproducible on a bare database.)
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

alter publication supabase_realtime add table public.databases;
alter publication supabase_realtime add table public.database_properties;
alter publication supabase_realtime add table public.database_views;
alter publication supabase_realtime add table public.database_rows;

alter table public.databases           replica identity full;
alter table public.database_properties replica identity full;
alter table public.database_views      replica identity full;
alter table public.database_rows       replica identity full;

-- ----------------------------------------------------------------------------
-- JSONB partial-update helpers. A database_row's cells all share ONE `data`
-- jsonb, so a read-modify-write of the whole object would let two users editing
-- DIFFERENT cells of the SAME row clobber each other. These do TARGETED jsonb
-- writes server-side (jsonb_set / `- key`) so concurrent edits to distinct keys
-- merge at the DB. SECURITY INVOKER → the database_rows RLS still gates which row
-- the caller may touch (a foreign workspace's row id updates 0 rows).
-- ----------------------------------------------------------------------------

-- Set (or, when p_value is JSON null, CLEAR) a single cell key on one row.
create or replace function public.db_set_cell(p_row_id uuid, p_key text, p_value jsonb)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.database_rows
  set data = case
    when p_value is null or p_value = 'null'::jsonb then data - p_key
    else jsonb_set(data, array[p_key], p_value, true)
  end
  where id = p_row_id;
$$;
grant execute on function public.db_set_cell(uuid, text, jsonb) to authenticated;

-- Board cross-column drop: set the grouping cell AND this view's order in one
-- partial write (p_value JSON null clears the group = "no value" column).
create or replace function public.db_set_row_group(
  p_row_id uuid, p_group_key text, p_value jsonb, p_view_id text, p_sort double precision
)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.database_rows
  set data = case
        when p_value is null or p_value = 'null'::jsonb then data - p_group_key
        else jsonb_set(data, array[p_group_key], p_value, true)
      end,
      view_order = jsonb_set(view_order, array[p_view_id], to_jsonb(p_sort), true)
  where id = p_row_id;
$$;
grant execute on function public.db_set_row_group(uuid, text, jsonb, text, double precision) to authenticated;

-- Reorder a row within a view (drag inside one board column / table row reorder).
create or replace function public.db_set_view_order(p_row_id uuid, p_view_id text, p_sort double precision)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.database_rows
  set view_order = jsonb_set(view_order, array[p_view_id], to_jsonb(p_sort), true)
  where id = p_row_id;
$$;
grant execute on function public.db_set_view_order(uuid, text, double precision) to authenticated;

-- Cleanup on column delete: drop the orphaned data key from every row.
create or replace function public.db_strip_property(p_database_id uuid, p_property_id text)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.database_rows
  set data = data - p_property_id
  where database_id = p_database_id and data ? p_property_id;
$$;
grant execute on function public.db_strip_property(uuid, text) to authenticated;

-- Cleanup on view delete: drop the orphaned view_order key from every row.
create or replace function public.db_strip_view_order(p_database_id uuid, p_view_id text)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.database_rows
  set view_order = view_order - p_view_id
  where database_id = p_database_id and view_order ? p_view_id;
$$;
grant execute on function public.db_strip_view_order(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- empty_database_trash(project): hard-delete every trashed database in a project
-- (cascade removes its properties/views/rows). Owner-only is enforced by the
-- calling Server Action (requireOwner) + the databases_delete RLS policy; this
-- helper just scopes the bulk delete. SECURITY INVOKER so it runs under the
-- caller's RLS (the databases_delete owner check still applies per row).
-- ----------------------------------------------------------------------------
create or replace function public.empty_database_trash(p_project_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  delete from public.databases
  where project_id = p_project_id and trashed_at is not null;
$$;
grant execute on function public.empty_database_trash(uuid) to authenticated;
