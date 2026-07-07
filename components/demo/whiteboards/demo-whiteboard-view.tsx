'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { useDemo } from '@/lib/demo/context'
import { useDemoYDoc } from '@/lib/demo/use-demo-ydoc'
import { whiteboardDisplayName } from '@/lib/whiteboards/types'
import type { ProviderStatus } from '@/lib/yjs/provider'
import { OnlineAvatars } from '@/components/shell/online-avatars'
import { IconPicker } from '@/components/docs/icon-picker'

// Excalidraw is client-only — load the demo canvas (owns the Yjs binding) ssr:false.
const DemoWhiteboardCanvas = dynamic(
  () => import('./demo-whiteboard-canvas').then((m) => m.DemoWhiteboardCanvas),
  { ssr: false, loading: () => <div className="h-full w-full animate-pulse bg-surface" /> },
)

const STATUS_LABEL: Record<ProviderStatus, string> = { connecting: 'Connecting…', synced: 'Live', offline: 'Offline' }
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

/** Demo fork of WhiteboardView: useDemoYDoc (offline) + store-backed title/icon.
 *  Export is 100% client-side (exportToBlob/exportToSvg), reused verbatim. */
export function DemoWhiteboardView({
  whiteboardId,
  projectId,
  embedded = false,
}: {
  whiteboardId: string
  projectId: string
  embedded?: boolean
}) {
  const store = useDemo()
  const wb = store.getWhiteboard(whiteboardId)
  const memoUser = store.presenceUser

  const { ydoc, awareness, status, online } = useDemoYDoc({
    docType: 'whiteboard',
    docId: whiteboardId,
    user: memoUser,
  })

  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const [exportOpen, setExportOpen] = useState(false)

  const title = wb?.title ?? 'Untitled'
  const icon = wb?.icon ?? null

  const setTitle = (value: string) =>
    store.setWhiteboards((prev) => prev.map((w) => (w.id === whiteboardId ? { ...w, title: value } : w)))
  const setIcon = (value: string | null) =>
    store.setWhiteboards((prev) => prev.map((w) => (w.id === whiteboardId ? { ...w, icon: value } : w)))

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

  const canvas = useMemo(
    () => (
      <DemoWhiteboardCanvas
        key={whiteboardId}
        ydoc={ydoc}
        awareness={awareness}
        whiteboardId={whiteboardId}
        user={memoUser}
        embedded={embedded}
        onApiReady={(api) => {
          apiRef.current = api
        }}
      />
    ),
    [ydoc, awareness, whiteboardId, memoUser, embedded],
  )

  if (embedded) {
    return <div className="h-[480px] w-full">{canvas}</div>
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <Link
            href={`/demo/p/${projectId}`}
            className="shrink-0 truncate text-neutral-500 transition hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100"
          >
            Project
          </Link>
          <span className="shrink-0 text-neutral-300 dark:text-neutral-600">/</span>
          <IconPicker value={icon} onPick={setIcon} onRemove={() => setIcon(null)} />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
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

      <div className="min-h-0 flex-1">{canvas}</div>
    </div>
  )
}
