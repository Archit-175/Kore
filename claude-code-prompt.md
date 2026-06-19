# Kore — Claude Code Kickoff Prompt

> Paste the section below into Claude Code to start. The full build spec is in `build-spec.md` — keep it in the project root so Claude Code can reference it.

---

## Initial Prompt (paste this)

I'm building **Kore** — a team workspace web app that combines Google Keep (notes), Notion (docs/databases), and Excalidraw (whiteboards), with a global team chat. It's for a small team of under 10 people, must cost $0 to run (free tiers only), is online-only, and must be mobile-responsive.

The complete specification is in `build-spec.md` in the project root. Read it fully before doing anything.

**Tech stack (locked — do not substitute):**
- Next.js + TypeScript, deployed to Vercel
- Supabase for Postgres + Auth (email + Google OAuth) + Realtime
- Tailwind CSS, responsive-first
- BlockNote for the block editor (native Yjs)
- @excalidraw/excalidraw for whiteboards
- Yjs for real-time sync, carried over Supabase Realtime channels
- Supabase Storage for files

**Build order — we work ONE phase per session.** Do not jump ahead.

1. Foundation: Supabase setup, Auth, workspace/projects, memberships + roles (Owner/Editor/Viewer) enforced with Row Level Security, the Yjs ↔ Supabase Realtime sync layer, presence, and the responsive app shell (collapsible sidebar, global search placeholder, dark/light mode).
2. Notes (Keep)
3. Docs + block editor (Notion)
4. Databases (table + board views)
5. Whiteboard (Excalidraw) + embed-in-page
6. Team chat (global channel, threads, reactions), comments, mentions, activity feed, search polish, mobile QA

**For THIS session, do Phase 1 only.**

Start by giving me a concise plan for Phase 1:
- The exact Supabase tables + Row Level Security policies you'll create
- How you'll wire Yjs over Supabase Realtime (the key architectural piece)
- The folder/file structure
- What I need to set up manually (Supabase project, env vars, Google OAuth client)

Do not write code until I approve the plan. Ask me any clarifying questions first.

---

## Per-Phase Prompt Template (reuse for Phases 2–6)

Use this when starting each later phase in a fresh session:

> We're continuing **Kore**. Phase 1 (Foundation) is complete and committed. Read `build-spec.md` for full context, and review the existing codebase structure.
>
> This session: build **Phase [N] — [name]** only. First give me a short plan (files to add/change, any new tables/RLS, how it reuses the existing Yjs/Realtime and presence systems). Wait for my approval before coding. Keep it mobile-responsive and within the free-tier stack.

---

## Working Tips

- **One phase per session** — keeps context clean, avoids hitting limits mid-task.
- **Commit to git after each working phase** — gives you rollback points.
- **Always ask for a plan before code** — review it, then let it build.
- **Model:** Opus 4.8 for Phase 1 + tricky real-time/permission debugging; Sonnet 4.6 for Phases 2–6 feature work.
- **Thinking/effort:** high for planning + Phase 1; medium for routine feature work.
- **Test the real-time piece early** — open two browser windows and confirm live sync + presence before building features on top of it.
