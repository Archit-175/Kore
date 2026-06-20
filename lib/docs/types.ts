// Phase 3 (Docs) — page tree + backlink models.
//
// A page's relational envelope (title/icon/parent/sort) lives in the `pages`
// table and syncs via Postgres Changes; the block BODY lives in `yjs_documents`
// (doc_type='page') and syncs via the Phase 1 Yjs layer. These types describe
// the relational side only — what the sidebar tree, the @-mention picker, and
// the backlinks panel query and render.

/** A flat page row, camelCased. `trashedAt` is null for live pages; the trash
 *  view loads the non-null ones. */
export type PageNode = {
  id: string
  projectId: string
  parentPageId: string | null
  title: string
  icon: string | null
  sort: number
  trashedAt: string | null
  createdAt: string
  updatedAt: string
}

/** A page with its (recursively nested) children — the shape the tree renders. */
export type PageTreeNode = PageNode & { children: PageTreeNode[] }

/** A page that links TO the current page (rendered in "Linked references"). */
export type Backlink = {
  sourcePageId: string
  projectId: string
  title: string
}

/** Minimal page identity used by the @-mention picker and live title resolution. */
export type PageSummary = { id: string; title: string; projectId: string }

/** Canonical route for a page. Routing is flat by id (parent_page_id is for the
 *  tree, not the URL), so a reparent never rewrites a page's URL. */
export function pageHref(projectId: string, pageId: string): string {
  return `/p/${projectId}/${pageId}`
}

/** A page's display title, falling back to a placeholder for untitled pages. */
export function pageDisplayTitle(title: string): string {
  const t = title.trim()
  return t.length > 0 ? t : 'Untitled'
}
