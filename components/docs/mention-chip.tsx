'use client'

import { useContext, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { pageDisplayTitle, pageHref } from '@/lib/docs/types'
import { PageTitleStoreContext } from './page-titles-store'

const noopSubscribe = () => () => {}

/** The clickable @-mention chip rendered inside the editor. Shows the target
 *  page's LIVE title (via the store) so a remote rename updates it instantly,
 *  falling back to the title cached on the mention at insert time. */
export function MentionChip({
  pageId,
  title,
  projectId,
}: {
  pageId: string
  title: string
  projectId: string
}) {
  const router = useRouter()
  const store = useContext(PageTitleStoreContext)

  const liveTitle = useSyncExternalStore(
    store ? store.subscribe : noopSubscribe,
    () => store?.getEntry(pageId)?.title ?? title,
    () => title,
  )
  const liveProjectId = store?.getEntry(pageId)?.projectId ?? projectId

  const go = () => {
    if (liveProjectId) router.push(pageHref(liveProjectId, pageId))
  }

  return (
    <span
      contentEditable={false}
      role="link"
      tabIndex={0}
      // Don't let the click move the editor selection; just navigate.
      onMouseDown={(e) => e.preventDefault()}
      onClick={go}
      onKeyDown={(e) => {
        if (e.key === 'Enter') go()
      }}
      className="mx-0.5 cursor-pointer rounded px-1 font-medium text-indigo-600 transition hover:bg-indigo-500/10 dark:text-indigo-300"
    >
      @{pageDisplayTitle(liveTitle)}
    </span>
  )
}
