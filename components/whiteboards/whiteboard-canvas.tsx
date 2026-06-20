'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type * as Y from 'yjs'
import type { Awareness } from 'y-protocols/awareness'
import { Excalidraw, reconcileElements, CaptureUpdateAction } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import type {
  ExcalidrawImperativeAPI,
  BinaryFileData,
  BinaryFiles,
  Collaborator,
  SocketId,
} from '@excalidraw/excalidraw/types'
import type { OrderedExcalidrawElement, FileId } from '@excalidraw/excalidraw/element/types'
import type { RemoteExcalidrawElement } from '@excalidraw/excalidraw/data/reconcile'
import { createClient } from '@/lib/supabase/client'
import { getSignedUrl, uploadFile } from '@/lib/storage'
import type { PresenceUser } from '@/lib/presence'
import { useTheme } from '@/components/theme-provider'

/**
 * The Excalidraw canvas bound to the shared Yjs doc (the hand-rolled binding —
 * Excalidraw has no native Yjs support and y-excalidraw is stale/peer-incompatible
 * with Excalidraw 0.18 + React 19). It reuses the SAME ydoc/awareness from
 * useKoreYDoc({ docType:'whiteboard' }) that BlockNote/the scratchpad use, so
 * KoreYjsProvider already handles transport (broadcast) + persistence
 * (save_yjs_snapshot, debounced 2.5s + unload). There is no new transport here.
 *
 * Model:
 *  - elements live in ydoc.getMap('elements') keyed by element.id (per-element
 *    LWW; deletions are isDeleted:true entries). Local edits → version-diffed
 *    writes (LOCAL origin); remote changes → reconcileElements + updateScene
 *    (captureUpdate NEVER, so remote/init never pollutes the local undo stack).
 *  - image BYTES go to Supabase Storage (note-attachments, reusing lib/storage),
 *    the CRDT carries only ydoc.getMap('files'): { fileId → {path,mimeType} }.
 *  - live cursors map y-awareness ↔ Excalidraw's collaborators Map.
 *
 * Loaded via next/dynamic({ ssr:false }) by WhiteboardView — Excalidraw is client-only.
 */

// Transaction origin for our own writes, so the Y.Map observers ignore the echo.
const LOCAL_ORIGIN = 'excalidraw-local'
const WRITE_THROTTLE_MS = 60
const POINTER_THROTTLE_MS = 40

type FileMeta = { path: string; mimeType: string }

function dataURLToFile(dataURL: string, name: string): File | null {
  const comma = dataURL.indexOf(',')
  if (comma < 0) return null
  const header = dataURL.slice(0, comma)
  const mime = /data:(.*?);base64/.exec(header)?.[1] ?? 'image/png'
  try {
    const bin = atob(dataURL.slice(comma + 1))
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return new File([bytes], name, { type: mime })
  } catch {
    return null
  }
}

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export function WhiteboardCanvas({
  ydoc,
  awareness,
  whiteboardId,
  workspaceId,
  embedded = false,
  onApiReady,
}: {
  ydoc: Y.Doc
  awareness: Awareness
  whiteboardId: string
  workspaceId: string
  user: PresenceUser
  embedded?: boolean
  onApiReady?: (api: ExcalidrawImperativeAPI) => void
}) {
  const { theme } = useTheme()
  const supabase = useMemo(() => createClient(), [])

  const elementsMap = useMemo(
    () => ydoc.getMap<OrderedExcalidrawElement>('elements'),
    [ydoc],
  )
  const filesMap = useMemo(() => ydoc.getMap<FileMeta>('files'), [ydoc])

  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const [apiReady, setApiReady] = useState(false)

  // Last element version we've written/seen, so onChange only pushes real edits
  // and applied remote scenes don't echo back into the doc.
  const seen = useRef(new Map<string, number>())
  // fileIds we've already uploaded (local) — don't re-upload.
  const uploaded = useRef(new Set<string>())
  // fileIds we've already pulled from Storage + addFiles'd (remote).
  const fetched = useRef(new Set<string>())

  // --- remote → local: elements ---------------------------------------------
  const applyRemoteElements = useCallback(() => {
    const api = apiRef.current
    if (!api) return
    const remote = Array.from(elementsMap.values())
    const local = api.getSceneElements() as readonly OrderedExcalidrawElement[]
    if (remote.length === 0 && local.length === 0) return
    const reconciled = reconcileElements(
      local,
      remote as unknown as readonly RemoteExcalidrawElement[],
      api.getAppState(),
    )
    // Mark seen BEFORE updateScene so the resulting onChange is a no-op (no echo).
    for (const el of reconciled) seen.current.set(el.id, el.version)
    api.updateScene({ elements: reconciled, captureUpdate: CaptureUpdateAction.NEVER })
  }, [elementsMap])

  // --- remote → local: files (fetch bytes from Storage, addFiles) ------------
  const applyRemoteFiles = useCallback(async () => {
    const api = apiRef.current
    if (!api) return
    const toAdd: BinaryFileData[] = []
    for (const [fileId, meta] of filesMap.entries()) {
      if (fetched.current.has(fileId)) continue
      fetched.current.add(fileId)
      uploaded.current.add(fileId) // we now know it exists in Storage
      try {
        const url = await getSignedUrl(supabase, meta.path)
        if (!url) continue
        const resp = await fetch(url)
        const dataURL = await blobToDataURL(await resp.blob())
        toAdd.push({
          id: fileId as FileId,
          mimeType: meta.mimeType as BinaryFileData['mimeType'],
          dataURL: dataURL as BinaryFileData['dataURL'],
          created: Date.now(),
        })
      } catch {
        fetched.current.delete(fileId) // allow a retry on the next change
      }
    }
    if (toAdd.length) api.addFiles(toAdd)
  }, [filesMap, supabase])

  // --- local → remote: upload a new image, then register its metadata --------
  const uploadAndRegister = useCallback(
    async (fileId: string, file: BinaryFiles[string]) => {
      const f = dataURLToFile(file.dataURL, fileId)
      if (!f) return
      const res = await uploadFile(supabase, {
        workspaceId,
        noteId: `whiteboards/${whiteboardId}`,
        file: f,
      })
      if (res.error || !res.path) {
        uploaded.current.delete(fileId) // unsupported type / failure → let it retry
        return
      }
      fetched.current.add(fileId) // we already have the bytes locally
      const path = res.path
      ydoc.transact(() => filesMap.set(fileId, { path, mimeType: file.mimeType }), LOCAL_ORIGIN)
    },
    [supabase, workspaceId, whiteboardId, ydoc, filesMap],
  )

  // --- onChange (throttled): diff elements by version, upload new files -------
  const pending = useRef<{ elements: readonly OrderedExcalidrawElement[]; files: BinaryFiles } | null>(
    null,
  )
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = useCallback(() => {
    const args = pending.current
    pending.current = null
    if (!args) return
    const changed: OrderedExcalidrawElement[] = []
    for (const el of args.elements) {
      const prev = seen.current.get(el.id)
      if (prev === undefined || el.version > prev) {
        seen.current.set(el.id, el.version)
        changed.push(el)
      }
    }
    if (changed.length) {
      ydoc.transact(() => {
        for (const el of changed) elementsMap.set(el.id, el)
      }, LOCAL_ORIGIN)
    }
    for (const fileId of Object.keys(args.files)) {
      if (uploaded.current.has(fileId)) continue
      uploaded.current.add(fileId)
      void uploadAndRegister(fileId, args.files[fileId])
    }
  }, [ydoc, elementsMap, uploadAndRegister])

  const onChange = useCallback(
    (elements: readonly OrderedExcalidrawElement[], _appState: unknown, files: BinaryFiles) => {
      pending.current = { elements, files }
      if (writeTimer.current == null) {
        writeTimer.current = setTimeout(() => {
          writeTimer.current = null
          flush()
        }, WRITE_THROTTLE_MS)
      }
    },
    [flush],
  )

  // --- observers: react to remote (non-LOCAL) doc changes --------------------
  useEffect(() => {
    if (!apiReady) return
    applyRemoteElements()
    void applyRemoteFiles()
    const onEl = (_e: Y.YMapEvent<OrderedExcalidrawElement>, tx: Y.Transaction) => {
      if (tx.origin === LOCAL_ORIGIN) return
      applyRemoteElements()
    }
    const onFi = (_e: Y.YMapEvent<FileMeta>, tx: Y.Transaction) => {
      if (tx.origin === LOCAL_ORIGIN) return
      void applyRemoteFiles()
    }
    elementsMap.observe(onEl)
    filesMap.observe(onFi)
    return () => {
      elementsMap.unobserve(onEl)
      filesMap.unobserve(onFi)
    }
  }, [apiReady, elementsMap, filesMap, applyRemoteElements, applyRemoteFiles])

  // --- live cursors: y-awareness → Excalidraw collaborators Map --------------
  useEffect(() => {
    if (!apiReady) return
    const sync = () => {
      const api = apiRef.current
      if (!api) return
      const collaborators = new Map<SocketId, Collaborator>()
      awareness.getStates().forEach((state, clientId) => {
        if (clientId === awareness.clientID) return
        const s = state as {
          user?: PresenceUser
          pointer?: { x: number; y: number; button?: 'up' | 'down' }
        }
        if (!s.user) return
        collaborators.set(String(clientId) as SocketId, {
          username: s.user.name,
          avatarUrl: s.user.avatarUrl ?? undefined,
          color: { background: s.user.color, stroke: s.user.color },
          button: s.pointer?.button ?? 'up',
          pointer: s.pointer
            ? { x: s.pointer.x, y: s.pointer.y, tool: 'pointer' }
            : undefined,
          id: s.user.id,
        })
      })
      api.updateScene({ collaborators })
    }
    awareness.on('change', sync)
    sync()
    return () => awareness.off('change', sync)
  }, [apiReady, awareness])

  // --- broadcast local pointer (throttled) -----------------------------------
  const pointerTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onPointerUpdate = useCallback(
    (payload: { pointer: { x: number; y: number }; button: 'up' | 'down' }) => {
      if (pointerTimer.current != null) return
      pointerTimer.current = setTimeout(() => {
        pointerTimer.current = null
      }, POINTER_THROTTLE_MS)
      awareness.setLocalStateField('pointer', {
        x: payload.pointer.x,
        y: payload.pointer.y,
        button: payload.button,
      })
    },
    [awareness],
  )

  useEffect(
    () => () => {
      if (writeTimer.current) clearTimeout(writeTimer.current)
      if (pointerTimer.current) clearTimeout(pointerTimer.current)
      // drop our ephemeral pointer so peers clear our cursor promptly
      awareness.setLocalStateField('pointer', null)
    },
    [awareness],
  )

  return (
    <div className={`kore-wb-canvas ${embedded ? 'kore-wb-embed' : ''}`}>
      <Excalidraw
        excalidrawAPI={(api) => {
          apiRef.current = api
          setApiReady(true)
          onApiReady?.(api)
        }}
        onChange={onChange}
        onPointerUpdate={onPointerUpdate}
        isCollaborating
        theme={theme === 'dark' ? 'dark' : 'light'}
        viewModeEnabled={false}
      />
    </div>
  )
}
