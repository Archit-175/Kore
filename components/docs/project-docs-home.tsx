'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useWorkspaceTable } from '@/lib/realtime/workspace-tables'
import { loadProjectPages, loadTrashedPages } from '@/lib/docs/load-pages'
import { buildTree } from '@/lib/docs/tree'
import { pageDisplayTitle, pageHref, type PageNode, type PageTreeNode } from '@/lib/docs/types'
import {
  createPage,
  deletePagePermanent,
  emptyProjectTrash,
  restorePage,
} from '@/lib/actions/pages'
import {
  deleteProject,
  renameProject,
  toggleFavorite,
  touchRecent,
} from '@/lib/actions/workspace'
import { EntitySettingsMenu } from '@/components/shell/entity-settings-menu'
import { ProjectDatabasesSection } from '@/components/databases/project-databases-section'
import { ProjectWhiteboardsSection } from '@/components/whiteboards/project-whiteboards-section'
import { ActivitySection } from '@/components/activity/activity-section'
import { Spinner } from '@/components/spinner'

/** Depth-first flatten of the page tree so the home can render the whole
 *  hierarchy (parent + nested children) as one indented list. */
function flattenTree(nodes: PageTreeNode[], depth = 0): { node: PageTreeNode; depth: number }[] {
  const out: { node: PageTreeNode; depth: number }[] = []
  for (const n of nodes) {
    out.push({ node: n, depth })
    if (n.children.length > 0) out.push(...flattenTree(n.children, depth + 1))
  }
  return out
}

/**
 * The project's Docs home at /p/[projectId] — replaces the Phase-1 scratchpad
 * demo. Lists the project's top-level pages (live) + a "New page" button.
 * Opening a page navigates to /p/[projectId]/[pageId] (the BlockNote editor).
 */
export function ProjectDocsHome({
  projectId,
  projectName,
  teamName,
  workspaceId,
  isOwner,
  isFavorite,
  initialPages,
  initialTrashed,
}: {
  projectId: string
  projectName: string
  teamName: string
  workspaceId: string
  isOwner: boolean
  isFavorite: boolean
  initialPages: PageNode[]
  initialTrashed: PageNode[]
}) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const [pages, setPages] = useState<PageNode[]>(initialPages)
  const [trashed, setTrashed] = useState<PageNode[]>(initialTrashed)
  const [showTrash, setShowTrash] = useState(false)
  const [pending, startCreate] = useTransition()

  const topLevel = useMemo(() => buildTree(pages), [pages])

  // Trash shows only subtree ROOTS (a trashed page whose parent isn't also
  // trashed) — restoring/deleting a root carries its whole subtree.
  const trashedRoots = useMemo(() => {
    const ids = new Set(trashed.map((p) => p.id))
    return trashed.filter((p) => p.parentPageId === null || !ids.has(p.parentPageId))
  }, [trashed])

  useEffect(() => {
    void touchRecent('project', projectId)
  }, [projectId])

  // Live: a page created/renamed/trashed/restored anywhere shows up here too.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const doRefetch = useCallback(async () => {
    const [live, trash] = await Promise.all([
      loadProjectPages(supabase, workspaceId, projectId),
      loadTrashedPages(supabase, workspaceId, projectId),
    ])
    setPages(live)
    setTrashed(trash)
  }, [supabase, workspaceId, projectId])

  // Realtime via the ONE shared workspace channel (see lib/realtime/workspace-tables.ts).
  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void doRefetch(), 300)
  }, [doRefetch])
  useWorkspaceTable(workspaceId, 'pages', schedule)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const newPage = () => {
    startCreate(async () => {
      const res = await createPage({ projectId })
      if (res.id) router.push(pageHref(projectId, res.id))
    })
  }

  const onRestore = (id: string) => {
    setTrashed((prev) => prev.filter((p) => p.id !== id))
    void restorePage(id)
  }
  const onDeleteForever = (id: string) => {
    setTrashed((prev) => prev.filter((p) => p.id !== id))
    void deletePagePermanent(id)
  }
  const onEmptyTrash = () => {
    setTrashed([])
    void emptyProjectTrash(projectId)
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs text-neutral-400">{teamName}</p>
          <h1 className="flex items-center gap-2 truncate text-2xl font-bold">
            {projectName}
            <FavoriteButton projectId={projectId} initial={isFavorite} />
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={newPage}
            disabled={pending}
            className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60"
          >
            {pending ? <Spinner className="h-3.5 w-3.5" /> : '+'} {pending ? 'Creating…' : 'New page'}
          </button>
          <EntitySettingsMenu
            id={projectId}
            name={projectName}
            label="project"
            renameAction={renameProject}
            deleteAction={deleteProject}
            canDelete={isOwner}
            cascadeWarning="All pages, databases, and whiteboards in this project will be permanently deleted."
          />
        </div>
      </div>

      {topLevel.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-sm text-neutral-400">No pages yet.</p>
          <button
            type="button"
            onClick={newPage}
            disabled={pending}
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
                href={pageHref(projectId, node.id)}
                style={{ paddingLeft: depth * 22 + 12 }}
                className="flex items-center gap-2 rounded-lg border border-transparent py-2 pr-3 text-sm transition hover:border-border hover:bg-surface"
              >
                {depth > 0 && <span className="text-neutral-300 dark:text-neutral-600">└</span>}
                <span className="text-base">{node.icon ?? '📄'}</span>
                <span className="min-w-0 flex-1 truncate font-medium">
                  {pageDisplayTitle(node.title)}
                </span>
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
            {isOwner && showTrash && (
              <button
                type="button"
                onClick={onEmptyTrash}
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
                    onClick={() => onRestore(p.id)}
                    className="shrink-0 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-300"
                  >
                    Restore
                  </button>
                  {isOwner && (
                    <button
                      type="button"
                      onClick={() => onDeleteForever(p.id)}
                      className="shrink-0 text-xs text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ProjectDatabasesSection
        projectId={projectId}
        workspaceId={workspaceId}
        isOwner={isOwner}
      />

      <ProjectWhiteboardsSection
        projectId={projectId}
        workspaceId={workspaceId}
        isOwner={isOwner}
      />

      <ActivitySection projectId={projectId} workspaceId={workspaceId} />
    </div>
  )
}

function FavoriteButton({ projectId, initial }: { projectId: string; initial: boolean }) {
  const [fav, setFav] = useState(initial)
  const [, start] = useTransition()
  return (
    <button
      type="button"
      aria-label={fav ? 'Remove from favorites' : 'Add to favorites'}
      onClick={() => {
        setFav((v) => !v)
        start(() => {
          void toggleFavorite('project', projectId)
        })
      }}
      className={`text-lg leading-none transition ${
        fav ? 'text-amber-400' : 'text-neutral-300 hover:text-amber-400 dark:text-neutral-600'
      }`}
    >
      {fav ? '★' : '☆'}
    </button>
  )
}
