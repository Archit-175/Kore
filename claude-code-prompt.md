# Kore — Claude Code Build Prompts

> Single source of truth for driving the Kore build with Claude Code.
> Keep `build-spec.md` in the project root. Work **one phase per session**.
> Copy the relevant phase block below into Claude Code when you start that phase.

---

## How to use this file

1. Keep `build-spec.md` and this file in the project root.
2. Start each phase in a **fresh session** with `/clear`.
3. Paste that phase's prompt block.
4. Let it ask questions → approve the plan → then it codes.
5. Verify (two-browser realtime test for collab phases), then **commit to git**.

**Models / effort:**
- Opus 4.8 + `high` effort → Phase 1, and any tricky realtime/permission debugging.
- Sonnet 4.6 + `medium` effort → routine feature work in Phases 2–6.

**Skill rule:** the skills change per phase. Phase 1 is mostly backend/architecture,
so it uses backend skills. UI skills (`/impeccable`, `/ui-ux-pro-max`,
`/frontend-design`) come in for the app shell and the feature phases.

**Playwright note:** the realtime verification steps assume the Playwright MCP is
connected in this project. If it isn't, tell Claude Code to skip it and you'll test
the two-browser flow manually.

---

## PHASE 1 — Foundation (paste this)

I'm building **Kore** — a team workspace web app combining Google Keep (notes),
Notion (docs/databases), and Excalidraw (whiteboards), plus a global team chat.
Small team (<10 people), must cost **$0** to run (free tiers only), online-only,
fully mobile-responsive.

The complete specification is in `build-spec.md` in the project root. **Read it fully
before doing anything.**

**Tech stack (locked — do NOT substitute):**
- Next.js + TypeScript, deployed to Vercel
- Supabase: Postgres + Auth (email + Google OAuth) + Realtime
- Tailwind CSS, responsive-first
- BlockNote block editor (native Yjs)
- @excalidraw/excalidraw for whiteboards
- Yjs for realtime sync, carried over Supabase Realtime channels
- Supabase Storage for files

**My setup is done:** Supabase project + keys, Google OAuth client, and Vercel repo
are all ready. I'll paste env values when you ask.

**This session = Phase 1 (Foundation) ONLY. Do not jump ahead.**
Scope: Supabase setup, Auth (email + Google), workspace/projects, memberships + roles
(Owner/Editor/Viewer) enforced with Row Level Security, the **Yjs ↔ Supabase Realtime
sync layer**, presence (live cursors + who's-online), and the responsive app shell
(collapsible sidebar, global search placeholder, dark/light mode).

**Use these skills for this phase:**
- `secure-code-guardian` — RLS policies for Owner/Editor/Viewer (the security core)
- `websocket-engineer` — the Yjs-over-Supabase-Realtime sync layer + presence
- `postgres-pro` — schema design, indexes, JSONB
- `architecture-designer` — sync-layer design + the Supabase→GCS storage swap ADR
- `frontend-design` — only for the app shell (sidebar, dark/light mode) at the end

**Process (follow in order):**

1. **Ask me clarifying questions first** — one at a time. Do NOT produce a plan until
   they're resolved.

2. Then give me a **concise Phase 1 plan** covering:
   - The exact Supabase tables + the RLS policy for each (every table has RLS enabled).
   - **The Yjs persistence model — be explicit:** (a) how Yjs updates are broadcast
     (Realtime `broadcast` channel vs. Postgres changes), (b) how/when the doc is
     persisted to Postgres (`yjs_doc` snapshots — cadence? debounced?), (c) how a
     client loads initial state on join, (d) the awareness/presence protocol. Call out
     the failure modes (missed updates, reconnection, snapshot write conflicts).
   - The folder/file structure.
   - Anything I still need to do manually (env var names, Supabase dashboard settings).

3. **Do not write code until I approve the plan.**

**Deliverables when I approve:**
- Schema + RLS as a real migration file under `supabase/migrations/` (not inline chat SQL).
- A `CLAUDE.md` in the project root documenting: the locked tech stack (no
  substitutions), the one-phase-per-session rule, the folder structure, the
  RLS-on-every-table convention, env var names, the "open two browser windows to verify
  realtime" test ritual, and the Supabase→GCS storage swap path. Keep it concise — it
  loads into every session.
- **Verify the realtime layer before finishing:** using the Playwright MCP (or tell me
  to do it manually), open two browser contexts, edit in one, and confirm the change +
  live cursor appears in the other. Don't declare Phase 1 done until this passes.

---

## PHASE 2 — Notes (Google Keep) (paste this)

We're continuing **Kore**. Phase 1 (Foundation) is complete and committed. Read
`build-spec.md` for full context and `CLAUDE.md` for project conventions, and review the
existing codebase structure.

**This session = Phase 2 (Notes) ONLY.**
Scope (spec §4.2): card-based notes with color options, labels/tags, pin-to-top,
checklists, image attachments (Supabase Storage), archive + trash with restore,
grid/list view toggle. Mobile-responsive throughout.

**Use these skills:**
- `react-expert` — note cards, hooks, view toggle
- `frontend-design` + `ui-ux-pro-max` — Keep-style card grid, colors, responsive layout
- `postgres-pro` — `notes`, `note_checklist_items`, `labels`, `note_labels` tables
- `secure-code-guardian` — RLS on every new table (reuse the role model)

**Process:** Ask clarifying questions first → short plan (files to add/change, new
tables + RLS, how attachments use Supabase Storage, how it reuses the existing app
shell) → wait for my approval → then code. New tables go in a `supabase/migrations/`
file. Keep within the free-tier stack.

---

## PHASE 3 — Docs + Block Editor (Notion) (paste this)

We're continuing **Kore**. Phases 1–2 are complete and committed. Read `build-spec.md`
and `CLAUDE.md`, and review the existing codebase + the Yjs/Realtime sync layer from
Phase 1.

**This session = Phase 3 (Docs) ONLY.**
Scope (spec §4.3): BlockNote editor (text, headings, lists, toggle, callout, code,
divider, quote), nested pages/sub-pages, slash commands, drag-to-reorder, page mentions
+ backlinks. Databases come in Phase 4 — do not build them now.

**Use these skills:**
- `react-expert` — BlockNote integration, page tree UI
- `websocket-engineer` — wire BlockNote's native Yjs into the existing Realtime sync layer
- `typescript-pro` — typing the page/doc + mention models
- `frontend-design` — editor chrome, nested-page sidebar

**Process:** Ask clarifying questions first → short plan (how BlockNote's Yjs binds to
the Phase 1 sync layer, `pages` table changes + RLS, nested-page model, mention/backlink
storage) → wait for approval → then code.

**Verify:** two-browser test — collaborative editing of the same page must sync live
with presence. Run via Playwright MCP if available.

---

## PHASE 4 — Databases (Table + Board) (paste this)

We're continuing **Kore**. Phases 1–3 are complete and committed. Read `build-spec.md`
and `CLAUDE.md`, and review the existing codebase.

**This session = Phase 4 (Databases) ONLY.**
Scope (spec §4.3 databases): Table view and Board (Kanban) view, properties (status,
tags/select, date, person). Mobile-responsive.

**Use these skills:**
- `postgres-pro` — `databases`, `database_rows`, `database_properties` schema + indexes
- `react-expert` — table + drag-and-drop Kanban board
- `ui-ux-pro-max` — Kanban/board UX patterns, responsive table behavior
- `secure-code-guardian` — RLS on the new tables

**Process:** Ask clarifying questions first → short plan (schema for flexible
properties, table↔board view switching, RLS) → wait for approval → then code. New
tables go in a `supabase/migrations/` file.

---

## PHASE 5 — Whiteboard (Excalidraw) (paste this)

We're continuing **Kore**. Phases 1–4 are complete and committed. Read `build-spec.md`
and `CLAUDE.md`, and review the existing codebase + the Yjs/Realtime sync layer.

**This session = Phase 5 (Whiteboard) ONLY.**
Scope (spec §4.4): @excalidraw/excalidraw infinite canvas (shapes, arrows, freehand,
text, sticky notes, connectors), real-time multi-user collaboration, embed a whiteboard
inside a doc page, export to PNG/SVG.

**Use these skills:**
- `react-expert` — Excalidraw component, embed-in-page integration
- `websocket-engineer` — multi-user canvas collab over the existing Realtime sync layer
- `frontend-design` — canvas chrome + embed UX

**Process:** Ask clarifying questions first → short plan (how Excalidraw collab maps to
the existing Yjs/Realtime layer, `whiteboards` table + RLS, embed-in-doc approach,
export) → wait for approval → then code.

**Verify:** two-browser test — simultaneous drawing must sync live. Run via Playwright
MCP if available.

---

## PHASE 6 — Team Chat, Glue & Polish (paste this)

We're continuing **Kore**. Phases 1–5 are complete and committed. Read `build-spec.md`
and `CLAUDE.md`, and review the entire existing codebase.

**This session = Phase 6 (Glue & polish) ONLY** — the final phase.
Scope (spec §4.5 + §4.6): global team chat (one channel, real-time delivery, threads,
emoji reactions, @mentions, presence, infinite-scroll history, image/file attachments,
edit/delete own messages, unread indicator); comments + @mentions on pages and note
cards; per-project activity feed; global search refinement; full mobile QA.

**Use these skills:**
- `websocket-engineer` — chat realtime delivery, threads, reactions, unread state
- `frontend-design` + `impeccable` — chat UI, polish pass across the whole app
- `test-master` + `playwright-expert` — E2E tests for the multi-user collab flows
- `security-reviewer` — final audit of all RLS policies and auth before launch
- `code-reviewer` — review the full diff for this phase

**Process:** Ask clarifying questions first → short plan (chat tables `messages`,
`message_reactions`, `message_reads` + RLS, reuse of the mention + presence systems,
activity-log writes, search approach) → wait for approval → then code.

**Before declaring done:**
- Run `security-reviewer` over every RLS policy in the app.
- Run `code-reviewer` over the diff.
- Run the Playwright E2E suite for multi-user chat + collab.
- Do a mobile-responsive QA pass on all six modules.

---

## Per-session checklist (every phase)

- [ ] Fresh session / `/clear`
- [ ] Pasted the correct phase block
- [ ] Answered its clarifying questions
- [ ] Reviewed and approved the plan before any code
- [ ] New tables delivered as `supabase/migrations/` files with RLS enabled
- [ ] Realtime verified with two browser windows (collab phases)
- [ ] `git commit` after the phase works (rollback point)
