'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'
import { createClient } from '@/lib/supabase/client'
import type { PresenceUser } from '@/lib/presence'
import { KoreYjsProvider, type ProviderStatus } from './provider'

export type UseKoreYDocArgs = {
  docType: string
  docId: string
  workspaceId: string
  user: PresenceUser
}

export type UseKoreYDocResult = {
  ydoc: Y.Doc
  awareness: Awareness
  status: ProviderStatus
  online: PresenceUser[]
}

/**
 * The reusable collaboration hook. Phase 1 binds it to a plain-text scratchpad;
 * later phases bind the SAME ydoc/awareness to BlockNote (docs) and Excalidraw
 * (whiteboards). Keep `user` referentially stable (memoize in the caller).
 */
export function useKoreYDoc({
  docType,
  docId,
  workspaceId,
  user,
}: UseKoreYDocArgs): UseKoreYDocResult {
  // Recreate the doc/awareness when the target document changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ydoc = useMemo(() => new Y.Doc(), [docType, docId])
  const awareness = useMemo(() => new Awareness(ydoc), [ydoc])
  const [status, setStatus] = useState<ProviderStatus>('connecting')
  const [online, setOnline] = useState<PresenceUser[]>([])

  // Keep latest user in a ref so identity changes don't tear down the channel.
  const userRef = useRef(user)
  useEffect(() => {
    userRef.current = user
  }, [user])

  useEffect(() => {
    const supabase = createClient()
    awareness.setLocalStateField('user', userRef.current)

    const provider = new KoreYjsProvider({
      supabase,
      ydoc,
      awareness,
      docType,
      docId,
      workspaceId,
      presenceUser: userRef.current,
      onStatus: setStatus,
      onPresence: setOnline,
    })

    const flush = () => provider.flush()
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') provider.flush()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVisibility)
      void provider.destroy()
      awareness.destroy()
      ydoc.destroy()
    }
  }, [ydoc, awareness, docType, docId, workspaceId])

  return { ydoc, awareness, status, online }
}
