'use client'

import { useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import type { Awareness } from 'y-protocols/awareness'
import { RemoteCursors } from './remote-cursors'

/**
 * Phase-1 verification surface: a plain-text scratchpad bound to a shared
 * Y.Text. It exercises the SAME provider + awareness pipeline that BlockNote
 * (docs) and Excalidraw (whiteboards) will reuse in later phases.
 */
export function Scratchpad({ ydoc, awareness }: { ydoc: Y.Doc; awareness: Awareness }) {
  const ytext = ydoc.getText('scratchpad')
  const [value, setValue] = useState(() => ytext.toString())
  const [awarenessVersion, setAwarenessVersion] = useState(0)
  const taRef = useRef<HTMLTextAreaElement>(null)

  // Y.Text -> textarea (initial value comes from the lazy useState above; the
  // doc is fresh per mount, so the observer catches all subsequent content).
  useEffect(() => {
    const observer = () => setValue(ytext.toString())
    ytext.observe(observer)
    return () => ytext.unobserve(observer)
  }, [ytext])

  // awareness -> re-render remote cursors
  useEffect(() => {
    const onChange = () => setAwarenessVersion((v) => v + 1)
    awareness.on('change', onChange)
    return () => awareness.off('change', onChange)
  }, [awareness])

  function pushCursor() {
    const ta = taRef.current
    if (!ta) return
    awareness.setLocalStateField('cursor', {
      anchor: ta.selectionStart,
      head: ta.selectionEnd,
    })
  }

  function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value
    const prev = ytext.toString()
    if (next === prev) return

    // Minimal diff (common prefix + suffix) so edits are character-level,
    // keeping other users' cursors meaningful instead of replacing the doc.
    let start = 0
    const minLen = Math.min(prev.length, next.length)
    while (start < minLen && prev[start] === next[start]) start++
    let endPrev = prev.length
    let endNext = next.length
    while (endPrev > start && endNext > start && prev[endPrev - 1] === next[endNext - 1]) {
      endPrev--
      endNext--
    }

    ydoc.transact(() => {
      if (endPrev > start) ytext.delete(start, endPrev - start)
      if (endNext > start) ytext.insert(start, next.slice(start, endNext))
    })
    setValue(next)
    pushCursor()
  }

  return (
    <div className="relative h-full">
      <RemoteCursors
        awareness={awareness}
        text={value}
        textareaRef={taRef}
        selfClientId={ydoc.clientID}
        version={awarenessVersion}
      />
      <textarea
        ref={taRef}
        value={value}
        onChange={onChange}
        onSelect={pushCursor}
        onKeyUp={pushCursor}
        onClick={pushCursor}
        spellCheck={false}
        placeholder="Type here. Open this project in a second browser window to see realtime sync, live cursors, and who's-online presence."
        className="relative h-full w-full resize-none whitespace-pre-wrap break-words rounded-lg border border-border bg-surface p-4 font-mono text-sm leading-6 text-foreground caret-foreground outline-none focus:border-indigo-500"
      />
    </div>
  )
}
