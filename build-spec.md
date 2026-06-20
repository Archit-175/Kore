# Build Spec — Kore

> Hand this document to Claude Code to build Kore. It is the single source of truth for v1.

---

## 1. Product Summary

**Kore** is a single web app that combines three things under shared team projects:

- **Quick Notes** — like Google Keep
- **Docs & Databases** — like Notion
- **Whiteboards** — like Excalidraw

A small team (under 10 people) signs in, joins shared projects, and works together in real time across all three modules. Everything feels like one product with a unified shell, not three separate tools.

---

## 2. Locked Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Cost | **$0 / month** | Entirely free tiers + open source |
| Connectivity | **Online only** | No offline caching — simpler build |
| Mobile | **Fully responsive** | Tailwind responsive design throughout; touch-friendly |
| Real-time transport | **Yjs over Supabase Realtime (Option A)** | No separate WebSocket server, stays in free tier |
| Team size | **Under 10 users** | No heavy scaling infrastructure needed |
| Roles | **Owner / Editor** (no Viewer) — *finalized Phase 1* | Single owner/admin; everyone else edits |
| Structure | **One workspace → Teams → Projects** — *finalized Phase 1* | Teams are organizational grouping only — **no visibility walls**; every member sees/edits all content |
| Access | **Invite-gated + request-to-join** — *finalized Phase 1* | Owner pre-authorizes emails (auto-join on signup); uninvited signups become a join request the owner approves on `/members`. No email-sending service ($0) |

---

## 3. Tech Stack (Locked)

- **Framework / Hosting:** Next.js **16** + TypeScript → Vercel (Hobby, free). App Router, Turbopack.
  - ⚠️ Next.js 16 differs from older versions: `middleware.ts` is renamed to **`proxy.ts`** (Node.js runtime); `params`/`searchParams` are **Promises** (await them); client-only libs use `dynamic(..., { ssr:false })`.
- **Database + Auth + Realtime:** Supabase (free tier)
  - Postgres (500 MB)
  - Supabase Auth (email/password + Google OAuth). Uses the **new key format**: `sb_publishable_…` (anon/public) + `sb_secret_…` (service role, server-only).
  - Supabase Realtime (used as the Yjs transport — **broadcast on private channels**, gated by RLS on `realtime.messages`). Note: `realtime.setAuth()` is async — `await` it before `subscribe()`.
- **Styling:** Tailwind CSS (responsive-first)
- **Block editor:** BlockNote (open source, native Yjs support)
- **Whiteboard:** `@excalidraw/excalidraw` (open source, native collaboration)
- **Real-time sync:** Yjs (CRDT) carried over Supabase Realtime channels
- **File storage:** Supabase Storage (1 GB free)
  - **Documented upgrade path:** Google Cloud Storage (5 GB always-free) if 1 GB cap is hit. Files are referenced by URL in Postgres, so swapping the storage backend is a small change, not a rebuild. Do NOT use Google Drive API for app storage.

---

## 4. Feature Set (v1 Scope)

### 4.1 Foundation — ✅ COMPLETE (Phase 1, verified)
- Supabase Auth: email/password + Google OAuth ✅
- One workspace → **Teams** (org grouping) → **Projects** ✅
- Members join by **invite** (owner pre-authorizes → auto-join) or **request** (uninvited signup → owner approves on `/members`) ✅
- **2 roles: Owner, Editor** (no Viewer) enforced via Postgres Row Level Security ✅
- Yjs sync layer wired over Supabase Realtime (broadcast + full-state LWW snapshots) ✅
- Presence: live cursors + "who's online" indicators ✅
- App shell: unified collapsible sidebar (mobile-friendly), global search **placeholder**, dark/light mode ✅
- Favorites and recents ✅

> Verified via the two-browser ritual: edit syncs, live named cursors, who's-online
> avatars, clean disconnect. The reusable collaboration hook (`lib/yjs/use-kore-ydoc.ts`)
> is what BlockNote (Phase 3) and Excalidraw (Phase 5) bind to. Global search is a
> placeholder to be wired up later.

### 4.2 Notes (Google Keep) — ✅ COMPLETE (Phase 2, verified)
- Card-based notes with color options ✅
- Labels / tags (workspace-wide shared) ✅
- Pin to top ✅
- Checklists (to-do items) ✅
- Image attachments (Supabase Storage, private `note-attachments` bucket) ✅
- Archive and Trash (with restore); permanent delete + empty-trash are owner-only ✅
- Grid / list view toggle (responsive on mobile) ✅

> Workspace-wide board at `/notes` (notes also carry a nullable `project_id`). Live sync
> via **Supabase Postgres Changes** (plain rows, not Yjs) — verified with the two-browser
> ritual. Files go through the single `lib/storage.ts` seam (ADR 0001) as a stored object
> path + server-minted signed URLs, keeping the GCS swap a one-file change.

### 4.3 Docs (Notion) — ✅ COMPLETE (Phase 3, verified)
- BlockNote block editor: text, headings, bulleted/numbered lists, toggle, callout, code, divider, quote ✅
- Nested pages / sub-pages ✅
- Slash (`/`) commands ✅
- Drag-to-reorder blocks ✅
- Page mentions and backlinks ✅
- Page icons, image/file upload, trash/restore ✅
- **Databases** with **Table** and **Board (Kanban)** views → ✅ **Phase 4**
- Database properties: status, single/multi-select, date, person → member → ✅ **Phase 4**

> Per-project BlockNote pages bound to the Phase-1 Yjs layer (`doc_type='page'`), nested tree
> with drag-reparent, `@`-mentions + a derived `page_links` backlink graph, member trash/restore
> (owner permanent-delete). Verified via the two-browser ritual.

### 4.3a Databases (Notion) — ✅ COMPLETE (Phase 4, verified)
- Per-project standalone databases (`/p/[projectId]/db/[databaseId]`) **and** an inline embed
  inside Docs pages ✅
- **Table view** (frozen title column, sticky header, inline per-type cell editors) ✅
- **Board (Kanban) view** — columns from a status/select property + a "No value" column;
  native-HTML5 drag between columns ✅
- **Multiple saved views** (Table/Board tabs) with per-view card order ✅
- Flexible **JSONB** properties: title, text, single-select, multi-select, status, date,
  person→member (multi) ✅
- Member CRUD; owner-only permanent delete + empty-trash ✅

> Plain structured rows on **Supabase Postgres Changes** (NOT Yjs), mirroring Notes. `data jsonb`
> keyed by property id; `database_views` for tabs; concurrency-safe single-cell writes via
> targeted-jsonb RPCs. Inline embed = a `databaseEmbed` BlockNote block (`selectable:false`)
> that mounts the same `DatabaseView`. Verified via the two-browser ritual.

### 4.4 Whiteboard (Excalidraw) — ✅ COMPLETE (Phase 5)
- Infinite canvas: shapes, arrows, freehand, text, sticky notes, connectors → ✅
- Real-time collaboration (multi-user editing) + live cursors → ✅ (hand-rolled Excalidraw↔Yjs
  binding on the Phase-1 layer, `doc_type='whiteboard'`; `y-excalidraw` rejected as stale)
- Embed a whiteboard inside a doc page → ✅ (`whiteboardEmbed` BlockNote block, same Yjs doc)
- Export to PNG / SVG → ✅ (client-side `exportToBlob` / `exportToSvg`)
- Images → Supabase Storage (`note-attachments`); CRDT holds only `{fileId→{path,mimeType}}`

> Per-project Excalidraw whiteboards. Envelope (`whiteboards`) syncs via Postgres Changes; the
> canvas body is Yjs (`doc_type='whiteboard'`). Single-window smoke verified (render/draw/persist/
> export/embed/live-cursor); the two-window simultaneous-edit ritual is the final manual check.

### 4.5 Team Chat — ✅ COMPLETE (Phase 6)
- **One global team channel** (workspace-wide, all members) at `/chat` ✅
- Real-time message delivery via Supabase **Postgres Changes** (not Yjs) ✅
- **Quote-replies** — WhatsApp-style: a reply renders the quoted parent inline (no thread panel) ✅
- **Emoji reactions** on messages ✅
- `@member`-mentions (people; shared with comments) ✅
- Online presence (reuse "who's online") ✅
- Message history with **infinite scroll-up** (keyset pagination) ✅
- Image/file attachments (Supabase Storage, inline on the message) ✅
- Edit / delete own messages (+ owner-delete moderation) ✅
- Unread indicator for the channel (badge on the Chat nav) ✅

### 4.6 Collaboration Glue — ✅ COMPLETE (Phase 6)
- Comments + `@member`-mentions on Docs pages and Note cards ✅
- Activity feed per project (coarse change history) ✅
- Global ⌘K search across all six modules (the Phase-1 placeholder replaced) ✅

> One workspace-wide chat, comments, a per-project activity feed, and ⌘K search — all plain
> rows on **Postgres Changes**, reusing the Phase-5 realtime singleton. Author-scoped
> edit/delete (owner may moderate-delete). Full Docs-body search via a synced `pages.search_text`
> mirror + a `global_search` SECURITY-DEFINER RPC. Verified single-window; the two-window
> simultaneous-member ritual is the final manual check.

### 4.7 Member Profiles & UX polish — ✅ COMPLETE (Phase 7)
- **Editable self-profile** (self-only, from the avatar menu): display name, avatar **image upload**,
  and a **mention handle** ✅
- **Mention handle** = a unique, lowercase nickname (`[a-z0-9_]`, 3–20 chars) used in `@`-mentions —
  picking `@archit` writes the **handle** into the body, so mentions stay valid across name changes ✅
- **Avatar upload** to a new **public `avatars` Storage bucket** (stable public URL in
  `profiles.avatar_url`; no signing) ✅
- **Inline global search** — the topbar box is now a real input with a results dropdown beneath it
  (⌘K focuses it); the old centered command-palette modal was removed ✅
- **Team / project rename + delete** from the team page and project Docs-home headers (owner-gated
  per RLS) ✅

> Per-member identity finally became editable: name, uploaded avatar, and a stable `@handle` for
> mentions (handle-in-body, chip shows the display name). All member-mention logic lives in
> `components/mentions/*` — only the scanner + picker changed. The confusing "two search boxes" was
> resolved by turning the topbar pill into the actual search input. New migration
> `20260620170000_profiles_handles.sql` (handle column + `generate_handle()` + backfill + signup-
> trigger update + `avatars` bucket policies); the bucket itself is created manually (public, 5 MB).

---

## 5. Suggested Data Model (Postgres / Supabase)

> Starting point — Claude Code may refine. Enable Row Level Security on all tables.
> **Phase 1 tables below are final** and live in `supabase/migrations/20260620090000_init.sql`
> (✅ marks shipped). Later-phase tables are still suggestions.

- **users** — handled by Supabase Auth
- **profiles** ✅ — `id`→auth.users, `email`, `full_name`, `avatar_url`, `handle` (unique lowercase mention nickname — *Phase 7*) (mirror, via auth trigger)
- **workspaces** ✅ — `id`, `name`, `owner_id`
- **teams** ✅ — `id`, `workspace_id`, `name`, `icon`, `position` *(org grouping inside workspace)*
- **memberships** ✅ — `id`, `workspace_id`, `user_id` (null while an invite is unclaimed), `invited_email`, `role` (**owner/editor**), `status` (**pending** = invited, not signed up · **requested** = self-requested, awaiting approval · **active**). Invite → auto-join on signup (or instant link if the account already exists); uninvited signup → join request the owner approves.
- **projects** ✅ — `id`, `workspace_id`, `team_id`, `name`, `icon` *(belongs to a team)*
- **favorites / recents** ✅ — per-user `(user_id, target_type, target_id)` lists
- **yjs_documents** ✅ — `(doc_type, doc_id)` PK, `workspace_id`, `state` (bytea full snapshot), `seq`. **One unified table** for every collaborative doc (LWW snapshots) — supersedes per-table `yjs_doc` columns below. Phase 1 uses `doc_type='scratchpad'`; pages/whiteboards add `doc_type='page'`/`'whiteboard'`.
- **notes** ✅ — `id`, `workspace_id`, `project_id` (nullable), `title`, `content`, `color`, `pinned`, `archived_at`, `trashed_at`, `created_by` *(status = two nullable timestamps, not booleans)*
- **note_checklist_items** ✅ — `id`, `note_id`, `workspace_id`, `text`, `checked`, `position`
- **labels** ✅ + **note_labels** ✅ (join) — both `workspace_id`-scoped; labels are workspace-wide shared
- **pages** — `id`, `project_id`, `parent_page_id`, `title`, `icon` (Yjs state lives in **yjs_documents**, `doc_type='page'`)
- **databases** ✅ — `id`, `workspace_id`, `project_id`, `name`, `icon`, `sort`, `trashed_at`,
  `created_by` (one per project; Table/Board tabs live in **database_views**, NOT a `view_type` column)
- **database_properties** ✅ — column defs: `type` (title/text/select/multi_select/status/date/person)
  + `options` jsonb (`{id,name,color}` for the select-likes), `sort`
- **database_views** ✅ — saved Table/Board tabs: `type`, `group_property_id` (board grouping), `sort`, `config`
- **database_rows** ✅ — `data` jsonb keyed by property id (cell values) + `sort` (global) +
  `view_order` jsonb (per-view order overrides)
- **whiteboards** — `id`, `project_id`, `title` (Yjs state lives in **yjs_documents**, `doc_type='whiteboard'`)
- **comments** ✅ — `id`, `workspace_id`, `target_type` (page|note), `target_id`, `author_id`, `body`, `mentions` (uuid[]), `parent_id` (nullable, reserved); polymorphic, no FK to the target
- **messages** ✅ — `id`, `workspace_id`, `author_id`, `body`, `parent_message_id` (null = top-level, set = quote-reply; `on delete set null`), `mentions` (uuid[]), `attachments` (jsonb, inline), `edited_at`, `created_at`
- **message_reactions** ✅ — `id`, `workspace_id`, `message_id`, `user_id`, `emoji` (unique on message_id+user_id+emoji)
- **message_reads** ✅ — `(user_id, workspace_id)` PK, `last_read_message_id` (drives the unread badge)
- **activity_log** ✅ — `id`, `workspace_id`, `project_id`, `actor_id`, `action`, `target_type`, `target_id`, `target_title` (snapshot), `created_at`
- **pages.search_text** ✅ — denormalized plain-text mirror of the (Yjs-opaque) page body for `global_search`
- **attachments** ✅ — `id`, `workspace_id`, `url`, `target_type`, `target_id`, `mime_type` (`url` stores the storage object PATH; signed URLs minted on read via `lib/storage.ts`)

---

## 6. Build Phases (in order)

1. **Foundation** — ✅ **COMPLETE & VERIFIED.** Supabase setup, Auth (email + Google), workspace/teams/projects, memberships + roles (owner/editor) with RLS, Yjs ↔ Supabase Realtime sync layer + presence, responsive app shell (sidebar, search placeholder, dark mode), favorites/recents.
2. **Notes module** — ✅ **COMPLETE & VERIFIED.** cards, colors, labels, pin, checklists, image upload, archive/trash, grid/list toggle; workspace-wide board with Postgres-Changes realtime.
3. **Docs + block editor** — ✅ **COMPLETE & VERIFIED.** BlockNote integration, nested pages, slash commands, drag-reorder, mentions/backlinks, trash/restore, page icons, image upload
4. **Databases** — ✅ **COMPLETE & VERIFIED.** Table + Board (Kanban) views, multiple saved
   views, JSONB flexible properties (title/text, status, single/multi-select, date, person→member),
   native-HTML5 drag between board columns, inline embed in Docs pages; Postgres-Changes realtime.
5. **Whiteboard** — ✅ **COMPLETE.** Excalidraw canvas, real-time collab + live cursors,
   embed-in-page, PNG/SVG export (canvas in the Yjs layer `doc_type='whiteboard'`)
6. **Glue & polish** — ✅ **COMPLETE.** Team chat (global channel + quote-replies + reactions +
   @member-mentions + presence + infinite scroll + attachments + edit/delete + unread badge),
   comments on Docs pages + Note cards, per-project activity feed, ⌘K global search (replacing the
   placeholder; full Docs-body search via `pages.search_text`), mobile QA — all on Postgres
   Changes reusing the Phase-5 realtime singleton.
7. **Member profiles & UX polish** — ✅ **COMPLETE.** Editable self-profile (display name, uploaded
   avatar, unique `@handle`); handle-based @-mentions (stable across name changes); inline topbar
   search dropdown (replacing the centered command-palette modal); team/project rename + delete.
   New migration `20260620170000_profiles_handles.sql` + a manual public `avatars` bucket.

---

## 7. Free-Tier Notes & Constraints

- Supabase free projects **pause after ~7 days of zero activity** — daily team use prevents this; one click un-pauses.
- Storage cap **1 GB** (Supabase) — fine for text-heavy work. Switch image/file uploads to **GCS (5 GB free)** if hit.
- Supabase Realtime free tier: **200 concurrent connections** — far above an under-10 team's needs.
- If the team ever grows past ~10 active users or needs more storage, Supabase Pro is ~$25/mo (future concern, not now).

---

## 8. Setup Checklist (for the human, before/while Claude Code builds)

1. Create a **Supabase** account + project (free) — get URL + anon/service keys.
2. Enable **Google OAuth** provider in Supabase Auth (needs a Google Cloud OAuth client).
3. Create a **Vercel** account, connect the GitHub repo for deploy.
4. Storage → New bucket → **`note-attachments`** (private, 5 MB) — *Phase 2*.
5. Storage → New bucket → **`avatars`** (**public**, 5 MB) — member avatar uploads, *Phase 7*.
6. (Optional, later) Create **Google Cloud Storage** bucket only if 1 GB is exceeded.

---

*End of spec. **All seven phases (1–7) are complete** — Kore v1 is feature-complete
(Foundation, Notes, Docs, Databases, Whiteboard, Glue & polish: chat + comments + activity +
⌘K search, and Member profiles & UX polish). Remaining work is UI/UX polish, not new features.
See `CLAUDE.md` for the locked stack, folder structure, RLS convention, and the
two-browser realtime test ritual.*
