'use client'

import { createContext } from 'react'
import type { PresenceUser } from '@/lib/presence'

/** Carries the host page's project + workspace + the current presence user into
 *  the inline whiteboardEmbed block (BlockNote block render components are inside
 *  the editor's React tree, so a context provider around BlockNoteView reaches
 *  them). Unlike databaseEmbed, the whiteboard embed is collaborative, so it needs
 *  the presence `user` for the Yjs binding's cursors/awareness. */
export type WhiteboardEmbedCtx = {
  workspaceId: string
  projectId: string
  user: PresenceUser
}

export const WhiteboardEmbedContext = createContext<WhiteboardEmbedCtx | null>(null)
