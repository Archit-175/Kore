'use client'

import { useEffect, useState } from 'react'
import { timeAgo } from '@/lib/format-time'

/**
 * Renders `timeAgo(iso)` but only AFTER mount — the demo store is built on the
 * client, and `timeAgo`/`toLocaleDateString` are locale + Date.now() dependent,
 * so rendering it during SSR would risk a hydration mismatch (the same reason the
 * real chat uses a client-only ClockTime). Renders nothing on the server pass.
 */
export function DemoTime({ iso, className }: { iso: string; className?: string }) {
  const [text, setText] = useState('')
  useEffect(() => {
    // Render the (locale/now-dependent) label only after mount so it never
    // mismatches the SSR pass.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setText(timeAgo(iso))
  }, [iso])
  return <span className={className}>{text}</span>
}
