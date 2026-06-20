# Kore

A **$0-budget, online-only team workspace** for a single team of under 10 people — Google
Keep + Notion + Excalidraw + team chat under shared projects, in one mobile-responsive app.

> v1 is **feature-complete** (all six build phases shipped). See [`build-spec.md`](build-spec.md)
> for the spec and [`CLAUDE.md`](CLAUDE.md) for the architecture guide, conventions, and gotchas.

## Modules

- **Notes** — Google Keep-style board: colors, labels, pin, checklists, image attachments, archive/trash, grid/list.
- **Docs** — per-project nested BlockNote pages: slash commands, drag-reorder, callout/toggle/divider, `@`-mentions + backlinks, page icons, image upload, trash/restore.
- **Databases** — per-project Table + Board (Kanban) views, multiple saved views, flexible JSONB properties (title/text, status, single/multi-select, date, person→member), plus an inline embed in Docs.
- **Whiteboards** — per-project Excalidraw canvas with real-time multi-user collab + live cursors, an inline embed in Docs, and PNG/SVG export.
- **Team chat** — one workspace channel: WhatsApp-style quote-replies, emoji reactions, `@member`-mentions, presence, infinite scroll, attachments, edit/delete, unread badge.
- **Glue** — comments on pages + note cards, a per-project activity feed, and a ⌘K global search across every module.

## Stack (locked)

- **Next.js 16** + TypeScript (App Router, Turbopack) → Vercel (Hobby, free).
  ⚠️ Next 16 differs from older versions: `middleware.ts` → **`proxy.ts`**; `params`/`searchParams` are Promises.
- **Supabase** (free tier): Postgres + Auth (email/password + Google) + Realtime + Storage.
- **Tailwind CSS v4**, **BlockNote** (docs), **@excalidraw/excalidraw** (whiteboards), **Yjs** (CRDT) over Supabase Realtime.
- Real-time model: collaborative doc bodies use **Yjs over Realtime broadcast**; structured data (notes, databases, chat, comments, activity) uses **Supabase Postgres Changes**.

## Getting started

1. Create a Supabase project (free) and a Vercel project; set the env vars below in `.env.local` (and Vercel):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the publishable `sb_publishable_…` key)
   - `SUPABASE_SERVICE_ROLE_KEY` (the secret `sb_secret_…` key — server-only, never `NEXT_PUBLIC_`)
2. One-time Supabase dashboard setup (Auth providers + redirect URLs, enable **Realtime Authorization**, create the private **`note-attachments`** Storage bucket). See [`CLAUDE.md`](CLAUDE.md) → *Supabase dashboard setup*.
3. Apply migrations and generate types:
   ```bash
   supabase link --project-ref <ref>
   supabase db push
   supabase gen types typescript --linked > types/database.ts
   ```
4. Run the dev server:
   ```bash
   npm install
   npm run dev      # http://localhost:3000
   ```
   The first owner signs up, then visits `/setup` once to create the workspace.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Next.js dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run test:e2e` | Playwright E2E (auth-gate smoke; auto-starts the dev server) |

## Testing

- **Playwright** covers single-user / auth-gate happy paths (`npm run test:e2e`).
- **Realtime is verified manually** by the *two-window ritual*: open the same workspace in two
  browser windows as two members and confirm edits, cursors, presence, chat, and comments sync
  live. Never call a realtime change done without it. (See [`CLAUDE.md`](CLAUDE.md).)

## Project docs

- [`build-spec.md`](build-spec.md) — the v1 spec and build phases.
- [`CLAUDE.md`](CLAUDE.md) — architecture, RLS/migration conventions, the Yjs↔Realtime model, and per-phase decisions.
- [`docs/adr/`](docs/adr) — architecture decision records (e.g. Supabase Storage → GCS swap path).
