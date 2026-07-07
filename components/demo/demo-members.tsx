'use client'

import { useDemo } from '@/lib/demo/context'
import { initials } from '@/lib/presence'

/** Demo fork of the members page — a static roster from the store. */
export function DemoMembers() {
  const store = useDemo()
  const online = new Set([store.presenceUser.id, ...store.onlinePeers.map((p) => p.id)])

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Members</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          {store.members.length} people in {store.workspace.name}
        </p>
      </header>

      <ul className="divide-y divide-border rounded-xl border border-border">
        {store.members.map((m, i) => (
          <li key={m.id} className="flex items-center gap-3 px-4 py-3">
            <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-indigo-500 text-xs font-semibold text-white">
              {m.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.avatarUrl} alt={m.name} className="h-full w-full object-cover" />
              ) : (
                initials(m.name)
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {m.name}
                {m.id === store.currentUserId && (
                  <span className="ml-1.5 text-xs font-normal text-neutral-400">(you)</span>
                )}
              </p>
              <p className="truncate text-xs text-neutral-400">@{m.handle}</p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                i === 0
                  ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300'
                  : 'bg-black/5 text-neutral-500 dark:bg-white/10 dark:text-neutral-300'
              }`}
            >
              {i === 0 ? 'Owner' : 'Editor'}
            </span>
            {online.has(m.id) && (
              <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" title="Online" />
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
