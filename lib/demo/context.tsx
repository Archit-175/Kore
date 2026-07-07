'use client'

import { createContext, useContext, useState, useSyncExternalStore } from 'react'
import { DemoStore } from './store'

/**
 * Holds the single DemoStore instance for the /demo route group. Created once per
 * page load with useRef (survives re-renders); a full refresh discards it, which
 * is exactly the "reset on refresh" behaviour — there is no persistence.
 */
const DemoStoreContext = createContext<DemoStore | null>(null)

export function DemoStoreProvider({ children }: { children: React.ReactNode }) {
  // Lazy-init once per page load (a refresh discards it ⇒ ephemeral by construction).
  const [store] = useState(() => new DemoStore())
  return <DemoStoreContext.Provider value={store}>{children}</DemoStoreContext.Provider>
}

/** The store instance (no subscription — use for calling mutators). */
export function useDemoStore(): DemoStore {
  const store = useContext(DemoStoreContext)
  if (!store) throw new Error('useDemoStore must be used inside <DemoStoreProvider>')
  return store
}

/**
 * Subscribe the calling component to ANY store change and return the store. The
 * snapshot is a monotonic version number, so React re-renders on every mutation;
 * components then read `store.notes` / `store.getDatabase(id)` etc. directly. The
 * dataset is tiny (an under-10-person demo), so subscribing broadly is fine.
 */
export function useDemo(): DemoStore {
  const store = useDemoStore()
  useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion)
  return store
}
