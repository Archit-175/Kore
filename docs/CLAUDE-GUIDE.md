# Kore — Claude Operating Guide

A reference for an AI assistant (Claude) helping a user **use the Kore web application** —
navigating the UI, performing tasks, and answering "how do I…" questions. This is about
operating the app in the browser, not about its code.

---

## What Kore is

A $0-budget, online-only, real-time team workspace for one team of <10 people. Six modules:
**Notes, Docs, Databases, Whiteboards, Chat**, plus **Comments / Activity / Search** glue.
Built on Next.js 16 + Supabase (Postgres, Auth, Realtime) + Tailwind v4.

**Mental model to give users:** there are no visibility walls. Every active member reads and
edits everything. "Teams" only *organize* projects; team membership grants delete-power over
that team's projects, not secrecy.

---

## Route map (what lives where)

| Route | What it is |
|---|---|
| `/login`, `/signup` | Auth (email/password + Google) |
| `/setup` | First owner creates the workspace (one-time) |
| `/request-access` | Uninvited users ask to join |
| `/` | Home: teams→projects grid + pinned notes strip |
| `/members` | Owner approves join requests, invites emails |
| `/t/[teamId]` | Team page: team icon + roster manager (owner) |
| `/notes` | Workspace-wide Keep-style note board |
| `/chat` | One workspace-wide chat channel |
| `/p/[projectId]` | Project Docs home: page tree, DB/WB lists, activity, trash |
| `/p/[projectId]/[pageId]` | BlockNote page editor (live-collab) |
| `/p/[projectId]/db/[databaseId]` | Database — Table/Board views |
| `/p/[projectId]/wb/[whiteboardId]` | Whiteboard — Excalidraw canvas |

**Global search:** ⌘K (Mac) / Ctrl-K focuses the topbar search input → searches notes, page
titles+bodies, database names+rows, whiteboard titles, and chat messages.

---

## Capability map (answer "can I…?" fast)

| User wants to… | Where / how |
|---|---|
| Quick capture, lists, reminders | **Notes** (`/notes`) — color, label, pin, checklist, image |
| Long-form doc, wiki, spec | **Docs page** under a project — slash commands, nesting, `@`-links |
| Track tasks / structured records | **Database** — Table + Board (Kanban), drag cards between columns |
| Diagram / sketch / brainstorm | **Whiteboard** — Excalidraw, export PNG/SVG |
| Message the team | **Chat** (`/chat`) — replies, reactions, @-mentions, files |
| Discuss a specific page/note | **Comments** panel (page) / inline (note) |
| See recent project changes | **Activity feed** on the project Docs home |
| Find anything | **⌘K** global search |
| Link one page to another | Type `@` in a page → backlinks auto-tracked |
| Embed a DB or whiteboard in a doc | In a page, insert the database/whiteboard embed block |

---

## Module deep-dive (the detail behind the capability map)

### Notes (`/notes`)
Workspace-wide Keep-style board. Each note: **title + body**, a **card color**, shared
**labels**, **pin** (floats to top + shows on Home), optional **checklist** items, **image**
attachments, and inline **comments**. A note may optionally be filed under a project, or stay
workspace-wide. **Grid/list** toggle. Archive and trash are reversible; permanent delete and
empty-trash are **owner-only**. The on-board search box is a local filter (not ⌘K).

### Docs pages (`/p/[projectId]/[pageId]`)
Live-collaborative block editor (BlockNote). Build a **nested tree** of pages; **drag to
reorder/re-nest**. Type **`/`** for blocks (headings, lists, quote, callout, divider, toggle,
code, image/file). Type **`@`** to link another page → the target shows a **Backlinks** panel;
links survive renames. Each page has an **emoji icon**, a **comments** panel, and can hold
**embeds** of databases and whiteboards. Trashing a page also trashes its subtree (reversible).

### Databases (`/p/[projectId]/db/[databaseId]`)
Per-project structured data (Notion/Airtable-style). One database holds **rows** and a set of
**properties (columns)**, and can have **multiple saved views**. Also embeddable inside a Docs
page (stays in sync with the standalone database).

**Views**
- **Table view** — spreadsheet grid; edit cells inline; sticky header + frozen title column.
- **Board (Kanban) view** — columns derived from one **status** or **select** property
  (plus a leading "No <property>" column for blank cells). **Drag cards between columns** to
  change that property's value; drag within a column to reorder. Each view remembers its own
  card order.
- A database can have several Table and Board views side by side; a board view picks which
  property it groups by.

**Property (column) types** — every column has one of these types:

| Type | What it stores / how it behaves |
|---|---|
| **Title** | The row's primary name (the first column; identifies the row) |
| **Text** | Free-form plain text |
| **Status** | Single choice from colored options; the typical **Board** grouping column |
| **Select** (single-select) | One colored option from a defined list |
| **Multi-select** | Zero or more colored options (chips) |
| **Date** | A calendar date |
| **Person** | One or more **workspace members** assigned to the row |

- **Status / Select / Multi-select** options each have a **name and color**; you define the
  option list per property and can add/rename/recolor options.
- **Person** cells resolve to real member profiles (avatar + name).
- Adding, renaming, retyping, or deleting a column is a per-database edit; deleting a column
  cleans up its values.

**Permissions:** any member can create rows/columns/views and edit cells, and can **trash**
a whole database (reversible). **Permanent delete + empty-trash** of a database are **owner or
project-team-member** only.

### Whiteboards (`/p/[projectId]/wb/[whiteboardId]`)
Per-project Excalidraw infinite canvas, live-collaborative with **cursors**. Shapes, arrows,
freehand, text, sticky notes, connectors, and images. **Export PNG/SVG**. Embeddable in a
Docs page. Trash reversible; permanent delete is owner or project-team only.

### Chat (`/chat`)
One workspace-wide channel. Messages with **@-mentions**, inline **quote-replies**, emoji
**reactions**, **attachments**, edit/delete your own (owner can delete anyone's). **Unread
badge** in the sidebar; **infinite scroll-up** for history; **presence**.

### Comments & Activity
**Comments** on Docs pages (side panel) and Note cards (inline), with @-mentions. **Activity
feed** on each project's Docs home logs create/rename/trash/restore/delete events.

---

## Roles & permissions (so you advise correctly)

- **Owner** (one): manages members, renames/deletes teams, can delete anyone's messages,
  permanent-delete + empty-trash on everything, manages team rosters & team icons.
- **Editor** (everyone else): full create/edit on all content; trash/restore is reversible
  and open to any member; rename projects; set project icons.
- **Team membership** grants owner-like power over **that team's projects** (permanent delete,
  empty-trash, delete project) — *not* read/write walls, *not* team-entity control.
- **Notes board** permanent-delete / empty-trash is **owner-only** (it's workspace-wide, not
  team-scoped).

When a user asks "why can't I permanently delete X?" → likely they're an Editor not on the
relevant team, or it's a note (owner-only). Trashing is always allowed.

---

## How members get in

1. Owner pre-invites an email → that person auto-joins as Editor on matching signup
   (status: `pending` → `active`).
2. Uninvited signup → **join request** (`requested`) the owner approves on `/members`.
3. An existing account can hit **Request access**.
4. Inviting an email that already has an account links it immediately.

No emails are sent ($0 constraint) — the owner approves in-app.

---

## Real-time behavior to set expectations

- Edits, presence (who's-online avatars), and live cursors update **without refresh**.
- Docs pages and Whiteboards are **CRDT-collaborative** (concurrent editing is safe, last
  state merges cleanly).
- Notes, Databases, Chat, Comments, Activity sync via Postgres changes (also live, near-instant).
- If a user reports "changes not showing," first suggest a reload; realtime can drop on flaky
  networks. (For developers, connection-pool limits are documented in `CLAUDE.md`.)

---

## Common task walkthroughs

**Create a project page:** open the project (`/p/[projectId]`) → add a page in the outline →
type `/` for blocks → `@` to link other pages → comments panel on the right to discuss.

**Set up a task board:** create a Database in the project → add a **status** property → open
the **Board** view → drag cards between status columns.

**Pin a note to Home:** open the note → toggle **pin**. Pinned notes appear on `/` and float
to the top of `/notes`.

**Mention a teammate:** type `@` in chat, a comment, or a mention-enabled field → pick the
person. It stores their `@handle`, so it survives name changes; the chip displays their name.

**Change your handle/avatar:** avatar menu → **Edit profile**. Handle is unique, lowercase,
`^[a-z0-9_]{3,20}$`.

**Rename/delete a team or project:** hover it in the sidebar → **⋯ menu**. (Rename project =
any member; delete project = owner or team member; team rename/delete = owner.)

---

## Guardrails for an assistant operating Kore

- **Trashing is reversible; permanent delete is not.** Before suggesting an empty-trash or a
  permanent delete, confirm the user means it and has the right role.
- **No private channels.** Don't tell a user content can be hidden from teammates — it can't.
- **Don't invent features.** Kore has exactly the six modules above. There is no email,
  calendar, video, or external integration. All v1 features are shipped; remaining work is
  UI/UX polish only.
- **Search before "it doesn't exist."** If a user can't find something, suggest ⌘K — content
  is workspace-wide and almost always reachable.
- **Mobile:** everything is responsive; side panels become drawers below `md:`.

---

## Quick keyboard / shortcut reference

| Action | How |
|---|---|
| Open/focus global search | **⌘K** (Mac) / **Ctrl-K** |
| Insert a block in a doc | Type **`/`** in the page editor |
| Link another page | Type **`@`** in the page editor |
| Mention a teammate | Type **`@`** in chat, comments, or mention fields |
| Toggle light/dark | Theme toggle in the topbar |
| Reorder pages / DB cards | **Drag and drop** |

---

## Answering usage questions well

- Confirm role before suggesting destructive actions (permanent delete / empty trash) — only
  the owner, or members of the relevant team, can do them; notes are owner-only.
- When a feature genuinely isn't in Kore (email, calendar, video, external integrations),
  say so plainly rather than improvising a workaround that doesn't exist.
- Default to the reversible path: archive/trash instead of permanent delete.
- If a user is "lost," point them to **Home** (`/`), the **sidebar**, and **⌘K** search —
  everything is reachable from those three.
