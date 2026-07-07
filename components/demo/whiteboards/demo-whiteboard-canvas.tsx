'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type * as Y from 'yjs'
import type { Awareness } from 'y-protocols/awareness'
import {
  Excalidraw,
  reconcileElements,
  convertToExcalidrawElements,
  CaptureUpdateAction,
} from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
  BinaryFileData,
  BinaryFiles,
  Collaborator,
  SocketId,
} from '@excalidraw/excalidraw/types'
import type { OrderedExcalidrawElement, FileId } from '@excalidraw/excalidraw/element/types'
import type { RemoteExcalidrawElement } from '@excalidraw/excalidraw/data/reconcile'
import type { ExcalidrawElementSkeleton } from '@excalidraw/excalidraw/data/transform'
import type { PresenceUser } from '@/lib/presence'
import { useTheme } from '@/components/theme-provider'
import { useDemoStore } from '@/lib/demo/context'

/**
 * Demo fork of WhiteboardCanvas. Keeps the hand-rolled Excalidraw↔Yjs element
 * binding + live-cursor plumbing, but:
 *  - seeds the elements once from the store's Excalidraw skeleton (via
 *    convertToExcalidrawElements) into the ydoc BEFORE mount, then hands them to
 *    Excalidraw as `initialData` (with scrollToContent) — the canonical seed path
 *    (updateScene-after-apiReady silently drops elements while the canvas is still
 *    0×0, which the real app never hits because its data arrives post-layout),
 *  - keeps image bytes as dataURLs IN the files map (no Supabase Storage), so a
 *    pasted image survives a remount within the page load with zero network.
 */

const LOCAL_ORIGIN = 'excalidraw-local'
const WRITE_THROTTLE_MS = 60
const POINTER_THROTTLE_MS = 40

type DemoFileMeta = { dataURL: string; mimeType: string }

export function DemoWhiteboardCanvas({
  ydoc,
  awareness,
  whiteboardId,
  embedded = false,
  onApiReady,
}: {
  ydoc: Y.Doc
  awareness: Awareness
  whiteboardId: string
  workspaceId?: string
  user?: PresenceUser
  embedded?: boolean
  onApiReady?: (api: ExcalidrawImperativeAPI) => void
}) {
  const { theme } = useTheme()
  const store = useDemoStore()

  const elementsMap = useMemo(() => ydoc.getMap<OrderedExcalidrawElement>('elements'), [ydoc])
  const filesMap = useMemo(() => ydoc.getMap<DemoFileMeta>('files'), [ydoc])

  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const [apiReady, setApiReady] = useState(false)

  const seen = useRef(new Map<string, number>())
  const knownFiles = useRef(new Set<string>())

  // Seed the ydoc once (before Excalidraw mounts), then load the current ydoc
  // state as Excalidraw initialData so the shapes are present + framed on first
  // paint regardless of canvas measurement timing. On a remount the ydoc already
  // holds the (possibly edited) state, so this restores it.
  const initialData = useMemo<ExcalidrawInitialDataState>(() => {
    if (!store.isWhiteboardSeeded(whiteboardId)) {
      store.markWhiteboardSeeded(whiteboardId)
      const skeleton = store.whiteboardSeedFor(whiteboardId)
      if (skeleton && skeleton.length) {
        const els = convertToExcalidrawElements(skeleton as ExcalidrawElementSkeleton[])
        ydoc.transact(() => {
          for (const el of els) elementsMap.set(el.id, el as OrderedExcalidrawElement)
        }, LOCAL_ORIGIN)
      }
    }
    const elements = Array.from(elementsMap.values())
    const files: BinaryFiles = {}
    for (const [fileId, meta] of filesMap.entries()) {
      files[fileId] = {
        id: fileId as FileId,
        mimeType: meta.mimeType as BinaryFileData['mimeType'],
        dataURL: meta.dataURL as BinaryFileData['dataURL'],
        created: 0,
      }
    }
    return { elements, files, scrollToContent: true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- remote → local (only fires on genuine non-local doc changes) ----------
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
    for (const el of reconciled) seen.current.set(el.id, el.version)
    api.updateScene({ elements: reconciled, captureUpdate: CaptureUpdateAction.NEVER })
  }, [elementsMap])

  const applyRemoteFiles = useCallback(() => {
    const api = apiRef.current
    if (!api) return
    const toAdd: BinaryFileData[] = []
    for (const [fileId, meta] of filesMap.entries()) {
      if (knownFiles.current.has(fileId)) continue
      knownFiles.current.add(fileId)
      toAdd.push({
        id: fileId as FileId,
        mimeType: meta.mimeType as BinaryFileData['mimeType'],
        dataURL: meta.dataURL as BinaryFileData['dataURL'],
        created: 0,
      })
    }
    if (toAdd.length) api.addFiles(toAdd)
  }, [filesMap])

  // --- onChange (throttled): diff elements by version; stash new file dataURLs -
  const pending = useRef<{ elements: readonly OrderedExcalidrawElement[]; files: BinaryFiles } | null>(null)
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
      if (knownFiles.current.has(fileId)) continue
      knownFiles.current.add(fileId)
      const f = args.files[fileId]
      ydoc.transact(() => filesMap.set(fileId, { dataURL: f.dataURL, mimeType: f.mimeType }), LOCAL_ORIGIN)
    }
  }, [ydoc, elementsMap, filesMap])

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

  useEffect(() => {
    if (!apiReady) return
    // Seed the version/file bookkeeping from the initial doc state so onChange
    // doesn't re-broadcast the initialData and applyRemoteFiles doesn't re-add.
    for (const [id, el] of elementsMap.entries()) seen.current.set(id, el.version)
    for (const fileId of filesMap.keys()) knownFiles.current.add(fileId)
    const onEl = (_e: Y.YMapEvent<OrderedExcalidrawElement>, tx: Y.Transaction) => {
      if (tx.origin === LOCAL_ORIGIN) return
      applyRemoteElements()
    }
    const onFi = (_e: Y.YMapEvent<DemoFileMeta>, tx: Y.Transaction) => {
      if (tx.origin === LOCAL_ORIGIN) return
      applyRemoteFiles()
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
          pointer: s.pointer ? { x: s.pointer.x, y: s.pointer.y, tool: 'pointer' } : undefined,
          id: s.user.id,
        })
      })
      api.updateScene({ collaborators })
    }
    awareness.on('change', sync)
    sync()
    return () => awareness.off('change', sync)
  }, [apiReady, awareness])

  const pointerTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onPointerUpdate = useCallback(
    (payload: { pointer: { x: number; y: number }; button: 'up' | 'down' }) => {
      if (pointerTimer.current != null) return
      pointerTimer.current = setTimeout(() => {
        pointerTimer.current = null
      }, POINTER_THROTTLE_MS)
      awareness.setLocalStateField('pointer', { x: payload.pointer.x, y: payload.pointer.y, button: payload.button })
    },
    [awareness],
  )

  useEffect(
    () => () => {
      if (writeTimer.current) clearTimeout(writeTimer.current)
      if (pointerTimer.current) clearTimeout(pointerTimer.current)
      awareness.setLocalStateField('pointer', null)
    },
    [awareness],
  )

  return (
    <div className={`kore-wb-canvas ${embedded ? 'kore-wb-embed' : ''}`}>
      <Excalidraw
        initialData={initialData}
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

