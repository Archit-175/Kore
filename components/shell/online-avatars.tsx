'use client'

import { initials, type PresenceUser } from '@/lib/presence'

export function OnlineAvatars({
  users,
  max = 5,
  size = 28,
}: {
  users: PresenceUser[]
  max?: number
  size?: number
}) {
  if (users.length === 0) return null
  const shown = users.slice(0, max)
  const extra = users.length - shown.length

  return (
    <div className="flex items-center">
      <div className="flex -space-x-2">
        {shown.map((u) => (
          <span
            key={u.id}
            title={u.name}
            style={{ width: size, height: size, backgroundColor: u.color }}
            className="flex items-center justify-center rounded-full border-2 border-background text-[10px] font-semibold text-white ring-0"
          >
            {u.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={u.avatarUrl}
                alt={u.name}
                className="h-full w-full rounded-full object-cover"
              />
            ) : (
              initials(u.name)
            )}
          </span>
        ))}
      </div>
      {extra > 0 && (
        <span className="ml-2 text-xs text-neutral-500 dark:text-neutral-400">
          +{extra}
        </span>
      )}
    </div>
  )
}
