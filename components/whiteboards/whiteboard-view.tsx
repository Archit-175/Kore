'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { useKoreYDoc } from '@/lib/yjs/use-kore-ydoc'
import { createClient } from '@/lib/supabase/client'
import { useWorkspaceTable } from '@/lib/realtime/workspace-tables'
import { loadWhiteboard } from '@/lib/whiteboards/load-whiteboards'
import { whiteboardDisplayName, type WhiteboardMeta } from '@/lib/whiteboards/types'
import { renameWhiteboard, updateWhiteboardIcon } from '@/lib/actions/whiteboards'
import type { PresenceUser } from '@/lib/presence'
import type { ProviderStatus } from '@/lib/yjs/provider'
import { OnlineAvatars } from '@/components/shell/online-avatars'
import { IconPicker } from '@/components/docs/icon-picker'

// Excalidraw is client-only — load the canvas (which owns the Yjs binding) with ssr:false.
const WhiteboardCanvas = dynamic(
  () => import('./whiteboard-canvas').then((m) => m.WhiteboardCanvas),
  { ssr: false, loading: () => <div className="h-full w-full animate-pulse bg-surface" /> },
)

const STATUS_LABEL: Record<ProviderStatus, string> = {
  connecting: 'Connecting…',
  synced: 'Live',
  offline: 'Offline',
}
const STATUS_COLOR: Record<ProviderStatus, string> = {
  connecting: 'bg-amber-400',
  synced: 'bg-emerald-500',
  offline: 'bg-neutral-400',
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function WhiteboardView({
  whiteboardId,
  projectId,
  workspaceId,
  user,
  initialMeta,
  embedded = false,
}: {
  whiteboardId: string
  projectId: string
  workspaceId: string
  user: PresenceUser
  initialMeta: WhiteboardMeta
  embedded?: boolean
}) {
  const memoUser = useMemo(
    () => ({ id: user.id, name: user.name, color: user.color, avatarUrl: user.avatarUrl }),
    [user.id, user.name, user.color, user.avatarUrl],
  )

  const { ydoc, awareness, status, online } = useKoreYDoc({
    docType: 'whiteboard',
    docId: whiteboardId,
    workspaceId,
    user: memoUser,
  })

  const supabase = useMemo(() => createClient(), [])
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)

  const [title, setTitle] = useState(initialMeta.title)
  const [icon, setIcon] = useState<string | null>(initialMeta.icon)
  const [exportOpen, setExportOpen] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Live title/icon: a rename/icon change elsewhere shows here too — but never
  // clobber the title input while it's focused (the notes/pages pattern). Realtime
  // rides the ONE shared workspace channel (no per-view channel — see
  // lib/realtime/workspace-tables.ts); the embed has no title chrome so it skips.
  const metaTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const refetchMeta = useCallback(async () => {
    if (embedded) return
    const meta = await loadWhiteboard(supabase, workspaceId, whiteboardId)
    if (!meta) return
    setIcon(meta.icon)
    if (titleRef.current !== document.activeElement) {
      setTitle((cur) => (meta.title !== cur ? meta.title : cur))
    }
  }, [supabase, workspaceId, whiteboardId, embedded])
  const scheduleMeta = useCallback(() => {
    if (metaTimer.current) clearTimeout(metaTimer.current)
    metaTimer.current = setTimeout(() => void refetchMeta(), 300)
  }, [refetchMeta])
  useWorkspaceTable(workspaceId, 'whiteboards', scheduleMeta)
  useEffect(
    () => () => {
      if (metaTimer.current) clearTimeout(metaTimer.current)
    },
    [],
  )

  const onTitleChange = (value: string) => {
    setTitle(value)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => void renameWhiteboard(whiteboardId, value), 500)
  }
  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    },
    [],
  )

  const doExport = async (kind: 'png' | 'svg') => {
    setExportOpen(false)
    const api = apiRef.current
    if (!api) return
    const name = whiteboardDisplayName(title).replace(/[^\w.-]+/g, '_')
    const mod = await import('@excalidraw/excalidraw')
    const elements = api.getSceneElements()
    const appState = { ...api.getAppState(), exportBackground: true }
    const files = api.getFiles()
    if (kind === 'png') {
      const blob = await mod.exportToBlob({ elements, appState, files, mimeType: 'image/png' })
      triggerDownload(blob, `${name}.png`)
    } else {
      const svg = await mod.exportToSvg({ elements, appState, files })
      const data = new XMLSerializer().serializeToString(svg)
      triggerDownload(new Blob([data], { type: 'image/svg+xml' }), `${name}.svg`)
    }
  }

  // Embedded: just the canvas in a fixed box (chrome lives in the embed wrapper).
  if (embedded) {
    return (
      <div className="h-[480px] w-full">
        <WhiteboardCanvas
          key={whiteboardId}
          ydoc={ydoc}
          awareness={awareness}
          whiteboardId={whiteboardId}
          workspaceId={workspaceId}
          user={memoUser}
          embedded
          onApiReady={(api) => {
            apiRef.current = api
          }}
        />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Topbar: breadcrumb + icon + title + export + sync status + who's-online */}
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <Link
            href={`/p/${projectId}`}
            className="shrink-0 truncate text-neutral-500 transition hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100"
          >
            Project
          </Link>
          <span className="shrink-0 text-neutral-300 dark:text-neutral-600">/</span>
          <IconPicker
            value={icon}
            onPick={(emoji) => {
              setIcon(emoji)
              void updateWhiteboardIcon(whiteboardId, emoji)
            }}
            onRemove={() => {
              setIcon(null)
              void updateWhiteboardIcon(whiteboardId, null)
            }}
          />
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Untitled"
            className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-neutral-300 dark:placeholder:text-neutral-600"
          />
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <div className="relative">
            <button
              type="button"
              onClick={() => setExportOpen((v) => !v)}
              className="rounded-md border border-border px-2 py-1 text-xs font-medium text-neutral-600 transition hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/5"
            >
              Export ▾
            </button>
            {exportOpen && (
              <div
                className="absolute right-0 top-8 z-20 w-32 overflow-hidden rounded-md border border-border bg-background py-1 text-sm shadow-lg"
                onMouseLeave={() => setExportOpen(false)}
              >
                <button
                  type="button"
                  onClick={() => void doExport('png')}
                  className="block w-full px-3 py-1 text-left hover:bg-black/5 dark:hover:bg-white/5"
                >
                  PNG image
                </button>
                <button
                  type="button"
                  onClick={() => void doExport('svg')}
                  className="block w-full px-3 py-1 text-left hover:bg-black/5 dark:hover:bg-white/5"
                >
                  SVG vector
                </button>
              </div>
            )}
          </div>
          <span className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
            <span className={`h-2 w-2 rounded-full ${STATUS_COLOR[status]}`} />
            {STATUS_LABEL[status]}
          </span>
          <OnlineAvatars users={online} />
        </div>
      </div>

      {/* Canvas fills the rest (Excalidraw needs an explicit-height parent). */}
      <div className="min-h-0 flex-1">
        <WhiteboardCanvas
          key={whiteboardId}
          ydoc={ydoc}
          awareness={awareness}
          whiteboardId={whiteboardId}
          workspaceId={workspaceId}
          user={memoUser}
          onApiReady={(api) => {
            apiRef.current = api
          }}
        />
      </div>
    </div>
  )
}
