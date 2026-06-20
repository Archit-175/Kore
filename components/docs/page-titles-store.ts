'use client'

import { createContext } from 'react'

/**
 * A tiny external store of every page's current title (+ its project), fed by a
 * workspace-wide `pages` realtime subscription in PageDocView. Mention chips
 * read from it via useSyncExternalStore so they re-render the instant a target
 * page is renamed in another window — independent of whether BlockNote chooses
 * to re-render the inline node. Falls back to the title cached on the mention.
 */
export type PageTitleEntry = { title: string; projectId: string }

export class PageTitleStore {
  private entries = new Map<string, PageTitleEntry>()
  private listeners = new Set<() => void>()

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb)
    return () => {
      this.listeners.delete(cb)
    }
  }

  getEntry = (id: string): PageTitleEntry | undefined => this.entries.get(id)

  setEntries = (entries: Map<string, PageTitleEntry>): void => {
    this.entries = entries
    for (const l of this.listeners) l()
  }
}

export const PageTitleStoreContext = createContext<PageTitleStore | null>(null)
