// Aggregate types for the workspace-wide team chat. Plain rows on Supabase
// Postgres Changes (the notes/databases pattern) — NOT Yjs.

export type ChatAttachment = { path: string; mime: string; name: string; size: number }

export type ChatReaction = { emoji: string; count: number; mine: boolean }

/** A truncated preview of the quoted (replied-to) message, resolved at load time
 *  — may be null if the parent was moderated away (parent_message_id → SET NULL). */
export type QuotedParent = { id: string; authorName: string; body: string }

export type ChatMessage = {
  id: string
  authorId: string
  authorName: string
  authorAvatarUrl: string | null
  body: string
  parentMessageId: string | null
  quoted: QuotedParent | null
  mentions: string[]
  attachments: ChatAttachment[]
  reactions: ChatReaction[]
  editedAt: string | null
  createdAt: string
}

export type ChatPage = {
  messages: ChatMessage[] // ascending (oldest first) for render
  hasMore: boolean // older messages exist beyond the loaded window
  oldestCursor: { createdAt: string; id: string } | null
}

/** Reactions offered by the inline picker (a static set — $0, no emoji lib). */
export const REACTION_EMOJI = ['👍', '❤️', '😂', '🎉', '👀', '🙏', '🔥', '✅'] as const
