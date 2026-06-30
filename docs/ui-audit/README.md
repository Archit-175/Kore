# Kore — UI/UX Audit Screenshots

Captured live in Chrome signed in as the **workspace owner** (workspace "Sampark"),
during the pre-redesign UI inventory. Dark mode unless noted. Viewport ~1456–1512 px wide.

The companion written inventory (routes, components, primitives, design tokens, and the
prioritized weak-spot list) is in [inventory.md](./inventory.md).

> **Two slots are intentionally missing** — `07-icon-picker` and `15-note-card-toolbar`
> were the only frames captured without being saved, so no image exists for them. They are
> quick to re-shoot (open any team/project "＋ Add icon", and hover a note card) if needed.

---

## Pages — empty states

### 01 · Home (empty) — `/`
KORE outline watermark, "Create a team and a project from the sidebar".
![home empty](images/01-home-empty.jpg)

### 02 · Notes (empty) — `/notes`
"No notes yet", composer, Notes/Archive/Trash tabs, grid/list toggle.
![notes empty](images/02-notes-empty.jpg)

### 06 · Project Docs home (empty) — `/p/[id]`
"No pages/databases/whiteboards yet" dashed panels.
![project home empty](images/06-project-home-empty.jpg)

---

## Pages — populated

### 19 · Home (populated) — `/`
Team→project grid + pinned-notes strip over the KORE watermark.
![home populated](images/19-home-populated.jpg)

### 23 · Home (light mode) — `/`
![home light](images/23-home-light.jpg)

### 03 · Chat — `/chat`
Team chat: messages, @handle mentions, presence "1 online", composer.
![chat](images/03-chat.jpg)

### 04 · Members — `/members`
Invite form, **Requests (1)** with Approve/Deny, members list with Owner/Editor + Active badges, Remove.
![members](images/04-members.jpg)

### 17 · Team page — `/t/[teamId]`
Star icon, roster (Parth + Remove), ＋ Add member, projects grid. Owner view.
![team page](images/17-team-page.jpg)

### 18 · Project Docs home (+ activity) — `/p/[id]`
Page tree + sub-page, Databases, Whiteboards, and the **Activity feed**.
![project home activity](images/18-project-home-activity.jpg)

### 08 · Page editor — `/p/[id]/[pageId]`
BlockNote doc: title, H1/H2, paragraphs, "Live" badge, sub-pages.
![page editor](images/08-page-editor.jpg)

### 10 · Nested sub-page — `/p/[id]/[pageId]`
"User Stories" (breadcrumb shows the nesting).
![sub-page](images/10-page-subpage.jpg)

### 11 · Database — Table view — `/p/[id]/db/[dbId]`
4 rows, Name + Status, colored status chips.
![database table](images/11-database-table.jpg)

### 12 · Database — Board (Kanban) view — `/p/[id]/db/[dbId]`
No Status / To do / In progress / Done columns.
![database board](images/12-database-board.jpg)

### 13 · Whiteboard — `/p/[id]/wb/[wbId]`
Excalidraw "Architecture Sketch": rectangle + ellipse + arrow + labels.
![whiteboard](images/13-whiteboard.jpg)

### 14 · Notes board (populated) — `/notes`
PINNED amber checklist note (1 item checked) + OTHERS (red, teal) cards; Trash (1).
![notes board](images/14-notes-board.jpg)

---

## Interactions / overlays

### 05 · Sidebar inline-create
Inline "Team name" / "New project" input affordances.
![sidebar inline create](images/05-sidebar-inline-create.jpg)

### 09 · Slash-command menu (Docs editor)
Headings / Basic blocks groups.
![slash menu](images/09-slash-menu.jpg)

### 16 · Note editor modal
Checklist (1 checked), Add image, Comments, color palette row.
![note editor modal](images/16-note-editor-modal.jpg)

### 20 · Global search dropdown (topbar)
Inline ⌘K search, grouped results (PAGES) with snippet.
![global search](images/20-global-search.jpg)

### 21 · Avatar menu (topbar)
Edit profile / Manage members / Sign out.
![avatar menu](images/21-avatar-menu.jpg)

### 22 · Profile modal
Avatar upload, display name, @handle.
![profile modal](images/22-profile-modal.jpg)

---

## Not captured

- **07 · IconPicker grid** and **15 · Note-card hover toolbar** — frames not saved (see note above).
- **Auth/onboarding routes** — `/login`, `/signup`, `/setup`, `/request-access`: `proxy.ts`
  redirects an authenticated user away from them (verified `/login` → `/`), so they need an
  unauthenticated session to capture. Documented from code in [inventory.md](./inventory.md):
  - `/login`, `/signup` → `AuthForm` (`components/auth/auth-form.tsx`) + `GoogleButton`
  - `/setup` → `SetupForm` (`components/onboarding/setup-form.tsx`)
  - `/request-access` → request UI + `SignOutButton`
