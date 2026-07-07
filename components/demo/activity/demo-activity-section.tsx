'use client'

import { useDemo } from '@/lib/demo/context'
import { DemoTime } from '@/components/demo/demo-time'

const VERB: Record<string, string> = {
  created: 'created',
  renamed: 'renamed',
  trashed: 'moved to trash',
  restored: 'restored',
  deleted: 'deleted',
}

/** Demo fork of ActivitySection — reads the per-project feed from the store. */
export function DemoActivitySection({ projectId }: { projectId: string }) {
  const store = useDemo()
  const entries = store.getActivity(projectId)
  if (entries.length === 0) return null

  return (
    <div className="mt-10 border-t border-border pt-4">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Activity</p>
      <ul className="space-y-1.5">
        {entries.map((e) => (
          <li key={e.id} className="flex items-baseline gap-2 text-sm">
            <span className="text-neutral-700 dark:text-neutral-300">
              <span className="font-medium">{e.actorName}</span> {VERB[e.action] ?? e.action}{' '}
              {e.targetType} <span className="font-medium">{e.targetTitle}</span>
            </span>
            <DemoTime iso={e.createdAt} className="shrink-0 text-xs text-neutral-400" />
          </li>
        ))}
      </ul>
    </div>
  )
}
