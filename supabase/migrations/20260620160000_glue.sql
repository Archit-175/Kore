-- ============================================================================
-- Kore — Phase 6 (Glue & polish) — Team chat, comments, activity feed, search
-- ----------------------------------------------------------------------------
-- All of Phase 6's collaborative surfaces are PLAIN STRUCTURED ROWS on Supabase
-- Postgres Changes (the Phase 2 notes / Phase 4 databases pattern) — NOT Yjs.
-- Five new tables, all carrying a denormalized workspace_id for single-hop RLS
-- AND so the shared realtime channel (lib/realtime/workspace-tables.ts) can
-- filter the change feed on workspace_id=eq.{ws}.
--
--   messages          one workspace-wide chat channel; WhatsApp-style quote-reply
--                     via parent_message_id; reactions/reads in sibling tables.
--   message_reactions emoji reactions (one row per user+emoji+message).
--   message_reads     per-user read cursor (last_read_message_id) → unread badge.
--   comments          flat comment threads on a page or a note (polymorphic
--                     target_type/target_id, no FK — like attachments).
--   activity_log      append-only per-project change history (coarse events).
--
-- AUTHORSHIP / MODERATION (the Phase 6 authz decision):
--   messages & comments are AUTHOR-SCOPED — the author may edit AND delete their
--   own; the workspace OWNER may additionally DELETE (but NOT edit) anyone's
--   (moderation). This is two permissive DELETE policies (own + owner) that OR,
--   plus an author-only UPDATE policy (deliberately no owner-update). Everything
--   else (reads, reactions, reads-cursor, activity) is plain member access.
--
-- Plus pages.search_text (a plain-text mirror of each doc body, synced from the
-- editor) and global_search() — the $0 cross-module search (ILIKE, no extension).
--
-- New tables created after init need an EXPLICIT `grant ... to authenticated`
-- (init's blanket grant was a one-time snapshot).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

-- messages: one global channel per workspace (workspace_id IS the channel — no
-- channel_id). `parent_message_id` is the quoted message for a WhatsApp-style
-- inline reply; ON DELETE SET NULL so moderating away a quoted message keeps its
-- replies (their quote just reads "message deleted"). `mentions` is the parsed
-- set of @-mentioned member ids (the body keeps the @Name text for rendering).
-- `attachments` holds [{path,mime,name,size}] INLINE (not the attachments table,
-- which is deliberately unpublished) so a new file rides the message INSERT over
-- realtime. `edited_at` is null until the first edit.
create table public.messages (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces (id) on delete cascade,
  author_id         uuid not null references auth.users (id) on delete cascade,
  body              text not null default '',
  parent_message_id uuid references public.messages (id) on delete set null,
  mentions          uuid[] not null default '{}',
  attachments       jsonb  not null default '[]'::jsonb,
  edited_at         timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
-- keyset pagination hot-path: newest-first within a workspace
create index messages_workspace_created_idx on public.messages (workspace_id, created_at desc, id desc);
create index messages_parent_idx on public.messages (parent_message_id) where parent_message_id is not null;

create trigger messages_set_updated_at
  before update on public.messages
  for each row execute function public.set_updated_at();

-- message_reactions: one row per (message, user, emoji). The unique index makes a
-- toggle idempotent (insert; on 23505 the user already reacted → delete instead).
create table public.message_reactions (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  message_id   uuid not null references public.messages (id)   on delete cascade,
  user_id      uuid not null references auth.users (id)        on delete cascade,
  emoji        text not null,
  created_at   timestamptz not null default now()
);
create unique index message_reactions_unique on public.message_reactions (message_id, user_id, emoji);
create index message_reactions_message_idx   on public.message_reactions (message_id);
create index message_reactions_workspace_idx on public.message_reactions (workspace_id);

-- message_reads: per-user read cursor for the channel (one row per user). The
-- unread badge = count of messages newer than last_read_message_id. SET NULL so
-- purging the cursor message doesn't break the row.
create table public.message_reads (
  user_id              uuid not null references auth.users (id) on delete cascade,
  workspace_id         uuid not null references public.workspaces (id) on delete cascade,
  last_read_message_id uuid references public.messages (id) on delete set null,
  updated_at           timestamptz not null default now(),
  primary key (user_id, workspace_id)
);
create index message_reads_workspace_idx on public.message_reads (workspace_id);

create trigger message_reads_set_updated_at
  before update on public.message_reads
  for each row execute function public.set_updated_at();

-- comments: flat threads on a page or note. Polymorphic target_type/target_id
-- with NO FK (mirrors the attachments table) so one table serves both kinds.
-- `parent_id` is reserved for future nested replies (always null in v1). Deleting
-- the target leaves orphan comments (invisible — no surface to open them from),
-- same v1 tradeoff as orphaned page/whiteboard image objects.
create table public.comments (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  target_type  text not null check (target_type in ('page', 'note')),
  target_id    uuid not null,
  author_id    uuid not null references auth.users (id) on delete cascade,
  parent_id    uuid references public.comments (id) on delete cascade,
  body         text not null default '',
  mentions     uuid[] not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index comments_target_idx    on public.comments (workspace_id, target_type, target_id, created_at);
create index comments_workspace_idx on public.comments (workspace_id);

create trigger comments_set_updated_at
  before update on public.comments
  for each row execute function public.set_updated_at();

-- activity_log: append-only per-project change history. `target_title` is a
-- SNAPSHOT of the title at the time of the event so a later rename/delete still
-- reads sensibly. actor_id SET NULL so a removed user's history survives. Written
-- best-effort by logActivity() inside the existing DAL-gated server actions.
create table public.activity_log (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id   uuid not null references public.projects (id)   on delete cascade,
  actor_id     uuid references auth.users (id) on delete set null,
  action       text not null,   -- 'created' | 'renamed' | 'trashed' | 'restored' | 'deleted'
  target_type  text not null,   -- 'page' | 'database' | 'whiteboard' | 'note'
  target_id    uuid not null,
  target_title text,
  created_at   timestamptz not null default now()
);
create index activity_log_project_idx   on public.activity_log (project_id, created_at desc);
create index activity_log_workspace_idx on public.activity_log (workspace_id);

-- pages.search_text: a plain-text mirror of the BlockNote doc body (the body
-- itself is opaque Yjs bytea). Synced debounced from the editor (alongside the
-- existing syncPageLinks). Default '' so existing rows are valid immediately;
-- old pages are body-unsearchable until first edited (title still matches).
alter table public.pages add column if not exists search_text text not null default '';

-- ----------------------------------------------------------------------------
-- Table privileges (RLS remains the security boundary). Explicit — init's
-- blanket grant does not cover tables created later.
-- ----------------------------------------------------------------------------
grant select, insert, update, delete on public.messages          to authenticated;
grant select, insert, update, delete on public.message_reactions to authenticated;
grant select, insert, update, delete on public.message_reads     to authenticated;
grant select, insert, update, delete on public.comments          to authenticated;
grant select, insert, update, delete on public.activity_log      to authenticated;

-- ============================================================================
-- RLS — every policy keys off the row's own denormalized workspace_id (single-
-- hop, realtime-safe — never a join). messages/comments are author-scoped for
-- write; the owner may delete (moderation) but not edit others'.
-- ============================================================================

-- messages -------------------------------------------------------------------
alter table public.messages enable row level security;
create policy messages_select on public.messages
  for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy messages_insert on public.messages
  for insert to authenticated
  with check (public.is_workspace_member(workspace_id) and author_id = auth.uid());
-- author-only edit (NO owner-update policy: the owner may delete but not edit)
create policy messages_update on public.messages
  for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
-- two permissive DELETE policies OR together: author deletes own, owner any
create policy messages_delete_own on public.messages
  for delete to authenticated
  using (author_id = auth.uid());
create policy messages_delete_owner on public.messages
  for delete to authenticated
  using (public.is_workspace_owner(workspace_id));

-- message_reactions ----------------------------------------------------------
-- A reaction is "yours": insert/delete are self-scoped; no update.
alter table public.message_reactions enable row level security;
create policy message_reactions_select on public.message_reactions
  for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy message_reactions_insert on public.message_reactions
  for insert to authenticated
  with check (public.is_workspace_member(workspace_id) and user_id = auth.uid());
create policy message_reactions_delete on public.message_reactions
  for delete to authenticated
  using (user_id = auth.uid());

-- message_reads --------------------------------------------------------------
-- Entirely self-scoped (mirrors favorites): a user only ever touches their own
-- read cursor.
alter table public.message_reads enable row level security;
create policy message_reads_all on public.message_reads
  for all to authenticated
  using (user_id = auth.uid() and public.is_workspace_member(workspace_id))
  with check (user_id = auth.uid() and public.is_workspace_member(workspace_id));

-- comments -------------------------------------------------------------------
alter table public.comments enable row level security;
create policy comments_select on public.comments
  for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy comments_insert on public.comments
  for insert to authenticated
  with check (public.is_workspace_member(workspace_id) and author_id = auth.uid());
create policy comments_update on public.comments
  for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy comments_delete_own on public.comments
  for delete to authenticated
  using (author_id = auth.uid());
create policy comments_delete_owner on public.comments
  for delete to authenticated
  using (public.is_workspace_owner(workspace_id));

-- activity_log ---------------------------------------------------------------
-- Members read EVERY project's feed (no visibility walls — matches projects).
-- Inserts happen under the actor's session; never updated/deleted by users
-- (append-only; cascade-only cleanup when a project/workspace is deleted).
alter table public.activity_log enable row level security;
create policy activity_log_select on public.activity_log
  for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy activity_log_insert on public.activity_log
  for insert to authenticated
  with check (public.is_workspace_member(workspace_id) and actor_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Realtime: chat/comments/activity all sync via Postgres Changes. RLS filters
-- the feed per subscriber; the shared workspace channel filters on
-- workspace_id=eq.{ws}, the dedicated chat channel likewise. REPLICA IDENTITY
-- FULL gives robust UPDATE/DELETE payloads. (Guard publication creation so the
-- migration is reproducible on a bare database.)
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.message_reactions;
alter publication supabase_realtime add table public.message_reads;
alter publication supabase_realtime add table public.comments;
alter publication supabase_realtime add table public.activity_log;

alter table public.messages          replica identity full;
alter table public.message_reactions replica identity full;
alter table public.message_reads     replica identity full;
alter table public.comments          replica identity full;
alter table public.activity_log      replica identity full;

-- ----------------------------------------------------------------------------
-- global_search(workspace, query): the $0 cross-module search behind ⌘K. Plain
-- ILIKE across the six sources (under-10 team, a few thousand rows → instant; no
-- extension / index maintenance; trigram explicitly deferred). SECURITY DEFINER
-- so it can read across tables uniformly — therefore it MUST gate on membership
-- itself (an early return for non-members), or it would leak cross-workspace.
-- Returns a unified result set ordered by source rank then title.
-- ----------------------------------------------------------------------------
create or replace function public.global_search(p_workspace uuid, p_query text)
returns table (
  kind       text,
  id         uuid,
  project_id uuid,
  title      text,
  snippet    text,
  rank       int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text;
begin
  -- Mandatory authz gate: a non-member (or unauthenticated) gets zero rows.
  if not public.is_workspace_member(p_workspace) then
    return;
  end if;
  -- Empty query → nothing (never dump the whole workspace).
  if coalesce(btrim(p_query), '') = '' then
    return;
  end if;
  -- Escape ILIKE metacharacters in user input, then wrap with wildcards.
  v_q := '%' || replace(replace(replace(p_query, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
    select 'note'::text, n.id, n.project_id, n.title, left(n.content, 140), 1
      from public.notes n
      where n.workspace_id = p_workspace and n.trashed_at is null
        and (n.title ilike v_q escape '\' or n.content ilike v_q escape '\')
    union all
    select 'page', p.id, p.project_id, p.title, left(p.search_text, 140), 2
      from public.pages p
      where p.workspace_id = p_workspace and p.trashed_at is null
        and (p.title ilike v_q escape '\' or p.search_text ilike v_q escape '\')
    union all
    select 'database', d.id, d.project_id, d.name, null::text, 3
      from public.databases d
      where d.workspace_id = p_workspace and d.trashed_at is null
        and d.name ilike v_q escape '\'
    union all
    -- row text → navigate to the owning database (deduped client-side)
    select 'database', db.id, db.project_id, db.name, left(dr.data::text, 140), 4
      from public.database_rows dr
      join public.databases db on db.id = dr.database_id
      where dr.workspace_id = p_workspace and db.trashed_at is null
        and dr.data::text ilike v_q escape '\'
    union all
    select 'whiteboard', w.id, w.project_id, w.title, null::text, 5
      from public.whiteboards w
      where w.workspace_id = p_workspace and w.trashed_at is null
        and w.title ilike v_q escape '\'
    union all
    select 'message', m.id, null::uuid, left(m.body, 60), left(m.body, 140), 6
      from public.messages m
      where m.workspace_id = p_workspace
        and m.body ilike v_q escape '\'
    order by 6, 4
    limit 50;
end;
$$;
grant execute on function public.global_search(uuid, text) to authenticated;
