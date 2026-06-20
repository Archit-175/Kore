// Phase 5 (Whiteboard) domain types — the camelCased shapes the UI renders, plus
// small pure helpers. The whiteboard ENVELOPE (this) is a plain relational row
// synced via Postgres Changes; the CANVAS BODY (Excalidraw elements) lives in the
// Yjs layer (yjs_documents, doc_type='whiteboard') and never appears here.

/** The whiteboard envelope (without its canvas). */
export type WhiteboardMeta = {
  id: string
  projectId: string
  title: string
  icon: string | null
}

/** A row in the project's whiteboard list (sidebar + project-home). */
export type WhiteboardListItem = {
  id: string
  title: string
  icon: string | null
  sort: number
  trashedAt: string | null
}

// ----------------------------------------------------------------------------
// Small pure helpers
// ----------------------------------------------------------------------------
export function whiteboardDisplayName(title: string): string {
  return title.trim() || 'Untitled'
}

export function wbHref(projectId: string, whiteboardId: string): string {
  return `/p/${projectId}/wb/${whiteboardId}`
}
