'use client'

import { useEffect, useMemo } from 'react'
import type * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'
import type { PresenceUser } from '@/lib/presence'
import type { ProviderStatus } from '@/lib/yjs/provider'
import { useDemoStore } from './context'

export type UseDemoYDocResult = {
  ydoc: Y.Doc
  awareness: Awareness
  status: ProviderStatus
  online: PresenceUser[]
}

/**
 * The offline stand-in for useKoreYDoc: returns the SAME { ydoc, awareness,
 * status, online } shape so BlockNote / Excalidraw bind unchanged — but backed by
 * a persistent per-doc Y.Doc from the DemoStore (survives editor remounts within
 * a page load) and a local Awareness with NO provider, NO Supabase broadcast, and
 * NO snapshot RPCs. Status is always 'synced' (green "Live" dot). The store's
 * Y.Doc is intentionally NOT destroyed on unmount (only the ephemeral awareness).
 */
export function useDemoYDoc({
  docType,
  docId,
  user,
}: {
  docType: string
  docId: string
  workspaceId?: string
  user: PresenceUser
}): UseDemoYDocResult {
  const store = useDemoStore()

  const ydoc = useMemo(
    () => (docType === 'whiteboard' ? store.getWhiteboardDoc(docId) : store.getPageDoc(docId)),
    [store, docType, docId],
  )
  const awareness = useMemo(() => new Awareness(ydoc), [ydoc])

  const online = useMemo(() => [store.presenceUser, ...store.onlinePeers], [store])

  useEffect(() => {
    awareness.setLocalStateField('user', user)
    return () => {
      // Tear down the per-mount awareness but KEEP the store's Y.Doc alive so the
      // document body persists across navigation within this page load.
      awareness.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awareness])

  return { ydoc, awareness, status: 'synced', online }
}
