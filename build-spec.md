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
| Roles | **Owner / Editor / Viewer** | Simple permission model |

---

## 3. Tech Stack (Locked)

- **Framework / Hosting:** Next.js + TypeScript → Vercel (Hobby, free)
- **Database + Auth + Realtime:** Supabase (free tier)
  - Postgres (500 MB)
  - Supabase Auth (email/password + Google OAuth)
  - Supabase Realtime (used as the Yjs transport)
- **Styling:** Tailwind CSS (responsive-first)
- **Block editor:** BlockNote (open source, native Yjs support)
- **Whiteboard:** `@excalidraw/excalidraw` (open source, native collaboration)
- **Real-time sync:** Yjs (CRDT) carried over Supabase Realtime channels
- **File storage:** Supabase Storage (1 GB free)
  - **Documented upgrade path:** Google Cloud Storage (5 GB always-free) if 1 GB cap is hit. Files are referenced by URL in Postgres, so swapping the storage backend is a small change, not a rebuild. Do NOT use Google Drive API for app storage.

---

## 4. Feature Set (v1 Scope)

### 4.1 Foundation (build first)
- Supabase Auth: email/password + Google OAuth
- One workspace containing multiple **projects**
- Invite members by email
- 3 roles: **Owner, Editor, Viewer** (enforced via Postgres Row Level Security)
- Yjs sync layer wired over Supabase Realtime
- Presence: live cursors + "who's online" indicators
- App shell: unified collapsible sidebar (mobile-friendly), global search, dark/light mode
- Favorites and recents

### 4.2 Notes (Google Keep)
- Card-based notes with color options
- Labels / tags
- Pin to top
- Checklists (to-do items)
- Image attachments (Supabase Storage)
- Archive and Trash (with restore)
- Grid / list view toggle (responsive on mobile)

### 4.3 Docs (Notion)
- BlockNote block editor: text, headings, bulleted/numbered lists, toggle, callout, code, divider, quote
- Nested pages / sub-pages
- Slash (`/`) commands
- Drag-to-reorder blocks
- **Databases** with **Table** and **Board (Kanban)** views
- Database properties: status, tags/select, date, person
- Page mentions and backlinks

### 4.4 Whiteboard (Excalidraw)
- Infinite canvas: shapes, arrows, freehand, text, sticky notes, connectors
- Real-time collaboration (multi-user editing)
- Embed a whiteboard inside a doc page
- Export to PNG / SVG

### 4.5 Team Chat
- **One global team channel** (workspace-wide, all members)
- Real-time message delivery via Supabase Realtime
- **Threads** (reply to a message to start a thread)
- **Emoji reactions** on messages
- `@mentions` (reuse the mention system from comments)
- Online presence (reuse "who's online")
- Message history with infinite scroll
- Image/file attachments (Supabase Storage)
- Edit / delete own messages
- Unread indicator for the channel

### 4.6 Collaboration Glue
- Comments + `@mentions` on pages and note cards
- Activity feed per project (change history)

---

## 5. Suggested Data Model (Postgres / Supabase)

> Starting point — Claude Code may refine. Enable Row Level Security on all tables.

- **users** — handled by Supabase Auth
- **workspaces** — `id`, `name`, `owner_id`
- **memberships** — `user_id`, `workspace_id`, `role` (owner/editor/viewer)
- **projects** — `id`, `workspace_id`, `name`, `icon`
- **notes** — `id`, `project_id`, `color`, `pinned`, `archived`, `trashed`, `content`, `created_by`
- **note_checklist_items** — `id`, `note_id`, `text`, `checked`, `position`
- **labels** + **note_labels** (join)
- **pages** — `id`, `project_id`, `parent_page_id`, `title`, `icon`, `yjs_doc` (binary/text)
- **databases** — `id`, `project_id`, `name`, `view_type`
- **database_rows** + **database_properties**
- **whiteboards** — `id`, `project_id`, `title`, `yjs_doc`
- **comments** — `id`, `target_type`, `target_id`, `author_id`, `body`, `parent_id`
- **messages** — `id`, `workspace_id`, `author_id`, `body`, `parent_message_id` (null = top-level, set = thread reply), `edited_at`, `created_at`
- **message_reactions** — `id`, `message_id`, `user_id`, `emoji`
- **message_reads** — `user_id`, `last_read_message_id` (for unread indicator)
- **activity_log** — `id`, `project_id`, `actor_id`, `action`, `target`, `created_at`
- **attachments** — `id`, `url`, `target_type`, `target_id` (URL points to Supabase Storage or GCS)

---

## 6. Build Phases (in order)

1. **Foundation** — Supabase project setup, Auth (email + Google), workspace/projects, memberships + roles with RLS, Yjs ↔ Supabase Realtime sync layer, responsive app shell (sidebar, search, dark mode)
2. **Notes module** — cards, colors, labels, pin, checklists, image upload, archive/trash, grid/list toggle
3. **Docs + block editor** — BlockNote integration, nested pages, slash commands, drag-reorder, mentions/backlinks
4. **Databases** — table view, board (kanban) view, properties
5. **Whiteboard** — Excalidraw canvas, real-time collab, embed-in-page, export
6. **Glue & polish** — comments + mentions, team chat (global channel + threads + reactions), activity feed, global search refinement, mobile QA

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
4. (Optional, later) Create **Google Cloud Storage** bucket only if 1 GB is exceeded.

---

*End of spec. Edit any section above, then hand to Claude Code to begin Phase 1.*
