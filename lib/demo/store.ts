// The in-memory, client-only data layer for /demo. A single mutable store object
// is created once per page load (in DemoStoreProvider) and thrown away on refresh
// — that IS the ephemerality trick, so there is deliberately NO persistence.
//
// It holds plain data slices mirroring the real app's aggregate types (BoardNote,
// DatabaseAggregate, ChatMessage, …) plus setState-style setters so the demo
// container forks can reuse the real containers' optimistic-reducer logic almost
// verbatim — just pointing at `store.setNotes(...)` instead of a local useState.
//
// This file imports NOTHING from @/lib/supabase, lib/actions/*, or the realtime
// layer — so nothing that reads it can make a network call.

import * as Y from 'yjs'
import type { PresenceUser } from '@/lib/presence'
import type { SidebarTeam, SidebarProject } from '@/components/shell/sidebar'
import type { BoardNote, BoardLabel } from '@/lib/notes/types'
import type { PageNode, Backlink } from '@/lib/docs/types'
import type { DatabaseAggregate, DbMember, DatabaseListItem } from '@/lib/databases/types'
import type { WhiteboardMeta } from '@/lib/whiteboards/types'
import type { ChatMessage } from '@/lib/chat/types'
import type { CommentItem } from '@/lib/comments/types'
import type { ActivityEntry } from '@/lib/activity/load-activity'
import { buildSeed } from './seed'

/** A whiteboard envelope + the list fields the trees/sections need. */
export type DemoWhiteboard = WhiteboardMeta & { sort: number; trashedAt: string | null }
/** Per-database list metadata not carried on the aggregate (sort/trash state). */
export type DemoDbExtra = { sort: number; trashedAt: string | null }

/** A block of BlockNote content used to seed a page's Y.Doc on first mount
 *  (kept as loose JSON so this module never imports BlockNote at load time). */
export type SeedBlock = Record<string, unknown>

type Updater<T> = T | ((prev: T) => T)
function apply<T>(prev: T, u: Updater<T>): T {
  return typeof u === 'function' ? (u as (p: T) => T)(prev) : u
}

export type DemoSeed = {
  workspace: { id: string; name: string }
  members: DbMember[]
  presenceUser: PresenceUser
  onlinePeers: PresenceUser[]
  teams: SidebarTeam[]
  projects: SidebarProject[]
  notes: BoardNote[]
  labels: BoardLabel[]
  pages: PageNode[]
  pageSeedBlocks: Record<string, SeedBlock[]>
  backlinks: Record<string, Backlink[]>
  databases: DatabaseAggregate[]
  dbExtra: Record<string, DemoDbExtra>
  whiteboards: DemoWhiteboard[]
  /** Excalidraw element skeletons (plain JSON) seeded on the client canvas. */
  whiteboardSeed: Record<string, unknown[]>
  chat: ChatMessage[]
  comments: Record<string, CommentItem[]>
  activity: Record<string, ActivityEntry[]>
}

export class DemoStore {
  // --- reactive plumbing (useSyncExternalStore) ------------------------------
  private listeners = new Set<() => void>()
  private version = 0
  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }
  getVersion = (): number => this.version
  /** Bump the version and notify subscribers — every mutator calls this. */
  emit = (): void => {
    this.version++
    this.listeners.forEach((l) => l())
  }

  // --- identity / shell ------------------------------------------------------
  readonly workspace: { id: string; name: string }
  readonly currentUserId: string
  members: DbMember[]
  presenceUser: PresenceUser
  onlinePeers: PresenceUser[]
  teams: SidebarTeam[]
  projects: SidebarProject[]

  // --- module data slices ----------------------------------------------------
  notes: BoardNote[]
  labels: BoardLabel[]
  pages: PageNode[]
  backlinks: Map<string, Backlink[]>
  private databases: Map<string, DatabaseAggregate>
  private dbExtra: Map<string, DemoDbExtra>
  whiteboards: DemoWhiteboard[]
  chat: ChatMessage[]
  private comments: Map<string, CommentItem[]>
  private activity: Map<string, ActivityEntry[]>

  // --- Yjs bodies (persistent per id; not part of the reactive version) ------
  private pageDocs = new Map<string, Y.Doc>()
  private whiteboardDocs = new Map<string, Y.Doc>()
  private pageSeedBlocks: Map<string, SeedBlock[]>
  private seededPages = new Set<string>()
  private whiteboardSeed: Map<string, unknown[]>
  private seededWhiteboards = new Set<string>()

  constructor() {
    const seed = buildSeed()
    this.workspace = seed.workspace
    this.currentUserId = seed.presenceUser.id
    this.members = seed.members
    this.presenceUser = seed.presenceUser
    this.onlinePeers = seed.onlinePeers
    this.teams = seed.teams
    this.projects = seed.projects
    this.notes = seed.notes
    this.labels = seed.labels
    this.pages = seed.pages
    this.backlinks = new Map(Object.entries(seed.backlinks))
    this.databases = new Map(seed.databases.map((d) => [d.database.id, d]))
    this.dbExtra = new Map(Object.entries(seed.dbExtra))
    this.whiteboards = seed.whiteboards
    this.chat = seed.chat
    this.comments = new Map(Object.entries(seed.comments))
    this.activity = new Map(Object.entries(seed.activity))
    this.pageSeedBlocks = new Map(Object.entries(seed.pageSeedBlocks))
    this.whiteboardSeed = new Map(Object.entries(seed.whiteboardSeed))
  }

  // --- shell setters ---------------------------------------------------------
  setTeams(u: Updater<SidebarTeam[]>) {
    this.teams = apply(this.teams, u)
    this.emit()
  }
  setProjects(u: Updater<SidebarProject[]>) {
    this.projects = apply(this.projects, u)
    this.emit()
  }

  // --- notes -----------------------------------------------------------------
  setNotes(u: Updater<BoardNote[]>) {
    this.notes = apply(this.notes, u)
    this.emit()
  }
  setLabels(u: Updater<BoardLabel[]>) {
    this.labels = apply(this.labels, u)
    this.emit()
  }

  // --- pages -----------------------------------------------------------------
  setPages(u: Updater<PageNode[]>) {
    this.pages = apply(this.pages, u)
    this.emit()
  }
  getBacklinks(pageId: string): Backlink[] {
    return this.backlinks.get(pageId) ?? []
  }

  /** The persistent (per-page) Y.Doc for a doc body — created lazily so it
   *  survives editor remounts (navigate away + back) within one page load. */
  getPageDoc(pageId: string): Y.Doc {
    let doc = this.pageDocs.get(pageId)
    if (!doc) {
      doc = new Y.Doc()
      this.pageDocs.set(pageId, doc)
    }
    return doc
  }
  pageSeedFor(pageId: string): SeedBlock[] | null {
    return this.pageSeedBlocks.get(pageId) ?? null
  }
  isPageSeeded(pageId: string): boolean {
    return this.seededPages.has(pageId)
  }
  markPageSeeded(pageId: string): void {
    this.seededPages.add(pageId)
  }

  // --- databases -------------------------------------------------------------
  getDatabase(id: string): DatabaseAggregate | undefined {
    return this.databases.get(id)
  }
  setDatabase(id: string, u: (prev: DatabaseAggregate) => DatabaseAggregate) {
    const prev = this.databases.get(id)
    if (!prev) return
    this.databases.set(id, u(prev))
    this.emit()
  }
  listDatabases(projectId: string): DatabaseListItem[] {
    const out: DatabaseListItem[] = []
    for (const agg of this.databases.values()) {
      if (agg.database.projectId !== projectId) continue
      const extra = this.dbExtra.get(agg.database.id)
      out.push({
        id: agg.database.id,
        name: agg.database.name,
        icon: agg.database.icon,
        sort: extra?.sort ?? 0,
        trashedAt: extra?.trashedAt ?? null,
        rowCount: agg.rows.length,
      })
    }
    return out.sort((a, b) => a.sort - b.sort)
  }

  // --- whiteboards -----------------------------------------------------------
  setWhiteboards(u: Updater<DemoWhiteboard[]>) {
    this.whiteboards = apply(this.whiteboards, u)
    this.emit()
  }
  getWhiteboard(id: string): DemoWhiteboard | undefined {
    return this.whiteboards.find((w) => w.id === id)
  }
  getWhiteboardDoc(id: string): Y.Doc {
    let doc = this.whiteboardDocs.get(id)
    if (!doc) {
      doc = new Y.Doc()
      this.whiteboardDocs.set(id, doc)
    }
    return doc
  }
  whiteboardSeedFor(id: string): unknown[] | null {
    return this.whiteboardSeed.get(id) ?? null
  }
  isWhiteboardSeeded(id: string): boolean {
    return this.seededWhiteboards.has(id)
  }
  markWhiteboardSeeded(id: string): void {
    this.seededWhiteboards.add(id)
  }

  // --- chat ------------------------------------------------------------------
  setChat(u: Updater<ChatMessage[]>) {
    this.chat = apply(this.chat, u)
    this.emit()
  }

  // --- comments --------------------------------------------------------------
  getComments(key: string): CommentItem[] {
    return this.comments.get(key) ?? []
  }
  setComments(key: string, u: Updater<CommentItem[]>) {
    this.comments.set(key, apply(this.comments.get(key) ?? [], u))
    this.emit()
  }

  // --- activity --------------------------------------------------------------
  getActivity(projectId: string): ActivityEntry[] {
    return this.activity.get(projectId) ?? []
  }
  addActivity(projectId: string, entry: ActivityEntry) {
    this.activity.set(projectId, [entry, ...this.getActivity(projectId)])
    this.emit()
  }

  // --- creation (returns the new id) -----------------------------------------
  createPage(projectId: string, parentPageId: string | null = null, title = ''): string {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const sort = this.pages.reduce((m, p) => Math.max(m, p.sort), 0) + 1
    this.pages = [
      ...this.pages,
      { id, projectId, parentPageId, title, icon: null, sort, trashedAt: null, createdAt: now, updatedAt: now },
    ]
    this.emit()
    return id
  }

  createDatabase(projectId: string, name = 'Untitled database'): string {
    const id = crypto.randomUUID()
    const agg: DatabaseAggregate = {
      database: { id, projectId, name, icon: null },
      properties: [{ id: crypto.randomUUID(), name: 'Name', type: 'title', options: [], sort: 0 }],
      views: [{ id: crypto.randomUUID(), name: 'Table', type: 'table', groupPropertyId: null, sort: 0, config: {} }],
      rows: [],
    }
    this.databases.set(id, agg)
    const sort = this.listDatabases(projectId).reduce((m, d) => Math.max(m, d.sort), 0) + 1
    this.dbExtra.set(id, { sort, trashedAt: null })
    this.emit()
    return id
  }

  createWhiteboard(projectId: string, title = 'Untitled whiteboard'): string {
    const id = crypto.randomUUID()
    const sort = this.whiteboards.filter((w) => w.projectId === projectId).reduce((m, w) => Math.max(m, w.sort), 0) + 1
    this.whiteboards = [...this.whiteboards, { id, projectId, title, icon: null, sort, trashedAt: null }]
    this.emit()
    return id
  }

  // --- lookups ---------------------------------------------------------------
  memberById(id: string): DbMember | undefined {
    return this.members.find((m) => m.id === id)
  }
  projectById(id: string): SidebarProject | undefined {
    return this.projects.find((p) => p.id === id)
  }
  pageById(id: string): PageNode | undefined {
    return this.pages.find((p) => p.id === id)
  }
}
