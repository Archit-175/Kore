'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { addTeamMember, removeTeamMember } from '@/lib/actions/workspace'
import { initials } from '@/lib/presence'
import { userColor } from '@/lib/yjs/awareness'
import { Spinner } from '@/components/spinner'
import type { DbMember } from '@/lib/databases/types'

function Avatar({ member }: { member: DbMember }) {
  return member.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={member.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
  ) : (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
      style={{ backgroundColor: userColor(member.id) }}
    >
      {initials(member.name)}
    </span>
  )
}

/** Team roster management (workspace owner only). Lists current members and lets
 *  the owner add workspace members to / remove them from the team. Each mutation
 *  runs the server action then router.refresh() so the list updates live. */
export function TeamMembers({
  teamId,
  members,
  candidates,
  canManage,
}: {
  teamId: string
  members: DbMember[]
  /** Active workspace members not yet on this team. */
  candidates: DbMember[]
  canManage: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = (fn: () => Promise<{ error?: string } | undefined>) =>
    start(async () => {
      setError(null)
      const res = await fn()
      if (res?.error) {
        setError(res.error)
        return
      }
      setPicking(false)
      router.refresh()
    })

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-500 dark:text-neutral-400">
          Members ({members.length})
        </h2>
        {canManage && candidates.length > 0 && (
          <button
            type="button"
            onClick={() => setPicking((v) => !v)}
            className="rounded-md px-2 py-1 text-xs font-medium text-indigo-600 transition hover:bg-indigo-500/10 dark:text-indigo-300"
          >
            + Add member
          </button>
        )}
      </div>

      {canManage && picking && (
        <div className="mb-3 rounded-lg border border-border bg-surface p-1">
          {candidates.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={pending}
              onClick={() => run(() => addTeamMember(teamId, c.id))}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-black/5 disabled:opacity-60 dark:hover:bg-white/5"
            >
              <Avatar member={c} />
              <span className="min-w-0 flex-1 truncate">{c.name}</span>
              {c.handle && <span className="text-xs text-neutral-400">@{c.handle}</span>}
            </button>
          ))}
        </div>
      )}

      {error && <p className="mb-2 text-xs text-red-500">{error}</p>}

      {members.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-5 text-sm text-neutral-400">
          No members yet.{canManage ? ' Add teammates to give them control of this team.' : ''}
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
              <Avatar member={m} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {m.name}
                  {m.handle && (
                    <span className="ml-1.5 font-normal text-neutral-400">@{m.handle}</span>
                  )}
                </p>
              </div>
              {canManage && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => removeTeamMember(teamId, m.id))}
                  className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-red-500 transition hover:bg-red-500/10 disabled:opacity-60"
                >
                  {pending && <Spinner className="h-3 w-3" />}
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
