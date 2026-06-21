'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { IconPicker } from '@/components/docs/icon-picker'
import type { ActionState } from '@/lib/actions/workspace'

/** Editable emoji icon for a team or project. When `editable`, opens the shared
 *  IconPicker and persists via `action`, then router.refresh(). When not editable,
 *  renders the current emoji read-only (or nothing). */
export function EntityIcon({
  id,
  icon,
  editable,
  action,
  fallback,
}: {
  id: string
  icon: string | null
  editable: boolean
  action: (id: string, icon: string | null) => Promise<ActionState>
  fallback: string
}) {
  const router = useRouter()
  const [, start] = useTransition()

  const save = (next: string | null) =>
    start(async () => {
      await action(id, next)
      router.refresh()
    })

  if (!editable) {
    return <span className="text-4xl leading-none">{icon ?? fallback}</span>
  }

  return <IconPicker value={icon} onPick={(e) => save(e)} onRemove={() => save(null)} />
}
