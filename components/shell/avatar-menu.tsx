'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { initials, type PresenceUser } from '@/lib/presence'
import { signOut } from '@/lib/actions/auth'

export function AvatarMenu({
  user,
  email,
  isOwner,
}: {
  user: PresenceUser
  email: string
  isOwner: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white"
        style={{ backgroundColor: user.color }}
        aria-label="Account menu"
      >
        {user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.avatarUrl} alt={user.name} className="h-full w-full rounded-full object-cover" />
        ) : (
          initials(user.name)
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-lg border border-border bg-background shadow-lg">
          <div className="border-b border-border px-3 py-2">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{email}</p>
          </div>
          {isOwner && (
            <Link
              href="/members"
              onClick={() => setOpen(false)}
              className="block px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
            >
              Manage members
            </Link>
          )}
          <form action={signOut}>
            <button
              type="submit"
              className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-black/5 dark:text-red-400 dark:hover:bg-white/5"
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
