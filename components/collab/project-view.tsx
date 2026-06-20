'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useKoreYDoc } from '@/lib/yjs/use-kore-ydoc'
import { toggleFavorite, touchRecent } from '@/lib/actions/workspace'
import { OnlineAvatars } from '@/components/shell/online-avatars'
import type { PresenceUser } from '@/lib/presence'
import type { ProviderStatus } from '@/lib/yjs/provider'
import { Scratchpad } from './scratchpad'

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

export function ProjectView({
  project,
  user,
  workspaceId,
  isFavorite,
}: {
  project: { id: string; name: string; teamName: string }
  user: PresenceUser
  workspaceId: string
  isFavorite: boolean
}) {
  const memoUser = useMemo(
    () => ({
      id: user.id,
      name: user.name,
      color: user.color,
      avatarUrl: user.avatarUrl,
    }),
    [user.id, user.name, user.color, user.avatarUrl],
  )

  const { ydoc, awareness, status, online } = useKoreYDoc({
    docType: 'scratchpad',
    docId: project.id,
    workspaceId,
    user: memoUser,
  })

  useEffect(() => {
    void touchRecent('project', project.id)
  }, [project.id])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-3">
        <div className="min-w-0">
          <p className="truncate text-xs text-neutral-400">{project.teamName}</p>
          <h1 className="truncate text-lg font-semibold">{project.name}</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
            <span className={`h-2 w-2 rounded-full ${STATUS_COLOR[status]}`} />
            {STATUS_LABEL[status]}
          </span>
          <OnlineAvatars users={online} />
          <FavoriteButton projectId={project.id} initial={isFavorite} />
        </div>
      </div>

      <div className="min-h-0 flex-1 p-4 sm:p-6">
        <Scratchpad ydoc={ydoc} awareness={awareness} />
      </div>
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
