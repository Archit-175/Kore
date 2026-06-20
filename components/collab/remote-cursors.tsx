'use client'

import { useEffect, useState, type RefObject } from 'react'
import type { Awareness } from 'y-protocols/awareness'
import { getRemoteStates } from '@/lib/yjs/awareness'

// Transparent "mirror" layer behind the textarea. It re-renders the exact same
// text with matching box metrics, injecting a colored caret + name label at
// each remote peer's cursor index. Because text is transparent, only the carets
// show, perfectly aligned with the textarea's characters.
export function RemoteCursors({
  awareness,
  text,
  textareaRef,
  selfClientId,
  // re-render trigger when awareness changes
  version,
}: {
  awareness: Awareness
  text: string
  textareaRef: RefObject<HTMLTextAreaElement | null>
  selfClientId: number
  version: number
}) {
  const [scroll, setScroll] = useState({ top: 0, left: 0 })

  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    const onScroll = () => setScroll({ top: ta.scrollTop, left: ta.scrollLeft })
    ta.addEventListener('scroll', onScroll)
    return () => ta.removeEventListener('scroll', onScroll)
  }, [textareaRef])

  // version participates so lint/render know it's intentional
  void version

  const remotes = getRemoteStates(awareness, selfClientId).filter((r) => r.cursor)
  const sorted = [...remotes].sort((a, b) => a.cursor!.head - b.cursor!.head)

  const nodes: React.ReactNode[] = []
  let idx = 0
  sorted.forEach((r, i) => {
    const pos = Math.max(0, Math.min(r.cursor!.head, text.length))
    if (pos > idx) nodes.push(<span key={`t${i}`}>{text.slice(idx, pos)}</span>)
    nodes.push(
      <span key={`c${i}`} className="relative inline-block w-0 align-baseline">
        <span
          className="absolute bottom-0 left-0 h-[1.15em] w-[2px]"
          style={{ backgroundColor: r.user.color }}
        />
        <span
          className="absolute bottom-[1.15em] left-0 whitespace-nowrap rounded px-1 text-[10px] font-medium text-white"
          style={{ backgroundColor: r.user.color }}
        >
          {r.user.name}
        </span>
      </span>,
    )
    idx = pos
  })
  nodes.push(<span key="tail">{text.slice(idx)}</span>)

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden whitespace-pre-wrap break-words rounded-lg border border-transparent p-4 font-mono text-sm leading-6 text-transparent"
      style={{ transform: `translate(${-scroll.left}px, ${-scroll.top}px)` }}
    >
      {nodes}
    </div>
  )
}
