'use client'

import Link from 'next/link'
import { useDemo } from '@/lib/demo/context'
import { pageDisplayTitle, pageHref } from '@/lib/docs/types'

/** Demo fork of Backlinks — reads the seeded backlink map from the store. */
export function DemoBacklinks({ pageId }: { pageId: string }) {
  const store = useDemo()
  const links = store.getBacklinks(pageId)
  if (links.length === 0) return null

  return (
    <div className="mt-10 border-t border-border pt-4">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
        Linked references ({links.length})
      </p>
      <ul className="space-y-0.5">
        {links.map((b) => (
          <li key={b.sourcePageId}>
            <Link
              href={`/demo${pageHref(b.projectId, b.sourcePageId)}`}
              className="flex items-center gap-2 rounded px-2 py-1 text-sm text-neutral-600 transition hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/5"
            >
              <span className="w-4 text-center text-xs">📄</span>
              <span className="truncate">{pageDisplayTitle(b.title)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
