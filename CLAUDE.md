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
Yjs↔Realtime sync layer, presence, and the app shell.

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
`request_access`/`my_membership_status`, `requested` status). Never write inline SQL in
chat — add a new timestamped migration file.

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
  (app)/                      authed + member: home, t/[teamId], p/[projectId], members
lib/
  supabase/ client|server|proxy.ts
  dal.ts                      verifySession / requireMember / requireOwner / getPresenceUser
  actions/ auth.ts | workspace.ts        server actions
  yjs/ provider | awareness | snapshot | use-kore-ydoc | encoding
  presence.ts | use-workspace-presence.ts
components/ auth | onboarding | members | shell | collab + theme-provider/-toggle
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
   policies apply. Do NOT enable Postgres-changes replication for `yjs_documents`.
4. Apply the migration: `supabase link --project-ref <ref>` → `supabase db push`.
5. After the first owner signs up, they hit `/setup` once to create the workspace.

## Test ritual: "open two browser windows" (verify realtime before declaring done)

Open the same project in **two browser windows** signed in as two members. Type in the
scratchpad in one → text appears in the other within a beat; each user's **live cursor**
shows in the other; the **who's-online** avatars update; close one tab → its cursor and
avatar disappear. Never call a realtime change done without this two-window check.

## Storage → GCS swap path

Files are referenced by **URL in Postgres** (`attachments.url`), so swapping Supabase
Storage (1 GB free) for Google Cloud Storage (5 GB always-free) is a small change to the
upload/sign helper, not a rebuild. Do NOT use the Google Drive API. See
`docs/adr/0001-storage-supabase-to-gcs.md`.
