# Kore — User Guide

Kore is your team's single workspace: notes, docs, databases, whiteboards, and chat —
all in one place, all in real time. This guide walks you through everything you can do.

> **Who Kore is for:** one team of under ~10 people. Everyone who's an active member can
> see and edit everything — there are no hidden folders or per-person walls. Teams are just
> a way to *organize* projects, not to hide them.

---

## 1. Getting in

### Signing up
- Open Kore and choose **Sign up** (email + password, or **Continue with Google**).
- If your email was already invited by the workspace owner, you'll join automatically as an
  **Editor** the moment you sign up.
- If you weren't invited, your signup becomes a **join request**. The owner approves it on the
  Members page, and you're in. You can also hit **Request access** if you've already signed up.

### Confirm your email
If email confirmation is on, click the link in your inbox before your first sign-in.

### Roles, in plain terms
- **Owner** — one person. Manages members, can delete anything, renames/deletes teams.
- **Editor** — everyone else. Can create and edit all content across every team and project.
- **Team membership** — being added to a team's roster gives you owner-like control over
  *that team's projects* (you can permanently delete them, empty their trash). It does **not**
  hide anything from anyone.

---

## 2. Finding your way around

- **Sidebar (left):** your teams, the projects under each team, plus quick links to **Notes**
  and **Chat**. Hover a team or project to reveal a **⋯ menu** (rename, change icon, delete).
- **Topbar (top):** a **search box** (or press **⌘K** / **Ctrl-K** to jump to it), the
  who's-online avatars, theme toggle (light/dark), and your **avatar menu**.
- **Home:** a "KORE" watermark, your teams-and-projects grid, and a strip of your pinned notes.
- **Avatar menu:** **Edit profile** (name, avatar, @handle), theme, and sign out.

### Global search (⌘K)
Press **⌘K** (Mac) or **Ctrl-K** (Windows/Linux), start typing, and Kore searches across
notes, docs (titles *and* body text), databases, database rows, whiteboards, and chat
messages. Click a result to jump straight to it.

---

## 3. Notes — `/notes`

A workspace-wide, Google-Keep-style board. Great for quick captures, lists, and reminders.

- **Create a note:** click the new-note box, type a title and body.
- **Colors & labels:** pick a card color; add shared **labels** to group related notes.
- **Pin** important notes to float them to the top (pinned notes also show on Home).
- **Checklists:** turn a note into a to-do list with checkable items.
- **Images:** attach images directly to a card.
- **File under a project (optional):** a note can be loosely associated with a project, or
  left workspace-wide.
- **Grid or list view:** toggle whichever you prefer.
- **Archive / Trash:** archive to declutter, or trash to remove. Both are reversible.
  *Permanently deleting* a note and *emptying trash* are **owner-only**.
- **Comments:** open a note and leave comments inline; @-mention teammates.
- **Search box on the board** filters the notes you're looking at locally (separate from ⌘K).

---

## 4. Projects & Docs — `/p/[project]`

Each project has a **Docs home** showing its page outline, databases, whiteboards, an
**activity feed**, and a Trash section.

### Pages (the docs editor)
Pages are a rich block editor (BlockNote) and are **live-collaborative** — two people can edit
the same page at once and see each other's cursors.

- **Create & nest pages:** build a tree of pages; drag to reorder or re-nest.
- **Slash commands:** type `/` to insert headings, lists, quotes, callouts, dividers, toggles,
  code blocks, images, and more.
- **Page icons:** give each page an emoji icon.
- **@-mentions & backlinks:** type `@` to link another page. The mentioned page shows a
  **Backlinks** panel listing everything that points to it. Mentions keep working even if the
  target page is later renamed.
- **Images & files:** upload directly into a page.
- **Comments:** open the comments panel on the right (a drawer on mobile) to discuss the page.
- **Embeds:** drop a **database** or a **whiteboard** right inside a page — fully live.
- **Trash/restore:** trashing a page also trashes its child pages (reversible). Permanent
  delete and empty-trash are restricted to the owner or members of the project's team.

---

## 5. Databases — Table & Board

Per-project structured data, like a lightweight Notion/Airtable. Find them in the project
sidebar and on the Docs home, or embedded inside a page.

- **Views:** every database has one or more saved **Table** and **Board (Kanban)** views.
- **Properties (columns):** title, text, **status**, **single-select**, **multi-select**,
  **date**, and **person** (assign a teammate). Select-type properties have colored options.
- **Board view:** columns come from a status/select property. **Drag cards between columns**
  to change their status; drag to reorder within a column.
- **Add / edit rows:** add rows inline and edit cells in place.
- **Embed in a doc:** the same database can live inside a Docs page and stays in sync.
- **Trashing** a database is reversible by any member; **permanent delete / empty-trash** is
  owner or project-team only.

---

## 6. Whiteboards — Excalidraw

Per-project infinite canvas for diagrams and sketching, live with your teammates.

- **Draw:** shapes, arrows, freehand, text, sticky notes, connectors.
- **Real-time collab:** see teammates' **live cursors** and edits as they happen.
- **Images:** paste or add images to the canvas.
- **Export:** download the board as **PNG** or **SVG**.
- **Embed in a doc:** drop a live whiteboard inside a Docs page.
- **Trash/restore** like everything else; permanent delete is owner or project-team only.

---

## 7. Team Chat — `/chat`

One workspace-wide chat channel (WhatsApp-style).

- **Send messages** with **@-mentions** of teammates (mentions survive name changes).
- **Reply** inline by quoting a message.
- **React** with emoji.
- **Attachments:** share files and images.
- **Edit / delete** your own messages (the owner can delete anyone's).
- **Unread badge** in the sidebar tells you when there's something new.
- **Infinite scroll** loads older history as you scroll up.
- **Presence:** see who's online.

---

## 8. Comments & Activity

- **Comments** live on **Docs pages** (side panel) and **Note cards** (inline). @-mention to
  pull someone in.
- **Activity feed** on each project's Docs home shows a running log of creates, renames,
  trashes, restores, and deletes for that project.

---

## 9. Your profile

From the **avatar menu → Edit profile**:
- **Display name** — how you appear everywhere.
- **Avatar** — upload an image.
- **@handle** — your unique, lowercase mention handle (3–20 chars, letters/numbers/underscore).
  Mentions use your handle under the hood, so renaming yourself never breaks old mentions.

---

## 10. Teams & projects admin

- **Create / rename / delete teams:** owner only (deleting a team deletes its projects).
- **Create projects:** under a team.
- **Rename a project:** any member. **Delete a project:** owner or a member of that team.
- **Change team / project icons:** via the **⋯ menu** or the entity header.
- **Manage a team's roster:** on the team page (`/t/[team]`), the owner adds/removes members.

---

## 11. Tips

- **Real-time everywhere:** edits, cursors, and presence update live — no refresh needed.
- **Mobile:** Kore is responsive; panels become drawers on small screens.
- **Nothing is hidden:** if you can't find something, it exists somewhere — try **⌘K**.
- **Reversible by default:** trashing/archiving is safe; only the owner (or project-team
  members) can permanently delete.

That's the whole product. Six modules — Notes, Docs, Databases, Whiteboards, Chat, plus
Comments/Activity/Search tying them together. Happy building.
