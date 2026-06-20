'use client'

import { createContext } from 'react'

/** Carries the host page's project + workspace into the inline databaseEmbed
 *  block (BlockNote block render components are inside the editor's React tree,
 *  so a context provider around BlockNoteView reaches them). */
export type DatabaseEmbedCtx = {
  workspaceId: string
  projectId: string
}

export const DatabaseEmbedContext = createContext<DatabaseEmbedCtx | null>(null)
