import type { Awareness } from 'y-protocols/awareness'
import type { PresenceUser } from '@/lib/presence'

// Per-user color for cursors + avatars, derived deterministically from the
// user id so everyone agrees on a peer's color.
const PALETTE = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
]

export function userColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return PALETTE[Math.abs(hash) % PALETTE.length]
}

export type CursorRange = { anchor: number; head: number }

export type AwarenessState = {
  user: PresenceUser
  cursor?: CursorRange | null
}

/** A remote peer's awareness state keyed by their Yjs clientID. */
export type RemoteAwareness = { clientId: number } & AwarenessState

/** Read all awareness states except our own. */
export function getRemoteStates(
  awareness: Awareness,
  selfClientId: number,
): RemoteAwareness[] {
  const out: RemoteAwareness[] = []
  awareness.getStates().forEach((state, clientId) => {
    if (clientId === selfClientId) return
    const s = state as Partial<AwarenessState>
    if (!s.user) return
    out.push({ clientId, user: s.user, cursor: s.cursor ?? null })
  })
  return out
}
