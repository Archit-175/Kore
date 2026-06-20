// Data loaders for team chat. Run against an RLS-gated Supabase client (server
// client in the RSC route, browser client for the realtime refetch) so they need
// no auth logic of their own — RLS scopes every row to workspace members.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { ChatAttachment, ChatMessage, ChatPage, ChatReaction } from './types'

type Supabase = SupabaseClient<Database>

export const CHAT_PAGE_SIZE = 30

const MESSAGE_COLS =
  'id, author_id, body, parent_message_id, mentions, attachments, edited_at, created_at'

type MessageRow = {
  id: string
  author_id: string
  body: string
  parent_message_id: string | null
  mentions: string[]
  attachments: unknown
  edited_at: string | null
  created_at: string
}

function parseAttachments(raw: unknown): ChatAttachment[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((a): a is Record<string, unknown> => typeof a === 'object' && a !== null)
    .map((a) => ({
      path: String(a.path ?? ''),
      mime: String(a.mime ?? ''),
      name: String(a.name ?? 'file'),
      size: Number(a.size ?? 0),
    }))
    .filter((a) => a.path)
}

type ProfileInfo = { name: string; avatarUrl: string | null }

async function loadProfileMap(client: Supabase, ids: string[]): Promise<Map<string, ProfileInfo>> {
  const map = new Map<string, ProfileInfo>()
  if (ids.length === 0) return map
  const { data } = await client
    .from('profiles')
    .select('id, full_name, email, avatar_url')
    .in('id', ids)
  for (const p of data ?? []) {
    map.set(p.id, { name: p.full_name || p.email || 'Member', avatarUrl: p.avatar_url })
  }
  return map
}

async function loadReactionMap(
  client: Supabase,
  messageIds: string[],
  currentUserId: string,
): Promise<Map<string, ChatReaction[]>> {
  const map = new Map<string, ChatReaction[]>()
  if (messageIds.length === 0) return map
  const { data } = await client
    .from('message_reactions')
    .select('message_id, emoji, user_id')
    .in('message_id', messageIds)
  const byMsg = new Map<string, Map<string, { count: number; mine: boolean }>>()
  for (const r of data ?? []) {
    let emojis = byMsg.get(r.message_id)
    if (!emojis) {
      emojis = new Map()
      byMsg.set(r.message_id, emojis)
    }
    const cur = emojis.get(r.emoji) ?? { count: 0, mine: false }
    cur.count += 1
    if (r.user_id === currentUserId) cur.mine = true
    emojis.set(r.emoji, cur)
  }
  for (const [msgId, emojis] of byMsg) {
    map.set(
      msgId,
      [...emojis.entries()].map(([emoji, v]) => ({ emoji, count: v.count, mine: v.mine })),
    )
  }
  return map
}

/** Turn an ASCENDING set of message rows into full ChatMessages (reactions,
 *  quoted parents — possibly outside the window — and author profiles). */
async function hydrate(
  client: Supabase,
  asc: MessageRow[],
  currentUserId: string,
): Promise<ChatMessage[]> {
  const ids = asc.map((r) => r.id)
  const reactionMap = await loadReactionMap(client, ids, currentUserId)

  const parentIds = [
    ...new Set(asc.map((r) => r.parent_message_id).filter((x): x is string => Boolean(x))),
  ]
  const parentsById = new Map<string, { id: string; authorId: string; body: string }>()
  if (parentIds.length) {
    const { data: parents } = await client
      .from('messages')
      .select('id, author_id, body')
      .in('id', parentIds)
    for (const p of parents ?? []) {
      parentsById.set(p.id, { id: p.id, authorId: p.author_id, body: p.body })
    }
  }

  const authorIds = new Set<string>()
  for (const r of asc) authorIds.add(r.author_id)
  for (const p of parentsById.values()) authorIds.add(p.authorId)
  const profiles = await loadProfileMap(client, [...authorIds])

  return asc.map((r) => {
    const prof = profiles.get(r.author_id)
    const parent = r.parent_message_id ? parentsById.get(r.parent_message_id) : undefined
    return {
      id: r.id,
      authorId: r.author_id,
      authorName: prof?.name ?? 'Member',
      authorAvatarUrl: prof?.avatarUrl ?? null,
      body: r.body,
      parentMessageId: r.parent_message_id,
      quoted: parent
        ? {
            id: parent.id,
            authorName: profiles.get(parent.authorId)?.name ?? 'Member',
            body: parent.body,
          }
        : null,
      mentions: (r.mentions ?? []) as string[],
      attachments: parseAttachments(r.attachments),
      reactions: reactionMap.get(r.id) ?? [],
      editedAt: r.edited_at,
      createdAt: r.created_at,
    }
  })
}

/**
 * Newest page (or the next OLDER page via the `before` keyset cursor) — used for
 * the initial load and infinite scroll-up. Returns ascending for render.
 */
export async function loadChatMessages(
  client: Supabase,
  workspaceId: string,
  currentUserId: string,
  opts: { limit?: number; before?: { createdAt: string; id: string } } = {},
): Promise<ChatPage> {
  const limit = Math.max(1, opts.limit ?? CHAT_PAGE_SIZE)
  let q = client
    .from('messages')
    .select(MESSAGE_COLS)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit)
  if (opts.before) {
    q = q.or(
      `created_at.lt.${opts.before.createdAt},and(created_at.eq.${opts.before.createdAt},id.lt.${opts.before.id})`,
    )
  }
  const { data: rows } = await q
  const list = (rows ?? []) as MessageRow[]
  const hasMore = list.length === limit
  const asc = [...list].reverse()
  const messages = await hydrate(client, asc, currentUserId)
  const oldest = asc[0]
  return {
    messages,
    hasMore,
    oldestCursor: oldest
      ? { createdAt: oldest.created_at, id: oldest.id }
      : (opts.before ?? null),
  }
}

/**
 * Reload the currently-loaded window (everything from the oldest loaded message
 * to now, ascending). Used by the realtime refetch: it reflects inserts/edits/
 * deletes/reactions across the window AND keeps the top anchored (a fixed-count
 * reload would drop the oldest visible rows once new ones arrive). Caller keeps
 * its own `hasMore`/`oldestCursor` (this never queries older than the anchor).
 */
export async function loadChatWindow(
  client: Supabase,
  workspaceId: string,
  currentUserId: string,
  from: { createdAt: string; id: string },
): Promise<ChatMessage[]> {
  const { data: rows } = await client
    .from('messages')
    .select(MESSAGE_COLS)
    .eq('workspace_id', workspaceId)
    .gte('created_at', from.createdAt)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(1000)
  return hydrate(client, (rows ?? []) as MessageRow[], currentUserId)
}

/** The user's read cursor (last_read_message_id) for the channel. */
export async function loadReadCursor(
  client: Supabase,
  workspaceId: string,
  userId: string,
): Promise<string | null> {
  const { data } = await client
    .from('message_reads')
    .select('last_read_message_id')
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  return data?.last_read_message_id ?? null
}

/** Count of messages from OTHERS newer than the user's read cursor — the unread
 *  badge. Capped at `cap` (a "99+" style ceiling). */
export async function loadUnreadCount(
  client: Supabase,
  workspaceId: string,
  userId: string,
  cap = 99,
): Promise<number> {
  const lastReadId = await loadReadCursor(client, workspaceId, userId)
  let after: string | null = null
  if (lastReadId) {
    const { data } = await client
      .from('messages')
      .select('created_at')
      .eq('id', lastReadId)
      .maybeSingle()
    after = data?.created_at ?? null
  }
  let q = client
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .neq('author_id', userId)
  if (after) q = q.gt('created_at', after)
  const { count } = await q
  return Math.min(count ?? 0, cap)
}
