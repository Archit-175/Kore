import { Fragment, type ReactNode } from 'react'

/**
 * Member @-mentions for the chat + comments textareas (people, NOT the Phase-3
 * page mentions which live inside BlockNote). A mention is stored TWO ways:
 *  - in the `body` text as a literal `@Display Name ` token (so the message round-
 *    trips as plain text and renders without parsing ambiguity), AND
 *  - in a `mentions uuid[]` column (the semantic source of truth — validated
 *    server-side against active members; future notifications key off it).
 *
 * Both `extractMentionIds` (write path) and `renderMessageBody` (read path) use
 * the SAME greedy scanner: at each `@`, match the LONGEST member name the
 * following text starts with (case-insensitive, on a word boundary). Longest-
 * first disambiguates names that are prefixes of others ("An" vs "Anna") and
 * lets names contain spaces ("Archit Savaliya").
 */

export type MentionMember = { id: string; name: string; avatarUrl: string | null }

type Segment = { type: 'text'; text: string } | { type: 'mention'; member: MentionMember }

const WORD = /[\p{L}\p{N}_]/u

function isWordBoundary(rest: string, len: number): boolean {
  const next = rest[len]
  return next === undefined || !WORD.test(next)
}

/** Split a body into plain-text + matched-member segments. */
function scanBody(text: string, members: MentionMember[]): Segment[] {
  const named = members.filter((m) => m.name.trim().length > 0)
  // Greedy: try the longest names first so "@Anna Lee" wins over "@Anna".
  const sorted = [...named].sort((a, b) => b.name.length - a.name.length)
  const segments: Segment[] = []
  let buf = ''
  let i = 0
  while (i < text.length) {
    // Only an `@` at the start or after whitespace/`(` opens a mention — matches
    // the textarea picker's trigger, so `email@Anna` isn't treated as a mention.
    const atBoundary = i === 0 || /[\s(]/.test(text[i - 1])
    if (text[i] === '@' && atBoundary) {
      const rest = text.slice(i + 1)
      const lower = rest.toLowerCase()
      const match = sorted.find(
        (m) => lower.startsWith(m.name.toLowerCase()) && isWordBoundary(rest, m.name.length),
      )
      if (match) {
        if (buf) {
          segments.push({ type: 'text', text: buf })
          buf = ''
        }
        segments.push({ type: 'mention', member: match })
        i += 1 + match.name.length
        continue
      }
    }
    buf += text[i]
    i += 1
  }
  if (buf) segments.push({ type: 'text', text: buf })
  return segments
}

/** Unique ids of every member @-mentioned in `text` (the write path). */
export function extractMentionIds(text: string, members: MentionMember[]): string[] {
  const ids = new Set<string>()
  for (const seg of scanBody(text, members)) {
    if (seg.type === 'mention') ids.add(seg.member.id)
  }
  return [...ids]
}

/** Render a message/comment body with @-mentions as highlighted chips. Plain text
 *  otherwise (whitespace preserved by the caller's `whitespace-pre-wrap`). */
export function renderMessageBody(text: string, members: MentionMember[]): ReactNode {
  const segments = scanBody(text, members)
  return segments.map((seg, idx) =>
    seg.type === 'mention' ? (
      <span
        key={idx}
        className="rounded bg-indigo-500/10 px-1 font-medium text-indigo-600 dark:text-indigo-300"
      >
        @{seg.member.name}
      </span>
    ) : (
      <Fragment key={idx}>{seg.text}</Fragment>
    ),
  )
}
