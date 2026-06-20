// Client for the $0 cross-module search behind ⌘K. Calls the global_search RPC
// (ILIKE across notes/pages/databases/rows/whiteboards/messages, membership-gated
// server-side) and dedupes (multiple matching rows of one database collapse to a
// single database result, since the RPC maps each to its owning database).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type Supabase = SupabaseClient<Database>

export type SearchKind = 'note' | 'page' | 'database' | 'whiteboard' | 'message'

export type SearchResult = {
  kind: SearchKind
  id: string
  projectId: string | null
  title: string
  snippet: string | null
}

const KINDS: readonly string[] = ['note', 'page', 'database', 'whiteboard', 'message']

export async function globalSearch(
  client: Supabase,
  workspaceId: string,
  query: string,
): Promise<SearchResult[]> {
  const q = query.trim()
  if (!q) return []
  const { data, error } = await client.rpc('global_search', {
    p_workspace: workspaceId,
    p_query: q,
  })
  if (error || !data) return []

  const seen = new Set<string>()
  const out: SearchResult[] = []
  for (const r of data) {
    const kind = (KINDS.includes(r.kind) ? r.kind : 'page') as SearchKind
    const key = `${kind}:${r.id}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      kind,
      id: r.id,
      // The RPC types project_id as non-null, but messages return null at runtime.
      projectId: (r.project_id as string | null) ?? null,
      title: r.title,
      snippet: r.snippet,
    })
  }
  return out
}
