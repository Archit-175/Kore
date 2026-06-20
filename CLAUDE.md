@AGENTS.md

# Kore — project guide (read every session)

Kore is a $0-budget, online-only team workspace (Google Keep + Notion + Excalidraw +
team chat) for a single team of under 10 people. Mobile-responsive throughout.

## Locked tech stack — do NOT substitute

- **Next.js 16 + TypeScript** → Vercel (Hobby, free). App Router, Turbopack default.
- **Supabase** (free tier): Postgres + Auth (email/password + Google) + Realtime.
- **Tailwind CSS v4** (responsive-first).
- **BlockNote** block editor (native Yjs) — docs module, later phase.
- **@excalidraw/excalidraw** — whiteboards, later phase.
- **Yjs** (CRDT) carried over **Supabase Realtime broadcast** channels.
- **Supabase Storage** for files (swap path to GCS documented — see `docs/adr/`).

## One phase per session

Build in the phases defined in `build-spec.md`, **one phase per session** — do not jump
ahead. Phase 1 (Foundation) is complete: auth, workspace/teams/projects, RLS, the
Yjs↔Realtime sync layer, presence, and the app shell. Phase 2 (Notes) is complete: the
workspace-wide `/notes` board (colors, labels, pin, checklists, image attachments,
archive/trash, grid/list). Phase 3 (Docs) is complete: per-project BlockNote pages
(nested tree, slash commands, drag-reorder, callout/divider/toggle, @-mentions + backlinks,
trash/restore, page icons, image upload) on the Phase-1 Yjs layer. Phase 4 (Databases) is
complete: per-project databases with **Table + Board (Kanban) views**, multiple saved views,
flexible JSONB properties (title/text, status, single/multi-select, date, person→member),
native-HTML5 drag between board columns, and an inline database embed inside Docs pages —
all on Supabase Postgres Changes (NOT Yjs). Phase 5 (Whiteboard) is complete: per-project
**@excalidraw/excalidraw** infinite canvas (shapes, arrows, freehand, text, sticky notes,
connectors) with real-time multi-user collab + live cursors, an inline whiteboard embed
inside Docs pages, and PNG/SVG export — the canvas body lives in the Phase-1 Yjs layer
(`doc_type='whiteboard'`) via a hand-rolled Excalidraw↔Yjs binding; images go to Supabase
Storage. Phase 6 (Glue & polish) is complete — the **FINAL** feature phase: workspace-wide
**team chat** (`/chat`, WhatsApp-style inline quote-replies, reactions, @member-mentions,
presence, infinite scroll, attachments, edit/delete, unread badge), **comments** on Docs
pages + Note cards, a per-project **activity feed**, and real **⌘K global search** — all on
Supabase Postgres Changes (NOT Yjs), reusing the Phase-5 realtime singleton. Phase 7
(Member profiles & UX polish) is complete: **editable self-profile** (display name, uploaded
**avatar**, and a unique **`@handle`**), **handle-based @-mentions** (the handle is written into
the message body so mentions survive name changes), an **inline topbar search dropdown** (replacing
the centered command-palette modal), and **team/project rename + delete**. **All six v1 modules are
shipped; remaining work is UI/UX polish, not new features.**

## Resolved product decisions (Phase 1)

- **One workspace** (schema is `workspace_id`-scoped for future-proofing; no switcher).
- **Teams** = organizational grouping only — **no visibility walls**; every member can
  read AND edit every team's content.
- **Roles:** `owner` (sole admin) + `editor`. **No viewer.**
- **Access = invite-gated + request-to-join:** the owner pre-authorizes emails (pending
  membership) → auto-join as active Editor on matching signup. Uninvited signups become a
  **join request** (status `requested`) the owner approves/denies on `/members`; an
  already-signed-up user can also hit "Request access". Membership statuses: `pending`
  (invited, not signed up yet) · `requested` (awaiting approval) · `active`. Inviting an
  email that already has an account links it immediately (`invite_member` RPC). No
  email-sending service ($0).

## Resolved product decisions (Phase 2 — Notes)

- **Scope:** one **workspace-wide board** at `/notes` (Keep-style). Notes carry a *nullable*
  `project_id` (optional "file under a project") + a denormalized `workspace_id` for
  single-hop RLS and the realtime filter.
- **Realtime = Supabase Postgres Changes**, NOT Yjs/broadcast. Notes are plain rows; the
  client subscribes to `notes` / `note_checklist_items` / `note_labels` / `labels`
  (filtered `workspace_id=eq.{ws}`) and does a debounced full-board refetch. The new tables
  are in the `supabase_realtime` publication (added in the migration) with `replica
  identity full` — distinct from `yjs_documents`, which stays broadcast-only.
- **Trash/delete:** any member archives/trashes/restores (reversible UPDATEs to
  `archived_at`/`trashed_at`); **permanent delete + empty-trash + label delete are
  owner-only** (mirrors `projects_delete`).
- **Labels** are workspace-wide shared (`labels` + `note_labels`).
- **Mutations** go through `lib/actions/notes.ts` (DAL-gated). The board owns optimistic
  state + realtime, so note actions deliberately **skip `revalidatePath`**. The editor
  modal seeds title/content into local state and syncs remote edits in **only when the
  field isn't `document.activeElement`** (live, but never clobbers active typing).

## Resolved product decisions (Phase 3 — Docs)

- **Scope:** pages are **per-project** (`pages.project_id` NOT NULL). `/p/[projectId]` is the
  project's Docs home (full hierarchy outline + Trash); `/p/[projectId]/[pageId]` mounts the
  editor. The Phase-1 scratchpad demo was **retired** (the Yjs layer it proved is now exercised
  by BlockNote — `lib/yjs/*` untouched).
- **Pages are Yjs-collaborative** (unlike Keep notes). The block BODY lives in the unified
  `yjs_documents` table under `doc_type='page'`; `useKoreYDoc({ docType:'page', docId:pageId })`
  + the existing `KoreYjsProvider` do all sync/snapshots. BlockNote binds to the SAME
  `ydoc`/`awareness`: its `collaboration` takes `{ provider:{ awareness }, fragment:
  ydoc.getXmlFragment('document-store'), user:{name,color} }` (YSync reads only `fragment`,
  YCursor only `provider.awareness` — confirmed in 0.51.4 source). Mount `<PageEditor key={pageId}>`.
- **Relational envelope vs. Yjs:** the tree (`title`/`icon`/`parent_page_id`/`sort`) and the
  derived `page_links` backlink graph are real columns synced via **Postgres Changes** (Yjs
  state is opaque `bytea`, unscannable). `sort` is a `double` fractional rank (drag-reorder =
  one midpoint UPDATE). Page actions in `lib/actions/pages.ts` are DAL-gated and **skip
  `revalidatePath`** (the sidebar tree + Docs home own realtime + optimistic state).
- **Trash (mirrors notes):** any member trashes a page + its subtree via `trashed_at` (a
  member UPDATE, reversible: `trashPage`/`restorePage` cascade over the `page_subtree_ids`
  SQL fn); **permanent delete + empty-trash are owner-only** (`pages_delete` policy). Live
  loaders/mentions/backlinks filter `trashed_at is null`; the Trash UI is on the Docs home.
- **Mentions/backlinks:** `@` picker inserts an atomic `mention` inline content (stores target
  `pageId` + cached title; the chip resolves the LIVE title from a `useSyncExternalStore`
  title store fed by a workspace-pages subscription). On debounced edit the editor rewrites the
  source's `page_links` rows via `syncPageLinks`; the backlinks panel is realtime.
- **Editor stack:** `@blocknote/core|react|mantine` `^0.51.4` (React 19 / Next 16 OK), loaded
  with `dynamic(() => import('./page-editor'), { ssr:false })`. Only **callout** is a custom
  block (`createReactBlockSpec`); toggle/quote/divider/code are built-in. Slash items merge the
  callout into the localized "Basic blocks" group (else duplicate-key crash). Theme = `--bn-*`
  CSS-var overrides → our tokens, light/dark from `useTheme()`. Image/file blocks use
  `uploadFile`→`uploadDocFile` (stores object PATH in the `note-attachments` bucket at
  `{ws}/pages/{pageId}/…`) + `resolveFileUrl`→`getSignedUrl`. Page icons = curated emoji
  `IconPicker` writing `pages.icon`.
- **`reactStrictMode:false`** (next.config.ts): StrictMode's double-invoked effects made
  Supabase Realtime `.on()` an already-subscribed channel and left the provider stuck
  "Connecting". All postgres_changes channels also carry a per-mount `useId()` suffix so
  navigation never reuses a still-closing channel (page-doc-view's was workspace-constant).

## Resolved product decisions (Phase 4 — Databases)

- **Scope:** databases are **per-project** standalone entities at `/p/[projectId]/db/[databaseId]`
  (sidebar list + a section on the project Docs home), **AND** an inline embed inside Docs pages.
  Plain structured rows on **Supabase Postgres Changes** (NOT Yjs) — the notes pattern.
- **JSONB storage:** `database_rows.data jsonb` keyed by **property id** (no EAV). Property defs
  live in `database_properties` (`type` ∈ title/text/select/multi_select/status/date/person,
  plus an `options` jsonb of `{id,name,color}` for the select-likes). `person` cells store an
  **array** of member user ids (resolved to profiles via the members pattern).
- **Multiple saved views:** `database_views` (one row per Table/Board tab; `group_property_id`
  picks the board's grouping column). Per-view card order = a global `database_rows.sort`
  (double) + a sparse `view_order jsonb` ({viewId:number}); effective order =
  `view_order[viewId] ?? sort`, sorted in JS. A drag = one narrow UPDATE on the dragged row.
- **Board (Kanban):** columns derive from a status/select property's options (+ a leading
  "No <prop>" column for blanks); native-HTML5 drag (no @dnd-kit, mirrors the page tree). A
  cross-column drop sets the group cell **and** the view order in one RPC; tie ranks reseed.
- **Concurrency-safe cell writes:** a row's cells share one `data` jsonb, so single-cell writes
  go through SECURITY-INVOKER RPCs doing TARGETED jsonb writes (`db_set_cell` /
  `db_set_row_group` / `db_set_view_order`; `db_strip_property`/`db_strip_view_order` clean
  orphan keys on column/view delete) — concurrent edits to distinct keys merge, never clobber.
- **DAL/RLS:** actions in `lib/actions/databases.ts` are DAL-gated, stamp workspace_id/created_by,
  return `{ error }`, **skip `revalidatePath`** (DatabaseView + sidebar own realtime + optimistic
  state). Member CRUD on all 4 tables; only the whole-database **permanent delete + empty-trash
  are owner-only** (trashing a database is a member UPDATE; rows are member hard-deletes).
  Server actions re-resolve the property/row server-side (IDOR guard) and validate person ids.
- **Realtime:** DatabaseView subscribes to `databases` (filter `id=eq.{db}`) +
  `database_properties`/`database_views`/`database_rows` (filter `database_id=eq.{db}`), one
  channel per mount with a `useId()` suffix, `await setAuth` before `subscribe`, 300ms debounced
  `loadDatabase` refetch. Active view is per-client (localStorage), not synced.
- **Inline embed:** a BlockNote custom block `databaseEmbed` (`createReactBlockSpec`,
  `content:'none'`, **`meta:{ selectable:false }`** so ProseMirror can't node-select/delete it
  or hijack its clicks/drag) stores ONLY a `databaseId` and mounts the same `<DatabaseView embedded>`;
  context (`DatabaseEmbedContext`) carries workspace/project into the block. **Dropped BlockNote's
  built-in `table` block** from the schema (its TableHandles extension threw on the embed's own
  `<table>`). The embed's `<table>` still inherits `.ProseMirror table/th` CSS, so
  `app/globals.css` re-asserts `.kore-db-table { overflow:visible; table-layout:auto }` +
  `.kore-db-table .sticky { position:sticky !important }` (else the sticky header/frozen column break).
- **Dropdowns/popovers:** a portal-to-`document.body`, viewport-CLAMPED popover (`components/databases/shared.tsx`)
  — table/board scroll containers would otherwise clip an absolute menu, and an align=right menu
  near the left edge rendered off-screen. Cell triggers are `<div role="button">` (a `<button>`
  can't contain the chips' remove-`<button>`s — hydration error). Table sticky header + frozen
  title column need **`border-separate`** (Chrome drops sticky under `border-collapse`).

## Resolved product decisions (Phase 5 — Whiteboard)

- **Scope:** whiteboards are **per-project** standalone entities at `/p/[projectId]/wb/[whiteboardId]`
  (sidebar `ProjectWhiteboardsTree` + a `ProjectWhiteboardsSection` on the project Docs home),
  **AND** an inline embed inside Docs pages. The relational **envelope** (`whiteboards`:
  id/title/icon/sort/trashed_at) syncs via **Postgres Changes** (the notes/db pattern); the
  **canvas body** is **Yjs-collaborative** in the unified `yjs_documents` table under
  `doc_type='whiteboard'` (the Phase-1 layer Docs reuse).
- **Collab/persistence = REUSE the Yjs layer (NOT a separate broadcast).** `WhiteboardView`
  calls `useKoreYDoc({ docType:'whiteboard' })`; `KoreYjsProvider` does transport + snapshots
  (`save_yjs_snapshot`, debounced 2.5s + unload) for free, with correct per-element CRDT
  conflict handling. Excalidraw has **no native Yjs binding** and **`y-excalidraw` is rejected**
  (last pub Dec 2024; peer `@excalidraw/excalidraw ^0.17.6` excludes 0.18.x; no React 19) —
  so the binding is **hand-rolled** in `components/whiteboards/whiteboard-canvas.tsx`.
- **The binding:** elements live in `ydoc.getMap('elements')` keyed by element id (per-element
  LWW; deletions are `isDeleted:true` entries). Local `onChange` → **version-diffed** writes in
  one `ydoc.transact(…, LOCAL_ORIGIN)` (~60ms throttle); the Y.Map `.observe` ignores
  `origin===LOCAL_ORIGIN` and otherwise runs `reconcileElements(local, remote, appState)` →
  `updateScene({ elements, captureUpdate: CaptureUpdateAction.NEVER })` (remote/init never
  pollutes the local undo stack; `seen`-version bookkeeping prevents echo). Initial sync also
  runs once in the `excalidrawAPI` callback (covers either ready/loaded ordering).
- **Live cursors:** y-awareness ↔ Excalidraw `collaborators` `Map<SocketId, Collaborator>` —
  `onPointerUpdate` (throttled ~40ms) writes `awareness.setLocalStateField('pointer', …)`;
  `awareness.on('change')` rebuilds the collaborators Map → `updateScene({ collaborators })`.
  `isCollaborating` is set so carets render; unmount clears the local pointer.
- **Images = Supabase Storage (NOT base64-in-CRDT):** on a new file in `onChange.files`, decode
  the dataURL → `uploadFile` to `note-attachments` at `{ws}/whiteboards/{wbId}/…` (reuse
  `lib/storage`), and store ONLY `ydoc.getMap('files'): {fileId→{path,mimeType}}` in the CRDT;
  remote clients observe that map → `getSignedUrl` → fetch → `addFiles`. Keeps snapshots lean.
- **Excalidraw 0.18.1 specifics:** client-only — `whiteboard-canvas` is loaded
  `dynamic(()=>import('./whiteboard-canvas'), { ssr:false })` by `whiteboard-view`, which itself
  has NO static `@excalidraw/excalidraw` value import (only `import type … from
  '@excalidraw/excalidraw/types'` + a lazy `await import(...)` in the export handler) so the
  server route never loads it. `import '@excalidraw/excalidraw/index.css'`. Export = client-side
  `exportToBlob` (PNG) / `exportToSvg` (SVG). No `transpilePackages` needed (Turbopack OK).
- **Embed:** a `whiteboardEmbed` BlockNote block (`createReactBlockSpec`, `content:'none'`,
  **`meta:{ selectable:false }`** + `contentEditable={false}` wrapper) stores ONLY a
  `whiteboardId` and mounts `<WhiteboardView embedded>` (same Yjs doc ⇒ live). `WhiteboardEmbedContext`
  carries `{workspaceId, projectId, user}` (the embed is collaborative, so unlike `databaseEmbed`
  it needs the presence `user`). **Gotcha:** `.bn-block-content` is `display:flex` and Excalidraw
  has no intrinsic width, so the embed wrapper needs **`w-full`** or it collapses to min-content
  (`databaseEmbed` escaped this only because its `<table>` has intrinsic width). `globals.css`
  adds `.kore-wb-canvas { position:relative; height:100%; width:100% }` (Excalidraw fills its box).
- **Trash/perms (mirrors databases):** member trash/restore via `trashed_at`; only the whole
  whiteboard's **permanent delete + empty-trash are owner-only** (`whiteboards_delete`). An AFTER
  DELETE trigger purges the matching `yjs_documents` snapshot (image objects in Storage are left
  orphaned in v1, like Docs). Recents/favorites are NOT wired (parity with databases).

## Resolved product decisions (Phase 6 — Glue & polish)

- **All on Supabase Postgres Changes (NOT Yjs).** Five new tables in `…160000_glue.sql`
  (`messages`, `message_reactions`, `message_reads`, `comments`, `activity_log`), each with a
  denormalized `workspace_id`, `replica identity full`, in the `supabase_realtime` publication,
  explicit `grant … to authenticated`. Loaders/actions mirror the notes/databases pattern
  (DAL-gated, stamp `workspace_id`/`author_id`, IDOR re-resolve, return `{ error }`, **skip
  `revalidatePath`**).
- **Realtime reuses the Phase-5 singleton.** `lib/realtime/workspace-tables.ts` `WATCHED` was
  extended with the 5 tables; the sidebar unread badge, comment panels, and the activity section
  all subscribe via `useWorkspaceTable(...)`. Only the **`/chat` route** opens its own dedicated
  `chat:{ws}:{useId}` channel (the DatabaseView pattern — high-frequency, one mount).
- **Authz (messages & comments are author-scoped):** authors EDIT **and** DELETE their own; the
  workspace **owner may DELETE (not edit) anyone's** — encoded as an author-only UPDATE policy +
  **two permissive DELETE policies** (`*_delete_own` author / `*_delete_owner` owner) that OR.
  `message_reads` is strictly self-scoped; `activity_log` insert is gated on `actor_id=auth.uid()`
  (append-only, no update/delete).
- **Team chat** (`/chat`, one workspace channel — `workspace_id` IS the channel): WhatsApp-style
  inline **quote-replies** via `messages.parent_message_id` (`on delete set null` so a moderated
  parent keeps its replies); emoji reactions (`message_reactions`, unique `(message_id,user_id,
  emoji)` → insert/`23505`→delete toggle); `message_reads.last_read_message_id` drives the unread
  badge; presence via the shared `useWorkspacePresence`; **infinite scroll-UP** (keyset on
  `(created_at,id)`; realtime reload uses `loadChatWindow` anchor→now to keep the top anchored);
  attachments stored **inline on `messages.attachments` jsonb** (NOT the `attachments` table,
  which is unpublished — inline rides the message INSERT) via `uploadChatFile` →
  `{ws}/chat/{uuid}`.
- **Comments:** one reusable `<CommentsPanel>` — a right-side panel on Docs pages (full-screen
  drawer below `md:`) and an **inline** section in the note modal (`inline` prop = natural height,
  no internal scroll). Polymorphic `comments.target_type` (`page`|`note`) + `target_id`, **no FK**
  (like `attachments`); the panel subscribes via the singleton `useWorkspaceTable('comments')` and
  client-filters to its target. (Deleting a page/note orphans its comments — invisible, v1 tradeoff.)
- **`@member`-mentions in textareas** (distinct from the Phase-3 page mentions inside BlockNote):
  `components/mentions` — a `<MentionTextarea>` with a caret-token `@` popup, plus
  `extractMentionIds`/`renderMessageBody`. **Dual storage:** the body keeps a literal `@…` token
  (renders chips via a greedy longest-first scanner, boundary-gated so `email@anna` isn't a mention)
  AND a parsed `mentions uuid[]` column (validated to active members; future notifications).
  **Phase 7 changed the token from `@Name` → `@handle`** (stable across renames — see the Phase 7 section).
- **Activity feed** (per-project, coarse): a best-effort `logActivity()` helper (NOT a server
  action — never throws, never blocks the mutation) called INSIDE the existing pages/databases/
  whiteboards/notes actions on create/rename/trash/restore/delete (notes only when project-filed;
  `target_title` is a snapshot). `<ActivitySection>` on the project Docs home self-hides when empty.
- **⌘K global search:** the `global_search(p_workspace, p_query)` **SECURITY DEFINER** RPC —
  MANDATORY `is_workspace_member` early-return (else cross-workspace leak), plain **ILIKE** (escaped
  `%`/`_`/`\`; no trigram) UNION across notes (title+content), pages (title + **`search_text`**),
  databases (name), database_rows (`data::text`), whiteboards (title), messages (body). Page BODIES
  are searchable via a new denormalized **`pages.search_text`** column written debounced from the
  editor onChange (alongside `syncPageLinks`) — old pages stay title-only until first edited.
  The palette replaced the Phase-1 placeholder. **(Phase 7 superseded the centered-modal palette with
  an inline topbar search dropdown — `command-palette.tsx` was deleted; `global-search.tsx` owns it.)**
- **Gotchas found verifying:** (1) `lib/use-workspace-presence.ts` is now a **ref-counted
  singleton** — the chat header + the topbar both mount it, and two channels on the same
  `presence:{ws}` topic threw "cannot add presence callbacks after subscribe()". (2) Chat message
  time renders **client-only** (a `ClockTime` component) — `toLocaleTimeString` is locale/TZ-
  dependent and the initial messages are SSR'd, so server text mismatched the browser on hydration.

## Resolved product decisions (Phase 7 — Member profiles & UX polish)

- **Editable self-profile (self-only).** Each member edits their OWN `full_name`, `avatar_url`, and a
  new `profiles.handle` via an **"Edit profile"** item in the avatar menu → `<ProfileModal>`
  (`components/shell/profile-modal.tsx`). The action is `updateProfile` in `lib/actions/auth.ts`
  (gated by `verifySession`; `profiles_update_self` RLS already permits self-updates — **no new table
  RLS**). Owner does NOT edit others (parity with the rest of the app).
- **Mention handle = `profiles.handle`** — unique, lowercase, `^[a-z0-9_]{3,20}$` (enforced by a
  CHECK + `unique(lower(handle))`). Every member always has one: `generate_handle()` backfills
  existing rows and the `handle_new_user` signup trigger assigns one (from full_name/email local-part,
  deduped). Friendly `23505` → "handle already taken".
- **Handle-in-body mentions (supersedes the Phase-6 `@Name` scheme).** The member-mention scanner
  (`components/mentions/mention-utils.tsx`) now matches the **handle** at each `@` (longest-first,
  word-boundary) and writes `@handle` into the body — so a mention **survives display-name changes**;
  the rendered chip still shows the friendly **display name**. The picker (`mention-textarea.tsx`)
  filters by handle OR name but inserts the handle. `MentionMember`/`DbMember` gained `handle`;
  `loadWorkspaceMembers` selects it. **Tradeoff:** messages authored before Phase 7 stored `@Name`
  and now render as plain text (no backfill — fine for a near-empty workspace).
- **Avatars → a NEW PUBLIC `avatars` Storage bucket** (NOT the private `note-attachments`).
  `lib/storage.ts` `uploadAvatar` returns a **stable public URL** stored directly in
  `profiles.avatar_url` — every avatar render site already does `<img src={avatarUrl}>`, so **zero
  signing changes** (OAuth URLs coexist; both are plain URLs). Path `{ws}/avatars/{userId}-{uuid}.ext`
  (uuid busts cache; old object orphaned, v1). Object-write RLS is in the migration; the **bucket is
  created manually** (public, 5 MB).
- **Inline global search (replaces the centered command-palette modal).** `components/shell/global-
  search.tsx` is now a real `<input>` with a results dropdown anchored beneath it; ⌘K **focuses** it
  (no longer toggles a modal). `command-palette.tsx` was **deleted** (its `globalSearch` + `hrefFor`
  logic moved in). The per-page "Search notes" box on `/notes` is a separate LOCAL filter, untouched.
- **Team/project rename + delete.** `renameTeam`/`deleteTeam`/`renameProject` in
  `lib/actions/workspace.ts` (+ the pre-existing `deleteProject`), surfaced via a reusable
  `<EntitySettingsMenu>` (`components/shell/entity-settings-menu.tsx`) on the team page and project
  Docs-home headers. Authz mirrors RLS: rename/delete team + delete project = **owner**; rename
  project = any member. Deleting a team cascades to its projects (FK `on delete cascade`).
- **Migration `…170000_profiles_handles.sql`** (handle column + index + CHECK, `generate_handle()`,
  backfill, updated `handle_new_user`, `avatars` bucket object policies). `types/database.ts` gained
  `handle` on profiles Row/Insert/Update.

## Next.js 16 gotchas (this is NOT the Next.js in your training data)

- `middleware.ts` is renamed to **`proxy.ts`** (repo root, `export function proxy`,
  Node.js runtime — do NOT set a `runtime` config).
- **Proxy is optimistic only.** Server Actions bypass the proxy matcher, so the real
  authz boundary is the DAL (`lib/dal.ts` → `requireMember` / `requireOwner`), called in
  the gated layout and every Server Action.
- `params` and `searchParams` are **Promises** — always `await` them.
- Client-only libs (BlockNote, Excalidraw) must use `dynamic(() => import(...), { ssr:false })`.
- Read the relevant guide under `node_modules/next/dist/docs/` before writing new patterns.

## RLS on every table — the security convention

Every table has RLS **enabled**, with policies. Membership checks go through
`SECURITY DEFINER` helpers (`is_workspace_member`, `is_workspace_owner`,
`current_user_role`, `are_co_members`) so policies never recurse. Schema + policies live
in `supabase/migrations/`: `20260620090000_init.sql` (schema, RLS, triggers, RPCs) +
`…_invite_existing_users.sql` (`invite_member`) + `…_join_requests.sql` (request-to-join,
`request_access`/`my_membership_status`, `requested` status) + `…120000_notes.sql` (notes
tables, RLS, `supabase_realtime` publication + `replica identity full`, `empty_trash`,
`storage.objects` policies for `note-attachments`) + `…130000_pages.sql` (pages tree +
`page_links`, `page_subtree_ids`, yjs snapshot purge) + `…140000_databases.sql` (databases /
database_properties / database_views / database_rows — JSONB props, member-CRUD/owner-delete
RLS, realtime publication + replica identity full, the jsonb-partial-update RPCs, and
`empty_database_trash`) + `…150000_whiteboards.sql` (whiteboards envelope — member-CRUD/
owner-delete RLS, realtime publication + replica identity full, `empty_whiteboard_trash`, and
the `purge_whiteboard_yjs` AFTER-DELETE trigger that drops the `doc_type='whiteboard'`
snapshot) + `…160000_glue.sql` (Phase 6: `messages` / `message_reactions` / `message_reads` /
`comments` / `activity_log` — author-scoped edit/delete + owner-delete RLS, realtime publication
+ replica identity full, the `pages.search_text` column, and the `global_search` SECURITY-DEFINER
RPC) + `…170000_profiles_handles.sql` (Phase 7: `profiles.handle` column + `unique(lower(handle))`
+ format CHECK, `generate_handle()` fn, backfill, updated `handle_new_user` trigger, and
`storage.objects` write policies for the PUBLIC `avatars` bucket). Never write inline SQL in chat —
add a new timestamped migration file. **New tables created in a later migration need an explicit
`grant … to authenticated`** (init's blanket grant was a one-time snapshot).

## Yjs ↔ Supabase Realtime sync model

- Transport: **broadcast** on a **private** channel `doc:{workspace}:{type}:{id}` (NOT
  Postgres changes). RLS on `realtime.messages` locks channels to workspace members.
- Snapshots: each client writes the **full** doc state (`Y.encodeStateAsUpdate`),
  **debounced 2.5 s** + on unload, via `save_yjs_snapshot` RPC. **Last-writer-wins is
  conflict-free** because every snapshot is a complete CRDT merge.
- Join: buffer live updates → load snapshot → flush → `state-request` handshake (peers
  reply with the state-vector diff). Correct because Yjs is commutative + idempotent.
- Presence: **Supabase Presence** for who's-online; **y-awareness** (over broadcast) for
  live cursors. The reusable hook is `lib/yjs/use-kore-ydoc.ts` — BlockNote/Excalidraw
  bind to the SAME `ydoc`/`awareness` in later phases.
- **Realtime gotchas (found & fixed verifying Phase 1):** `supabase.realtime.setAuth()` is
  **async** in realtime-js 2.x — `await` it *before* `subscribe()`, or the private-channel
  join hangs forever at "connecting". Cursor overlays must sit **above** the opaque editor
  surface (`z-10`), or carets paint behind it and stay invisible.
- **Postgres-Changes pool limit (found & fixed verifying Phase 5):** opening one
  `postgres_changes` channel per component (each sidebar tree + home section + open view,
  ×projects) exhausts the free-tier Realtime pool once 2 windows are open — Supabase rejects
  new joins with `IncreaseConnectionPool` (and that rejection cascades to the presence +
  Yjs-broadcast channels too). Fix: **`lib/realtime/workspace-tables.ts`** — a ref-counted
  singleton that multiplexes pages/databases/whiteboards onto **ONE** channel per workspace
  (several `.on('postgres_changes')` listeners, filtered by `workspace_id`); the sidebar
  trees, the project-home sections, the Docs home, and WhiteboardView all subscribe via
  `useWorkspaceTable(workspaceId, table, onChange)` instead of each opening a channel.
  (page-doc-view's title-store channel, backlinks, DatabaseView's 4-table channel, the notes
  board, and the Yjs provider/presence channels stay separate — each is one per route.)
  **Phase 6 extended `WATCHED`** with `messages`/`message_reactions`/`message_reads`/`comments`/
  `activity_log`: the sidebar unread badge, comment panels, and the activity section ride the
  singleton; only the single-mount `/chat` route opens its own dedicated channel.

## Folder structure

```
proxy.ts                      root: @supabase/ssr session refresh + optimistic redirects
app/
  login | signup              public auth pages
  auth/callback/route.ts      OAuth / email-confirmation code exchange
  (onboarding)/               authed but no membership: setup, request-access
  (app)/                      authed + member: home, t/[teamId], members, notes, chat,
                              p/[projectId] (Docs home), p/[projectId]/[pageId] (page editor),
                              p/[projectId]/db/[databaseId] (database — Table/Board),
                              p/[projectId]/wb/[whiteboardId] (whiteboard — Excalidraw)
lib/
  supabase/ client|server|proxy.ts
  dal.ts                      verifySession / requireMember / requireOwner / getPresenceUser
  actions/ auth.ts | workspace.ts | notes.ts | pages.ts | databases.ts | whiteboards.ts
           | chat.ts | comments.ts | activity.ts (logActivity helper)   server actions
  yjs/ provider | awareness | snapshot | use-kore-ydoc | encoding
  notes/ colors | types | load-board     notes board data + palette + aggregate types
  docs/ tree | types | load-pages        pages tree helpers (midpointSort) + loaders
  databases/ types | colors | ordering | load-database   db aggregate + option palette + per-view order
  whiteboards/ types | load-whiteboards   whiteboard envelope types + loaders (canvas body = Yjs)
  chat/ types | load-chat        chat aggregate + keyset/window loaders + unread count
  comments/ types | load-comments    comment thread loader (polymorphic target)
  activity/ load-activity        per-project activity feed loader
  search/ search                 globalSearch RPC client (dedupe + group)
  realtime/ workspace-tables   ONE shared postgres_changes channel per workspace (pool-safe)
  storage.ts                  uploadFile / uploadDocFile / uploadChatFile / uploadAvatar (public bucket) / getSignedUrl(s) / deleteFile (ADR 0001 seam)
  format-time.ts              timeAgo / clockTime (chat/comments/activity)
  presence.ts | use-workspace-presence.ts (ref-counted singleton)
components/ auth | onboarding | members | shell | collab | notes | docs | databases | whiteboards
            | chat | comments | activity | mentions  + theme-provider/-toggle
            (docs = BlockNote editor + databaseEmbed + whiteboardEmbed; databases =
            DatabaseView/Table/Board/cells; whiteboards = WhiteboardView/WhiteboardCanvas;
            chat = ChatView/timeline/message-row/composer; comments = CommentsPanel;
            mentions = MentionTextarea + render/extract; shell += global-search (inline
            dropdown) + profile-modal + entity-settings-menu + chat-unread-badge)
supabase/migrations/          the schema + RLS migration(s)
types/database.ts             regenerate: supabase gen types typescript --linked > types/database.ts
```

## Env vars

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (= the **publishable**
`sb_publishable_…` key), `SUPABASE_SERVICE_ROLE_KEY` (= the **secret** `sb_secret_…` key,
server-only — never `NEXT_PUBLIC_`). Set all three in `.env.local` and in Vercel
(Preview + Production).

## Supabase dashboard setup (manual, one-time)

1. Auth → Providers: enable **Email** + **Google** (paste Google OAuth client id/secret).
2. Auth → URL config: Site URL + redirect URLs include `/auth/callback` (localhost + Vercel).
3. **Realtime → enable Realtime Authorization (private channels)** so `realtime.messages`
   policies apply. Do NOT enable Postgres-changes replication for `yjs_documents` (the
   notes tables ARE published, but via the migration, not the dashboard).
4. Apply the migration: `supabase link --project-ref <ref>` → `supabase db push`.
5. After the first owner signs up, they hit `/setup` once to create the workspace.
6. **(Phase 2)** Storage → New bucket → **`note-attachments`**, **private**, 5 MB limit
   (MIME restriction optional — the client validates png/jpeg/webp/gif). The bucket's
   object RLS policies ship in the notes migration; only the bucket itself is manual.
7. **(Phase 3, 4, 5 & 6)** No new manual setup — pages + whiteboard + **chat** images all reuse
   the `note-attachments` bucket (chat files land at `{ws}/chat/…`); databases store no files.
   Just `supabase db push` the new migrations + regenerate types (`supabase gen types typescript
   --linked > types/database.ts`, then re-add the hand-authored `MemberRole`/`MembershipStatus`
   aliases the generator drops).
8. **(Phase 7)** Storage → New bucket → **`avatars`**, **PUBLIC**, 5 MB limit — member avatar
   uploads. Public ⇒ stable URLs stored in `profiles.avatar_url` (no signing); the bucket's
   write/delete object policies ship in `…170000_profiles_handles.sql`, only the bucket is manual.

## Test ritual: "open two browser windows" (verify realtime before declaring done)

Open the same project in **two browser windows** signed in as two members. Type in the
scratchpad in one → text appears in the other within a beat; each user's **live cursor**
shows in the other; the **who's-online** avatars update; close one tab → its cursor and
avatar disappear. Never call a realtime change done without this two-window check.

## Storage → GCS swap path

Files are referenced by an **object path in Postgres** (`attachments.url` holds the path,
not a signed URL), so swapping Supabase Storage (1 GB free) for Google Cloud Storage (5 GB
always-free) is a reimplementation of the single `lib/storage.ts` helper
(`uploadFile`/`getSignedUrl(s)`/`deleteFile`), not a rebuild — components depend on that
interface. Signed URLs are minted on read. Do NOT use the Google Drive API. See
`docs/adr/0001-storage-supabase-to-gcs.md`.
