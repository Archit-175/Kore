// Comments live on a Docs page or a Note card (polymorphic target). Plain rows on
// Supabase Postgres Changes (the notes/databases pattern) — NOT Yjs.

export type CommentTarget = 'page' | 'note'

export type CommentItem = {
  id: string
  authorId: string
  authorName: string
  authorAvatarUrl: string | null
  body: string
  mentions: string[]
  createdAt: string
  edited: boolean
}
