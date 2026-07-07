'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useDemo } from '@/lib/demo/context'
import { useDemoYDoc } from '@/lib/demo/use-demo-ydoc'
import { pageDisplayTitle, pageHref } from '@/lib/docs/types'
import { OnlineAvatars } from '@/components/shell/online-avatars'
import { IconPicker } from '@/components/docs/icon-picker'
import {
  PageTitleStore,
  PageTitleStoreContext,
  type PageTitleEntry,
} from '@/components/docs/page-titles-store'
import { DemoBacklinks } from './demo-backlinks'
import { DemoCommentsPanel } from '@/components/demo/comments/demo-comments-panel'

// BlockNote is client-only.
const DemoPageEditor = dynamic(() => import('./demo-page-editor').then((m) => m.DemoPageEditor), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse rounded-lg bg-surface" />,
})

export function DemoPageDocView({ pageId }: { pageId: string }) {
  const store = useDemo()
  const page = store.pageById(pageId)
  const project = page ? store.projectById(page.projectId) : undefined
  const memoUser = store.presenceUser

  const { ydoc, awareness, status, online } = useDemoYDoc({
    docType: 'page',
    docId: pageId,
    user: memoUser,
  })

  const titleStore = useMemo(() => new PageTitleStore(), [])
  const [showComments, setShowComments] = useState(false)

  // Feed the mention-chip title store from the in-memory page list.
  useEffect(() => {
    titleStore.setEntries(
      new Map<string, PageTitleEntry>(
        store.pages.map((p) => [p.id, { title: p.title, projectId: p.projectId }]),
      ),
    )
  }, [store.pages, titleStore])

  const children = store.pages.filter((p) => p.parentPageId === pageId && !p.trashedAt)
  const ancestors = useMemo(() => {
    const byId = new Map(store.pages.map((p) => [p.id, p]))
    const chain: { id: string; title: string }[] = []
    const seen = new Set<string>()
    let cur = page?.parentPageId ?? null
    while (cur && !seen.has(cur)) {
      seen.add(cur)
      const node = byId.get(cur)
      if (!node) break
      chain.unshift({ id: node.id, title: node.title })
      cur = node.parentPageId
    }
    return chain
  }, [store.pages, page?.parentPageId])

  if (!page) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-neutral-400">
        This page was deleted.
      </div>
    )
  }

  const setTitle = (value: string) =>
    store.setPages((prev) => prev.map((p) => (p.id === pageId ? { ...p, title: value } : p)))
  const setIcon = (value: string | null) =>
    store.setPages((prev) => prev.map((p) => (p.id === pageId ? { ...p, icon: value } : p)))

  const STATUS_COLOR = status === 'synced' ? 'bg-emerald-500' : 'bg-amber-400'
  const STATUS_LABEL = status === 'synced' ? 'Live' : 'Connecting…'

  return (
    <PageTitleStoreContext.Provider value={titleStore}>
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-3">
          <div className="flex min-w-0 items-center gap-1.5 text-sm">
            <Link
              href={`/demo/p/${page.projectId}`}
              className="shrink-0 truncate text-neutral-500 transition hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100"
            >
              {project?.name ?? 'Project'}
            </Link>
            {ancestors.map((a) => (
              <Fragment key={a.id}>
                <span className="shrink-0 text-neutral-300 dark:text-neutral-600">/</span>
                <Link
                  href={`/demo${pageHref(page.projectId, a.id)}`}
                  className="max-w-[10rem] truncate text-neutral-500 transition hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100"
                >
                  {pageDisplayTitle(a.title)}
                </Link>
              </Fragment>
            ))}
            <span className="shrink-0 text-neutral-300 dark:text-neutral-600">/</span>
            <span className="truncate font-medium">{page.title.trim() || 'Untitled'}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 text-xs text-neutral-500 sm:flex dark:text-neutral-400">
              <span className={`h-2 w-2 rounded-full ${STATUS_COLOR}`} />
              {STATUS_LABEL}
            </span>
            <OnlineAvatars users={online} />
            <button
              type="button"
              onClick={() => setShowComments((v) => !v)}
              aria-label="Toggle comments"
              title="Comments"
              className={`flex h-8 w-8 items-center justify-center rounded-md transition ${
                showComments
                  ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300'
                  : 'text-neutral-500 hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/10'
              }`}
            >
              <span className="text-base">💬</span>
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-3xl px-6 py-8">
              <div className="mb-1">
                <IconPicker value={page.icon} onPick={setIcon} onRemove={() => setIcon(null)} />
              </div>
              <input
                value={page.title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Untitled"
                className="mb-2 w-full bg-transparent text-3xl font-bold outline-none placeholder:text-neutral-300 dark:placeholder:text-neutral-600"
              />
              <DemoPageEditor
                key={pageId}
                ydoc={ydoc}
                awareness={awareness}
                pageId={pageId}
                projectId={page.projectId}
                user={memoUser}
              />

              {children.length > 0 && (
                <div className="mt-8">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                    Sub-pages
                  </p>
                  <ul className="space-y-0.5">
                    {children.map((c) => (
                      <li key={c.id}>
                        <Link
                          href={`/demo${pageHref(c.projectId, c.id)}`}
                          className="flex items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-sm transition hover:border-border hover:bg-surface"
                        >
                          <span className="text-base">{c.icon ?? '📄'}</span>
                          <span className="min-w-0 flex-1 truncate font-medium">
                            {pageDisplayTitle(c.title)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <DemoBacklinks pageId={pageId} />
            </div>
          </div>

          {showComments && (
            <aside className="hidden w-80 shrink-0 flex-col border-l border-border md:flex">
              <DemoCommentsPanel
                targetType="page"
                targetId={pageId}
                currentUserId={store.currentUserId}
                isOwner
                onClose={() => setShowComments(false)}
              />
            </aside>
          )}
        </div>

        {showComments && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowComments(false)} aria-hidden />
            <aside className="absolute right-0 top-0 flex h-full w-full max-w-sm flex-col border-l border-border bg-background shadow-xl">
              <DemoCommentsPanel
                targetType="page"
                targetId={pageId}
                currentUserId={store.currentUserId}
                isOwner
                onClose={() => setShowComments(false)}
              />
            </aside>
          </div>
        )}
      </div>
    </PageTitleStoreContext.Provider>
  )
}
