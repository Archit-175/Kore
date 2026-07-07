'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useDemo } from '@/lib/demo/context'
import { buildTree } from '@/lib/docs/tree'
import { pageDisplayTitle, pageHref, type PageTreeNode } from '@/lib/docs/types'
import { dbHref, databaseDisplayName } from '@/lib/databases/types'
import { wbHref, whiteboardDisplayName } from '@/lib/whiteboards/types'
import { IconPicker } from '@/components/docs/icon-picker'
import { DemoActivitySection } from '@/components/demo/activity/demo-activity-section'

function flattenTree(nodes: PageTreeNode[], depth = 0): { node: PageTreeNode; depth: number }[] {
  const out: { node: PageTreeNode; depth: number }[] = []
  for (const n of nodes) {
    out.push({ node: n, depth })
    if (n.children.length > 0) out.push(...flattenTree(n.children, depth + 1))
  }
  return out
}

/** Demo fork of ProjectDocsHome — store-backed pages/trash + db/whiteboard
 *  sections + activity. */
export function DemoProjectDocsHome({ projectId }: { projectId: string }) {
  const store = useDemo()
  const router = useRouter()
  const project = store.projectById(projectId)
  const team = store.teams.find((t) => t.id === project?.teamId)
  const [showTrash, setShowTrash] = useState(false)

  const projectPages = store.pages.filter((p) => p.projectId === projectId)
  const live = projectPages.filter((p) => !p.trashedAt)
  const trashed = projectPages.filter((p) => p.trashedAt)
  const topLevel = useMemo(() => buildTree(live), [live])
  const trashedRoots = useMemo(() => {
    const ids = new Set(trashed.map((p) => p.id))
    return trashed.filter((p) => p.parentPageId === null || !ids.has(p.parentPageId))
  }, [trashed])

  const databases = store.listDatabases(projectId).filter((d) => !d.trashedAt)
  const whiteboards = store.whiteboards.filter((w) => w.projectId === projectId && !w.trashedAt)

  const newPage = () => {
    const id = store.createPage(projectId)
    router.push(`/demo${pageHref(projectId, id)}`)
  }
  const setIcon = (value: string | null) =>
    store.setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, icon: value } : p)))

  const restore = (id: string) =>
    store.setPages((prev) => prev.map((p) => (p.id === id ? { ...p, trashedAt: null } : p)))
  const deleteForever = (id: string) => store.setPages((prev) => prev.filter((p) => p.id !== id))
  const emptyTrash = () => store.setPages((prev) => prev.filter((p) => !(p.projectId === projectId && p.trashedAt)))

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-neutral-400">
        This project was deleted.
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <IconPicker value={project.icon} onPick={setIcon} onRemove={() => setIcon(null)} />
          <div className="min-w-0">
            <p className="truncate text-xs text-neutral-400">{team?.name}</p>
            <h1 className="truncate text-2xl font-bold">{project.name}</h1>
          </div>
        </div>
        <button
          type="button"
          onClick={newPage}
          className="shrink-0 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-500"
        >
          + New page
        </button>
      </div>

      {topLevel.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-sm text-neutral-400">No pages yet.</p>
          <button
            type="button"
            onClick={newPage}
            className="mt-2 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-300"
          >
            Create the first page
          </button>
        </div>
      ) : (
        <ul className="space-y-0.5">
          {flattenTree(topLevel).map(({ node, depth }) => (
            <li key={node.id}>
              <Link
                href={`/demo${pageHref(projectId, node.id)}`}
                style={{ paddingLeft: depth * 22 + 12 }}
                className="flex items-center gap-2 rounded-lg border border-transparent py-2 pr-3 text-sm transition hover:border-border hover:bg-surface"
              >
                {depth > 0 && <span className="text-neutral-300 dark:text-neutral-600">└</span>}
                <span className="text-base">{node.icon ?? '📄'}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{pageDisplayTitle(node.title)}</span>
                {node.children.length > 0 && (
                  <span className="shrink-0 text-xs text-neutral-400">
                    {node.children.length} sub-page{node.children.length === 1 ? '' : 's'}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {trashed.length > 0 && (
        <div className="mt-10 border-t border-border pt-4">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowTrash((v) => !v)}
              className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-400 transition hover:text-neutral-600 dark:hover:text-neutral-300"
            >
              <span className="text-[10px]">{showTrash ? '▾' : '▸'}</span>
              Trash ({trashedRoots.length})
            </button>
            {showTrash && (
              <button
                type="button"
                onClick={emptyTrash}
                className="rounded px-2 py-0.5 text-xs text-red-600 transition hover:bg-red-500/10"
              >
                Empty trash
              </button>
            )}
          </div>
          {showTrash && (
            <ul className="mt-2 space-y-0.5">
              {trashedRoots.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <span className="text-base">{p.icon ?? '📄'}</span>
                  <span className="min-w-0 flex-1 truncate text-neutral-500 line-through dark:text-neutral-400">
                    {pageDisplayTitle(p.title)}
                  </span>
                  <button
                    type="button"
                    onClick={() => restore(p.id)}
                    className="shrink-0 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-300"
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteForever(p.id)}
                    className="shrink-0 text-xs text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {databases.length > 0 && (
        <div className="mt-10">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Databases</p>
          <ul className="space-y-0.5">
            {databases.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/demo${dbHref(projectId, d.id)}`}
                  className="flex items-center gap-2 rounded-lg border border-transparent py-2 pl-3 pr-3 text-sm transition hover:border-border hover:bg-surface"
                >
                  <span className="text-base">{d.icon ?? '🗄'}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{databaseDisplayName(d.name)}</span>
                  <span className="shrink-0 text-xs text-neutral-400">{d.rowCount} rows</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {whiteboards.length > 0 && (
        <div className="mt-8">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Whiteboards</p>
          <ul className="space-y-0.5">
            {whiteboards.map((w) => (
              <li key={w.id}>
                <Link
                  href={`/demo${wbHref(projectId, w.id)}`}
                  className="flex items-center gap-2 rounded-lg border border-transparent py-2 pl-3 pr-3 text-sm transition hover:border-border hover:bg-surface"
                >
                  <span className="text-base">{w.icon ?? '🎨'}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{whiteboardDisplayName(w.title)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <DemoActivitySection projectId={projectId} />
    </div>
  )
}
