import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { fromBase64, toBase64 } from './encoding'

type Supabase = SupabaseClient<Database>

/**
 * Load the latest full Yjs snapshot for a doc (or null if none yet).
 * Uses an RPC that returns base64, so the client never parses Postgres hex.
 */
export async function loadSnapshot(
  supabase: Supabase,
  docType: string,
  docId: string,
): Promise<Uint8Array | null> {
  const { data, error } = await supabase.rpc('load_yjs_snapshot', {
    p_doc_type: docType,
    p_doc_id: docId,
  })
  if (error || !data) return null
  return fromBase64(data)
}

/**
 * Persist the full merged doc state (last-writer-wins). Every snapshot is a
 * complete CRDT merge, so concurrent writes can't corrupt — last commit wins.
 */
export async function saveSnapshot(
  supabase: Supabase,
  docType: string,
  docId: string,
  workspaceId: string,
  state: Uint8Array,
): Promise<void> {
  await supabase.rpc('save_yjs_snapshot', {
    p_doc_type: docType,
    p_doc_id: docId,
    p_workspace_id: workspaceId,
    p_state_b64: toBase64(state),
  })
}
