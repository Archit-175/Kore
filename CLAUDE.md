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
archive/trash, grid/list). **Next = Phase 3 (Docs + BlockNote).**

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
`storage.objects` policies for `note-attachments`). Never write inline SQL in chat — add a
new timestamped migration file. **New tables created in a later migration need an explicit
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

## Folder structure

```
proxy.ts                      root: @supabase/ssr session refresh + optimistic redirects
app/
  login | signup              public auth pages
  auth/callback/route.ts      OAuth / email-confirmation code exchange
  (onboarding)/               authed but no membership: setup, request-access
  (app)/                      authed + member: home, t/[teamId], p/[projectId], members, notes
lib/
  supabase/ client|server|proxy.ts
  dal.ts                      verifySession / requireMember / requireOwner / getPresenceUser
  actions/ auth.ts | workspace.ts | notes.ts     server actions
  yjs/ provider | awareness | snapshot | use-kore-ydoc | encoding
  notes/ colors | types | load-board     notes board data + palette + aggregate types
  storage.ts                  uploadFile / getSignedUrl(s) / deleteFile (ADR 0001 seam)
  presence.ts | use-workspace-presence.ts
components/ auth | onboarding | members | shell | collab | notes + theme-provider/-toggle
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
