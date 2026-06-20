-- ============================================================================
-- Kore — Phase 2 (Notes) — Google Keep-style notes
-- ----------------------------------------------------------------------------
-- One workspace-wide board. Notes are plain rows (NOT Yjs); they sync live via
-- Supabase Postgres Changes. Labels are workspace-wide shared. Attachments are
-- generic (ADR 0001) and used by notes now (target_type = 'note').
--
-- Security model mirrors Phase 1: RLS on EVERY table, membership checks through
-- the existing SECURITY DEFINER helpers (is_workspace_member / is_workspace_owner).
-- workspace_id is denormalized on every table for single-hop RLS AND so the
-- Postgres Changes feed can filter on it (a realtime filter needs the column
-- physically on the changed row).
--
-- DELETE scoping: top-level / shared destructive deletes (a note's hard delete,
-- a shared label's delete) are owner-only — mirrors projects_delete. Child-row
-- edits (checklist items, note_labels, attachments) are member-allowed, since
-- they are part of editing an already-editable note.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

-- notes: the cards. Status is two nullable timestamps, not booleans —
--   active   = archived_at is null and trashed_at is null
--   archived = archived_at is not null and trashed_at is null
--   trashed  = trashed_at is not null   (trashed wins)
-- Restore = set the relevant column back to null. The timestamps also give us a
-- free "trashed N days ago" UI and a future auto-purge with no schema change.
create table public.notes (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id   uuid references public.projects (id) on delete set null,  -- nullable: optional "file under a project"
  title        text not null default '',
  content      text not null default '',
  color        text not null default 'default',   -- palette key, validated app-side (lib/notes/colors.ts)
  pinned       boolean not null default false,
  sort         int,                                -- reserved for future manual ordering (unused in Phase 2)
  archived_at  timestamptz,
  trashed_at   timestamptz,
  created_by   uuid references auth.users (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index notes_workspace_idx on public.notes (workspace_id);
create index notes_project_idx   on public.notes (project_id) where project_id is not null;
-- active board (the hot query: pinned first, most-recent first), archived, trashed
create index notes_active_idx on public.notes (workspace_id, pinned desc, updated_at desc)
  where archived_at is null and trashed_at is null;
create index notes_archived_idx on public.notes (workspace_id, updated_at desc)
  where archived_at is not null and trashed_at is null;
create index notes_trashed_idx on public.notes (workspace_id, trashed_at desc)
  where trashed_at is not null;

create trigger notes_set_updated_at
  before update on public.notes
  for each row execute function public.set_updated_at();

-- note_checklist_items: to-do lines within a note
create table public.note_checklist_items (
  id           uuid primary key default gen_random_uuid(),
  note_id      uuid not null references public.notes (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,  -- denormalized for RLS + realtime filter
  text         text not null default '',
  checked      boolean not null default false,
  position     int  not null default 0,
  created_at   timestamptz not null default now()
);
create index note_checklist_note_idx      on public.note_checklist_items (note_id, position);
create index note_checklist_workspace_idx on public.note_checklist_items (workspace_id);

-- labels: workspace-wide shared tags
create table public.labels (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name         text not null,
  color        text not null default 'default',
  created_by   uuid references auth.users (id),
  created_at   timestamptz not null default now()
);
create unique index labels_ws_name_key  on public.labels (workspace_id, lower(name));
create index        labels_workspace_idx on public.labels (workspace_id);

-- note_labels: join (insert/delete only — a relabel is delete + insert)
create table public.note_labels (
  note_id      uuid not null references public.notes (id)  on delete cascade,
  label_id     uuid not null references public.labels (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,  -- denormalized
  created_at   timestamptz not null default now(),
  primary key (note_id, label_id)
);
create index note_labels_label_idx     on public.note_labels (label_id);
create index note_labels_workspace_idx on public.note_labels (workspace_id);

-- attachments: generic per ADR 0001. `url` holds the STORAGE OBJECT PATH
-- (not a signed URL — those expire). Signed URLs are minted on read via
-- lib/storage.ts so the Supabase→GCS swap stays a one-file change.
create table public.attachments (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  url          text not null,
  target_type  text not null,            -- 'note'
  target_id    uuid not null,
  mime_type    text,
  created_by   uuid references auth.users (id),
  created_at   timestamptz not null default now()
);
create index attachments_target_idx    on public.attachments (target_type, target_id);
create index attachments_workspace_idx on public.attachments (workspace_id);

-- ----------------------------------------------------------------------------
-- Table privileges (RLS remains the security boundary).
-- The init migration's blanket grant was a one-time snapshot — it does NOT
-- cover tables created later, so re-grant explicitly here.
-- ----------------------------------------------------------------------------
grant select, insert, update, delete on public.notes                to authenticated;
grant select, insert, update, delete on public.note_checklist_items to authenticated;
grant select, insert, update, delete on public.labels               to authenticated;
grant select, insert, update, delete on public.note_labels          to authenticated;
grant select, insert, update, delete on public.attachments          to authenticated;

-- ============================================================================
-- RLS — every table (member reads/edits; owner-only for destructive top-level)
-- ============================================================================

-- notes ---------------------------------------------------------------------
alter table public.notes enable row level security;
create policy notes_select on public.notes
  for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy notes_insert on public.notes
  for insert to authenticated
  with check (public.is_workspace_member(workspace_id));
create policy notes_update on public.notes
  for update to authenticated
  using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy notes_delete on public.notes
  for delete to authenticated
  using (public.is_workspace_owner(workspace_id));   -- permanent delete is owner-only

-- note_checklist_items ------------------------------------------------------
alter table public.note_checklist_items enable row level security;
create policy note_checklist_select on public.note_checklist_items
  for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy note_checklist_insert on public.note_checklist_items
  for insert to authenticated
  with check (public.is_workspace_member(workspace_id));
create policy note_checklist_update on public.note_checklist_items
  for update to authenticated
  using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy note_checklist_delete on public.note_checklist_items
  for delete to authenticated
  using (public.is_workspace_member(workspace_id));  -- a checklist edit, member-allowed

-- labels --------------------------------------------------------------------
alter table public.labels enable row level security;
create policy labels_select on public.labels
  for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy labels_insert on public.labels
  for insert to authenticated
  with check (public.is_workspace_member(workspace_id));
create policy labels_update on public.labels
  for update to authenticated
  using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy labels_delete on public.labels
  for delete to authenticated
  using (public.is_workspace_owner(workspace_id));   -- shared state; cascade strips chips off everyone's notes

-- note_labels ---------------------------------------------------------------
alter table public.note_labels enable row level security;
create policy note_labels_select on public.note_labels
  for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy note_labels_insert on public.note_labels
  for insert to authenticated
  with check (public.is_workspace_member(workspace_id));
create policy note_labels_delete on public.note_labels
  for delete to authenticated
  using (public.is_workspace_member(workspace_id));

-- attachments ---------------------------------------------------------------
alter table public.attachments enable row level security;
create policy attachments_select on public.attachments
  for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy attachments_insert on public.attachments
  for insert to authenticated
  with check (public.is_workspace_member(workspace_id));
create policy attachments_update on public.attachments
  for update to authenticated
  using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy attachments_delete on public.attachments
  for delete to authenticated
  using (public.is_workspace_member(workspace_id));

-- ----------------------------------------------------------------------------
-- Realtime: light collaboration via Postgres Changes (NOT broadcast/Yjs).
-- RLS on each table filters the change feed per subscriber; the client filters
-- on workspace_id=eq.{ws}. attachments are intentionally NOT published — a new
-- image rides the parent note's updated_at bump (see lib/actions/notes.ts).
--
-- The supabase_realtime publication exists by default on Supabase projects, but
-- guard its creation so the migration is reproducible on a bare database.
-- REPLICA IDENTITY FULL gives robust UPDATE/DELETE payloads + per-row RLS on the
-- realtime path (cheap for an under-10 team).
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

alter publication supabase_realtime add table public.notes;
alter publication supabase_realtime add table public.note_checklist_items;
alter publication supabase_realtime add table public.note_labels;
alter publication supabase_realtime add table public.labels;

alter table public.notes                replica identity full;
alter table public.note_checklist_items replica identity full;
alter table public.note_labels          replica identity full;
alter table public.labels               replica identity full;

-- ----------------------------------------------------------------------------
-- RPC: empty_trash() — owner-only bulk hard delete of trashed notes.
-- security invoker → notes_delete (owner-only) authorizes; a non-owner deletes
-- zero rows, which is the correct safe failure.
-- ----------------------------------------------------------------------------
create or replace function public.empty_trash()
returns void
language sql
security invoker
set search_path = ''
as $$
  delete from public.notes where trashed_at is not null;
$$;
grant execute on function public.empty_trash() to authenticated;

-- ----------------------------------------------------------------------------
-- Storage object RLS for the private `note-attachments` bucket.
-- The BUCKET itself is created manually in the Supabase dashboard (private,
-- 5 MB, image MIME allowlist). Object path convention:
--   {workspace_id}/{note_id}/{uuid}.{ext}
-- so (storage.foldername(name))[1] = workspace_id. RLS on storage.objects is
-- already enabled by Supabase; we only add policies.
-- ----------------------------------------------------------------------------
create policy "note_attachments_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'note-attachments'
    and public.is_workspace_member(((storage.foldername(name))[1])::uuid)
  );
create policy "note_attachments_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'note-attachments'
    and public.is_workspace_member(((storage.foldername(name))[1])::uuid)
  );
create policy "note_attachments_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'note-attachments'
    and public.is_workspace_member(((storage.foldername(name))[1])::uuid)
  );
