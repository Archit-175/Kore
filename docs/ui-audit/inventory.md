# Kore — Complete UI/UX Inventory & Redesign Map

> Survey only — no application code was changed. This is the pre-redesign inventory of the
> current UI. Captured against workspace "Sampark" populated with sample content (team
> **Product** ⭐, project **Mobile App** 🚀, 2 docs pages incl. a nested sub-page, a 4-row
> database with Table + Board views, a whiteboard, 3 colored notes incl. a pinned checklist;
> chat & members already had data), signed in as the workspace **owner**.
>
> Screenshots are indexed in [README.md](./README.md); the `#N` references below map to that index.

---

## 1. Routes / Pages

Three route groups under `app/`: public auth, `(onboarding)` (authed, no membership), and
`(app)` (authed member, wrapped in `AppShell`).

### Public / auth

| Route | File | Top component | Purpose | Shot |
|---|---|---|---|---|
| `/login` | `app/login/page.tsx:4` | `AuthForm` mode=login — `components/auth/auth-form.tsx:16` | Email/password + Google login | — (redirects when authed) |
| `/signup` | `app/signup/page.tsx:4` | `AuthForm` mode=signup | Sign up | — |
| `/auth/callback` | `app/auth/callback/route.ts:6` | GET handler | OAuth / email-confirm code exchange | n/a |

### `(onboarding)` — centered modal layout (`app/(onboarding)/layout.tsx:5`, guard `verifySession()`)

| Route | File | Top component | Purpose |
|---|---|---|---|
| `/setup` | `app/(onboarding)/setup/page.tsx:5` | `SetupForm` — `components/onboarding/setup-form.tsx:6` | First-owner workspace bootstrap (runs once) |
| `/request-access` | `app/(onboarding)/request-access/page.tsx:7` | request UI + `SignOutButton` | Uninvited user asks owner for access |

### `(app)` — main shell (`app/(app)/layout.tsx:7` → `AppShell`, guard `requireMember()`)

The layout loads sidebar data (teams, projects, favorites, recents, chat-unread,
`getTeamMemberships()`) and `getPresenceUser()`.

| Route | File | Top component | Purpose | Shot |
|---|---|---|---|---|
| `/` | `app/(app)/page.tsx:31` | inline `HomePage` + `ProjectCard` | Dashboard: KORE watermark, teams→projects grid, pinned-notes strip | #1, #19, #23 |
| `/notes` | `app/(app)/notes/page.tsx:6` | `NotesBoard` — `components/notes/notes-board.tsx:32` | Workspace Keep-style board (`loadBoard`) | #2, #14–16 |
| `/chat` | `app/(app)/chat/page.tsx:7` | `ChatView` — `components/chat/chat-view.tsx:29` | Workspace team chat (`loadChatMessages`, `loadWorkspaceMembers`) | #3 |
| `/members` | `app/(app)/members/page.tsx:16` | `InviteForm` + `RequestActions` + `RemoveMemberButton` | Owner-only member mgmt (`requireOwner()`) | #4 |
| `/t/[teamId]` | `app/(app)/t/[teamId]/page.tsx:11` | `TeamMembers` + `EntityIcon` + `EntitySettingsMenu` | Team profile, roster, projects | #17 |
| `/p/[projectId]` | `app/(app)/p/[projectId]/page.tsx:7` | `ProjectDocsHome` — `components/docs/project-docs-home.tsx:47` | Project home: page tree, DBs, WBs, trash, activity | #6, #18 |
| `/p/[projectId]/[pageId]` | `app/(app)/p/[projectId]/[pageId]/page.tsx:7` | `PageDocView` — `components/docs/page-doc-view.tsx:38` | BlockNote doc editor (Yjs, backlinks, comments) | #8, #9, #10 |
| `/p/[projectId]/db/[databaseId]` | `app/(app)/p/[projectId]/db/[databaseId]/page.tsx:8` | `DatabaseView` — `components/databases/database-view.tsx:29` | Table + Board views (`loadDatabase`) | #11, #12 |
| `/p/[projectId]/wb/[whiteboardId]` | `app/(app)/p/[projectId]/wb/[whiteboardId]/page.tsx:7` | `WhiteboardView` — `components/whiteboards/whiteboard-view.tsx:46` | Excalidraw canvas (Yjs) | #13 |

---

## 2. Components per page

### Shared shell (every `(app)` route) — `components/shell/`
- `AppShell` `app-shell.tsx:8` — sidebar + topbar + content; collapse state in localStorage
- `Sidebar` `sidebar.tsx:34` — workspace badge, Notes/Chat nav, teams, per-project trees, favorites/recents, chat badge; hosts `EntitySettingsMenu` on hover
- `Topbar` `topbar.tsx:10` — menu/collapse toggles, `GlobalSearch`, `OnlineAvatars`, `ThemeToggle`, `AvatarMenu`
- `GlobalSearch` `global-search.tsx:45` — inline ⌘K input + grouped dropdown (#20)
- `AvatarMenu` `avatar-menu.tsx:9` → `ProfileModal` `profile-modal.tsx:16` (#21, #22)
- `EntitySettingsMenu` `entity-settings-menu.tsx:11` — ⋯ rename/delete (teams & projects)
- `EntityIcon` `entity-icon.tsx:11` → `IconPicker` (#7)
- `ChatUnreadBadge` `chat-unread-badge.tsx:15`, `OnlineAvatars` `online-avatars.tsx:5`
- `ProjectPagesTree` `project-pages-tree.tsx:34`, `ProjectDatabasesTree` `project-databases-tree.tsx:18`, `ProjectWhiteboardsTree` `project-whiteboards-tree.tsx:19`, `InlineCreate` `inline-create.tsx:8` (#5)

### Per-page composition
- **Home `/`** — inline render + `ProjectCard`; reuses note color classes for pinned strip; `.kore-watermark`.
- **`/notes`** — `NotesBoard` → `NoteComposer` `note-composer.tsx:18`, `NoteCard` `note-card.tsx:45` (#15), `NoteEditorModal` `note-editor-modal.tsx:21` (#16), `ChecklistEditor`, `ImageUploader`, `ColorPicker`, `LabelPicker`/`LabelManager`, `ViewToggle`, `icons.tsx`, and `CommentsPanel` (inline) inside the modal.
- **`/chat`** — `ChatView` → `ChatTimeline` `chat-timeline.tsx:16`, `MessageRow` `message-row.tsx:55`, `MessageComposer` `message-composer.tsx:10`; uses `MentionTextarea` + `OnlineAvatars`.
- **`/members`** — `InviteForm`, `RequestActions` `member-actions.tsx:10`, `RemoveMemberButton` `member-actions.tsx:44`; inline status badges.
- **`/t/[teamId]`** — `TeamMembers` `teams/team-members.tsx:28` + `EntityIcon` + `EntitySettingsMenu` + `ProjectCard`.
- **`/p/[projectId]`** — `ProjectDocsHome` → `ProjectDatabasesSection` `databases/project-databases-section.tsx:21`, `ProjectWhiteboardsSection` `whiteboards/project-whiteboards-section.tsx:22`, `ActivitySection` `activity/activity-section.tsx:22`, `IconPicker`, `EntitySettingsMenu`.
- **`/p/[projectId]/[pageId]`** — `PageDocView` → `PageEditor` `page-editor.tsx:41` (BlockNote; custom `Callout`, `databaseEmbed`, `whiteboardEmbed` blocks via `schema.tsx`), `MentionChip`, `Backlinks` `backlinks.tsx:15`, `CommentsPanel`, `OnlineAvatars`, `IconPicker`.
- **`/p/[projectId]/db/[databaseId]`** — `DatabaseView` → `ViewTabStrip` `view-tab-strip.tsx:16`, `TableView` `table-view.tsx:24`, `BoardView`, `Cell` `cells.tsx:42`, `PropertyControls`, `RowDetailModal` `row-detail-modal.tsx:16`; shared `Popover`/`OptionChip`/`MemberAvatar` from `databases/shared.tsx`.
- **`/p/[projectId]/wb/[whiteboardId]`** — `WhiteboardView` → `WhiteboardCanvas` (Excalidraw↔Yjs binding), export, `OnlineAvatars`, `IconPicker`.

### Truly shared (cross-page) primitives-as-components
`Sidebar`, `Topbar`, `GlobalSearch`, `EntitySettingsMenu`, `EntityIcon`, `IconPicker`
(`docs/icon-picker.tsx:19`), `Spinner` (`components/spinner.tsx:4`), `CommentsPanel`
(`comments/comments-panel.tsx:27`), `MentionTextarea` (`mentions/mention-textarea.tsx:30`)
+ `mention-utils.tsx`, `OnlineAvatars`, `Popover`/`OptionChip`/`MemberAvatar`, `ColorPicker`,
`ThemeProvider`/`ThemeToggle`.

---

## 3. UI elements / patterns (current styling)

| Pattern | Current variants & representative classes | Evidence |
|---|---|---|
| **Buttons** | *Primary*: `bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60`. *Secondary*: `border border-border px-3 py-1.5 hover:bg-black/5 dark:hover:bg-white/5`. *Ghost*: `text-neutral-500 hover:text-neutral-700`. *Icon*: `h-8 w-8 rounded-md/full hover:bg-black/5`. *Destructive*: `text-red-600 hover:bg-red-500/10`. **No shared `<Button>`** — each hand-rolled. | `profile-modal.tsx:213`, `google-button.tsx:27`, `theme-toggle.tsx:15` |
| **Inputs / textareas** | `rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-indigo-400/500`; borderless inline variants `bg-transparent outline-none`. Focus shade & placeholder shade inconsistent. | `profile-modal.tsx:173`, `cells.tsx:124` |
| **Dropdowns / popovers / menus** | Portal+viewport-clamped `Popover`; dropdown panels `absolute … w-56 rounded-lg border border-border bg-background/surface p-1 shadow-lg`; items `w-full px-3 py-2 text-left hover:bg-black/5`. z-index varies `z-20/50/[60]`. | `databases/shared.tsx:26`, `avatar-menu.tsx:50` |
| **Modals / drawers** | `fixed inset-0 z-50/[70] bg-black/40 p-4` + panel `rounded-xl border border-border bg-background p-5 shadow-xl/2xl`; mobile = full-screen, `sm:rounded-xl`. | `row-detail-modal.tsx:42`, `note-editor-modal.tsx:92` |
| **Cards** | Notes: `rounded-lg border p-3 shadow-sm hover:shadow-md` + `NOTE_COLOR_CLASSES`; Board cards: `rounded-lg border border-border bg-surface p-2 shadow-sm`. | `note-card.tsx:79`, `board-view.tsx:320` |
| **List/table rows** | `group hover:bg-surface/60`; sticky title col `z-40` / header `z-30`; cell padding mixes `px-1/2/3`. | `table-view.tsx:55` |
| **Badges / chips** | Status/select: `OptionChip` `rounded px-1.5 py-0.5 text-xs` + color map; note labels `rounded-full px-2 py-0.5 text-[11px]`; role badges (`Owner`/`Editor`/`Active`) inline. Mixed `rounded` vs `rounded-full`. | `databases/shared.tsx:132`, members page |
| **Avatars** | `rounded-full` initials w/ per-user bg color, or `<img object-cover>`; sizes ad-hoc `h-7/8/16`. | `message-row.tsx:40`, `databases/shared.tsx:154` |
| **Empty states** | Text-only `py-4/8 text-center text-xs/sm text-neutral-400` ("No notes yet…", "No comments yet…"). Dashed bordered panels on home/project-home. No illustration/CTA-button pattern. | `chat-timeline.tsx:127`, project home #6 |
| **Loading / spinner** | `Spinner` SVG `animate-spin` inheriting `currentColor`; "Saving…/Connecting…/Live" text pills; **no skeletons**. | `spinner.tsx:13`, page editor "Connecting…/Live" |
| **Toasts / errors** | **No toast system.** Errors are inline `text-xs/sm text-red-500/600`, shades vary. | `profile-modal.tsx:199` |
| **Tabs** | DB views: `border-b-2 px-2.5 py-2` active `border-indigo-500 text-indigo-600`; Notes tabs (Notes/Archive/Trash) pill-style; Notes grid/list `ViewToggle` segmented. | `view-tab-strip.tsx:39`, `view-toggle.tsx:20` |
| **Nav / sidebar tree** | Section labels uppercase `text-xs`; active item `bg-indigo` tint; hover reveals `+`/`⋯`; native-HTML5 drag reorder. | `sidebar.tsx`, #5 |

---

## 4. Design tokens

**File:** `app/globals.css` (Tailwind v4: `@import "tailwindcss"` + `@custom-variant dark` +
`@theme inline`). Fonts: Geist Sans/Mono via `next/font` in `app/layout.tsx` →
`--font-geist-sans`/`--font-geist-mono`.

| Token | Light (`:root`) | Dark (`.dark`) |
|---|---|---|
| `--background` | `#ffffff` | `#0a0a0b` |
| `--foreground` | `#171717` | `#ededed` |
| `--surface` | `#f7f7f8` | `#141416` |
| `--border` | `rgba(0,0,0,.08)` | `rgba(255,255,255,.1)` |
| `--kore-stroke` | `rgba(0,0,0,.08)` | `rgba(255,255,255,.13)` |

- **Theme:** manual `.dark` class on `<html>` via custom `ThemeProvider`
  (`components/theme-provider.tsx:28`, `localStorage 'kore-theme'`, pre-paint inline script)
  — **not** `next-themes`, not `prefers-color-scheme`.
- **`@theme inline`** exposes only `--color-background/foreground/surface/border` + the two
  fonts to Tailwind. **Everything else (radius, shadow, spacing, z-index, accent indigo,
  status colors) is NOT tokenized.**
- **Custom utilities:** `.kore-db-table` (sticky DB table), `.kore-wb-canvas`/`.kore-wb-embed`
  (Excalidraw box), `.kore-watermark` (`-webkit-text-stroke`, `clamp(8rem,28vw,22rem)`),
  `.kore-msg-flash` (chat reply highlight).
- **BlockNote tokens:** `components/docs/blocknote-theme.css` maps `--bn-*` to Kore tokens
  **but hardcodes** `#6366f1`, `#ffffff`, `#9ca3af` and `--bn-border-radius: 0.5rem`.

**Where styling is ad-hoc / inconsistent (token gaps):**
- **Border-radius**: `rounded` / `-md` / `-lg` / `-xl` / `-full` all used for the same role
  (modals `xl` vs `lg`, cards `lg` vs `md`).
- **z-index**: unmanaged ladder `z-20/30/40/50/[60]/[70]`.
- **Shadow**: `shadow-sm/lg/xl/2xl` with no semantic scale.
- **Spacing**: button padding `px-2 py-1` vs `px-3 py-1.5` vs `px-4`; modal `p-4` vs `p-5`.
- **Accent color**: indigo-500/600 hardcoded everywhere (no `--accent` token); status/note
  colors in JS maps (`lib/notes/colors.ts`, `lib/databases/colors.ts`).
- **Overlays**: `bg-black/5`, `bg-white/10`, `bg-indigo-500/10` literals throughout instead
  of tokens.
- **Brand hex** in `google-button.tsx:31` (`#4285F4`…) — acceptable (Google brand).

---

## 5. Prioritized weak spots (flagged, not fixed)

1. **No primitive component layer.** 20+ bespoke button/input/modal class strings → every
   inconsistency below stems from this. Highest-leverage fix: a small
   `Button`/`Input`/`Modal`/`Menu`/`Card`/`Badge` set.
2. **Token system is ~30% complete.** Only color/font are tokenized. Add **radius,
   shadow/elevation, spacing, z-index, and a semantic `--accent`** scale — then refactor the
   literals.
3. **Accessibility: focus states largely absent.** Inputs get a border-color change;
   buttons/menu items/tabs have **no visible focus ring**.
4. **No toast/feedback system.** Errors are inline-only and color-shade-inconsistent;
   success is silent ("Saving…" pill only). Destructive deletes (note/db/page) have **no
   confirm + no undo**.
5. **Loading = spinners, no skeletons.** Yjs routes show a bare "Connecting…" then pop
   content (the page editor briefly rendered empty before sync). Skeletons for the
   editor/DB/board would remove the flash.
6. **Empty states are plain text.** Functional but flat — no illustration, no primary CTA
   styling (home/project-home/chat/comments). High-visibility first-run surfaces.
7. **Composer UX quirk (Notes).** The quick "Take a note" composer doesn't reliably
   collapse/reset after Done — produced an accidental **duplicate note** in normal use.
   Worth hardening.
8. **z-index & overlay collisions.** Unmanaged stack (`z-20…[70]`) is fragile; the DB
   sticky-header/frozen-column `z-30/40` interplay is exactly the kind of thing one of the
   sample notes ("search dropdown z-index is off") calls out.
9. **Typography scale unsystematic.** `text-[10px]`/`[11px]`/`xs`/`sm`/`base`/`lg`/`2xl`
   mixed; some 10–11px text is below comfortable/accessible size.
10. **Dark-mode coverage is good but uneven** (asymmetric `hover:border-neutral-300` /
    `dark:…-600`); worth an audit once tokens exist.

### Suggested first targets
Maximum visual lift per unit of risk: **(a)** introduce the missing tokens + a
`Button`/`Input`/`Modal` trio, **(b)** add focus-visible rings globally, **(c)** add a toast +
destructive-confirm pattern, **(d)** redesign empty states. These are foundational and
unblock everything else.
