'use client'

import { Fragment, useEffect, useId, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useKoreYDoc } from '@/lib/yjs/use-kore-ydoc'
import { createClient } from '@/lib/supabase/client'
import { loadWorkspacePages } from '@/lib/docs/load-pages'
import { renamePage, updatePageIcon } from '@/lib/actions/pages'
import { touchRecent } from '@/lib/actions/workspace'
import { OnlineAvatars } from '@/components/shell/online-avatars'
import type { PresenceUser } from '@/lib/presence'
import type { ProviderStatus } from '@/lib/yjs/provider'
import { pageDisplayTitle, pageHref, type Backlink, type PageNode } from '@/lib/docs/types'
import { CommentsPanel } from '@/components/comments/comments-panel'
import { Backlinks } from './backlinks'
import { IconPicker } from './icon-picker'
import { PageTitleStore, PageTitleStoreContext, type PageTitleEntry } from './page-titles-store'

// BlockNote is client-only (Next.js 16 gotcha): load the editor with ssr:false.
const PageEditor = dynamic(() => import('./page-editor').then((m) => m.PageEditor), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse rounded-lg bg-surface" />,
})

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

export function PageDocView({
  page,
  user,
  workspaceId,
  isOwner,
  initialBacklinks,
}: {
  page: { id: string; projectId: string; projectName: string; title: string; icon: string | null }
  user: PresenceUser
  workspaceId: string
  isOwner: boolean
  initialBacklinks: Backlink[]
}) {
  const memoUser = useMemo(
    () => ({ id: user.id, name: user.name, color: user.color, avatarUrl: user.avatarUrl }),
    [user.id, user.name, user.color, user.avatarUrl],
  )

  // Same hook as the scratchpad — only docType differs. BlockNote binds to this
  // ydoc/awareness inside <PageEditor>.
  const { ydoc, awareness, status, online } = useKoreYDoc({
    docType: 'page',
    docId: page.id,
    workspaceId,
    user: memoUser,
  })

  const supabase = useMemo(() => createClient(), [])
  const store = useMemo(() => new PageTitleStore(), [])
  // Unique per mount so navigating page→page never reuses a still-closing channel.
  const channelId = useId().replace(/[^a-zA-Z0-9]/g, '')

  const [title, setTitle] = useState(page.title)
  const [icon, setIcon] = useState<string | null>(page.icon)
  const [showComments, setShowComments] = useState(false)
  const [children, setChildren] = useState<PageNode[]>([])
  // The parent-page chain (root → immediate parent) for the breadcrumb.
  const [ancestors, setAncestors] = useState<{ id: string; title: string }[]>([])
  const titleRef = useRef<HTMLInputElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    void touchRecent('page', page.id)
  }, [page.id])

  // Workspace-wide page titles: feeds the mention chips (live rename) AND keeps
  // this page's title input in sync with remote edits — but only when the input
  // isn't focused, so it never clobbers active typing (the notes-modal pattern).
  useEffect(() => {
    let channel: RealtimeChannel | null = null
    let cancelled = false
    let refetchTimer: ReturnType<typeof setTimeout> | null = null

    const refetch = async () => {
      const pages = await loadWorkspacePages(supabase, workspaceId)
      store.setEntries(
        new Map<string, PageTitleEntry>(
          pages.map((p) => [p.id, { title: p.title, projectId: p.projectId }]),
        ),
      )
      setChildren(pages.filter((p) => p.parentPageId === page.id))
      const self = pages.find((p) => p.id === page.id)
      if (self) {
        setIcon(self.icon)
        if (titleRef.current !== document.activeElement) {
          setTitle((cur) => (self.title !== cur ? self.title : cur))
        }
      }
      // Walk parent_page_id up to build the breadcrumb chain (cycle-guarded).
      const byId = new Map(pages.map((p) => [p.id, p]))
      const chain: { id: string; title: string }[] = []
      const seen = new Set<string>()
      let cur = self?.parentPageId ?? null
      while (cur && !seen.has(cur)) {
        seen.add(cur)
        const node = byId.get(cur)
        if (!node) break
        chain.unshift({ id: node.id, title: node.title })
        cur = node.parentPageId
      }
      setAncestors(chain)
    }
    const schedule = () => {
      if (refetchTimer) clearTimeout(refetchTimer)
      refetchTimer = setTimeout(() => void refetch(), 300)
    }

    void (async () => {
      await refetch()
      const { data } = await supabase.auth.getSession()
      await supabase.realtime.setAuth(data.session?.access_token ?? null)
      if (cancelled) return
      channel = supabase
        .channel(`pages:${workspaceId}:${channelId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'pages', filter: `workspace_id=eq.${workspaceId}` },
          schedule,
        )
        .subscribe()
    })()

    return () => {
      cancelled = true
      if (refetchTimer) clearTimeout(refetchTimer)
      if (channel) void supabase.removeChannel(channel)
    }
  }, [supabase, workspaceId, page.id, store, channelId])

  const onTitleChange = (value: string) => {
    setTitle(value)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => void renamePage(page.id, value), 500)
  }
  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    },
    [],
  )

  return (
    <PageTitleStoreContext.Provider value={store}>
      <div className="flex h-full flex-col">
        {/* Topbar: breadcrumb + sync status + who's-online */}
        <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-3">
          <div className="flex min-w-0 items-center gap-1.5 text-sm">
            <Link
              href={`/p/${page.projectId}`}
              className="shrink-0 truncate text-neutral-500 transition hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100"
            >
              {page.projectName}
            </Link>
            {ancestors.map((a) => (
              <Fragment key={a.id}>
                <span className="shrink-0 text-neutral-300 dark:text-neutral-600">/</span>
                <Link
                  href={pageHref(page.projectId, a.id)}
                  className="max-w-[10rem] truncate text-neutral-500 transition hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100"
                >
                  {pageDisplayTitle(a.title)}
                </Link>
              </Fragment>
            ))}
            <span className="shrink-0 text-neutral-300 dark:text-neutral-600">/</span>
            <span className="truncate font-medium">{title.trim() || 'Untitled'}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 text-xs text-neutral-500 sm:flex dark:text-neutral-400">
              <span className={`h-2 w-2 rounded-full ${STATUS_COLOR[status]}`} />
              {STATUS_LABEL[status]}
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

        {/* Body: document + (desktop) comments side panel */}
        <div className="flex min-h-0 flex-1">
          <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-6 py-8">
            <div className="mb-1">
              <IconPicker
                value={icon}
                onPick={(emoji) => {
                  setIcon(emoji)
                  void updatePageIcon(page.id, emoji)
                }}
                onRemove={() => {
                  setIcon(null)
                  void updatePageIcon(page.id, null)
                }}
              />
            </div>
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="Untitled"
              className="mb-2 w-full bg-transparent text-3xl font-bold outline-none placeholder:text-neutral-300 dark:placeholder:text-neutral-600"
            />
            <PageEditor
              key={page.id}
              ydoc={ydoc}
              awareness={awareness}
              pageId={page.id}
              projectId={page.projectId}
              workspaceId={workspaceId}
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
                        href={pageHref(c.projectId, c.id)}
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

            <Backlinks pageId={page.id} workspaceId={workspaceId} initial={initialBacklinks} />
            </div>
          </div>

          {showComments && (
            <aside className="hidden w-80 shrink-0 flex-col border-l border-border md:flex">
              <CommentsPanel
                targetType="page"
                targetId={page.id}
                workspaceId={workspaceId}
                currentUserId={user.id}
                isOwner={isOwner}
                onClose={() => setShowComments(false)}
              />
            </aside>
          )}
        </div>

        {/* Comments drawer (mobile) */}
        {showComments && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setShowComments(false)}
              aria-hidden
            />
            <aside className="absolute right-0 top-0 flex h-full w-full max-w-sm flex-col border-l border-border bg-background shadow-xl">
              <CommentsPanel
                targetType="page"
                targetId={page.id}
                workspaceId={workspaceId}
                currentUserId={user.id}
                isOwner={isOwner}
                onClose={() => setShowComments(false)}
              />
            </aside>
          </div>
        )}
      </div>
    </PageTitleStoreContext.Provider>
  )
}
