'use client'

import { useContext, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { pageDisplayTitle, pageHref } from '@/lib/docs/types'
import { PageTitleStoreContext } from '@/components/docs/page-titles-store'

const noopSubscribe = () => () => {}

/** Demo fork of MentionChip — identical, but navigates to the /demo route. */
export function DemoMentionChip({
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
    if (liveProjectId) router.push(`/demo${pageHref(liveProjectId, pageId)}`)
  }

  return (
    <span
      contentEditable={false}
      role="link"
      tabIndex={0}
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
