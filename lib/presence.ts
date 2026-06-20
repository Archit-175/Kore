// Shared shape for "who's online" (Supabase Presence) and cursor labels
// (y-awareness). One type so the avatar stack and remote cursors agree.

export type PresenceUser = {
  id: string
  name: string
  color: string
  avatarUrl: string | null
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
