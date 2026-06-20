import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getSignedUrls } from '@/lib/storage'
import { normalizeColor } from './colors'
import type { BoardData, BoardLabel, BoardNote, ChecklistItem } from './types'

type Supabase = SupabaseClient<Database>

/**
 * Load the entire notes board (all statuses — the client filters by tab) plus
 * the workspace's shared labels, with signed URLs minted for image attachments.
 *
 * Parameterized by the Supabase client so the SAME query runs server-side (SSR
 * initial render, server client) and client-side (realtime refetch, browser
 * client) — both RLS-gated. Order matches the migration's hot-path index:
 * pinned first, then most-recently-updated.
 */
export async function loadBoard(client: Supabase, workspaceId: string): Promise<BoardData> {
  const [notesRes, itemsRes, noteLabelsRes, labelsRes, attachmentsRes] = await Promise.all([
    client
      .from('notes')
      .select(
        'id, title, content, color, pinned, project_id, archived_at, trashed_at, created_by, created_at, updated_at',
      )
      .eq('workspace_id', workspaceId)
      .order('pinned', { ascending: false })
      .order('updated_at', { ascending: false }),
    client
      .from('note_checklist_items')
      .select('id, note_id, text, checked, position')
      .eq('workspace_id', workspaceId)
      .order('position', { ascending: true }),
    client.from('note_labels').select('note_id, label_id').eq('workspace_id', workspaceId),
    client
      .from('labels')
      .select('id, name, color')
      .eq('workspace_id', workspaceId)
      .order('name', { ascending: true }),
    client
      .from('attachments')
      .select('id, url, target_id, mime_type')
      .eq('workspace_id', workspaceId)
      .eq('target_type', 'note'),
  ])

  const noteRows = notesRes.data ?? []
  const itemRows = itemsRes.data ?? []
  const noteLabelRows = noteLabelsRes.data ?? []
  const labelRows = labelsRes.data ?? []
  const attachmentRows = attachmentsRes.data ?? []

  // Sign every attachment path once (batch), then stitch by note.
  const signed = await getSignedUrls(
    client,
    attachmentRows.map((a) => a.url),
  )

  // Group children by note id.
  const itemsByNote = new Map<string, ChecklistItem[]>()
  for (const it of itemRows) {
    const list = itemsByNote.get(it.note_id) ?? []
    list.push({ id: it.id, text: it.text, checked: it.checked, position: it.position })
    itemsByNote.set(it.note_id, list)
  }

  const labelIdsByNote = new Map<string, string[]>()
  for (const nl of noteLabelRows) {
    const list = labelIdsByNote.get(nl.note_id) ?? []
    list.push(nl.label_id)
    labelIdsByNote.set(nl.note_id, list)
  }

  const attachmentsByNote = new Map<string, BoardNote['attachments']>()
  for (const att of attachmentRows) {
    const list = attachmentsByNote.get(att.target_id) ?? []
    list.push({
      id: att.id,
      path: att.url,
      signedUrl: signed[att.url] ?? null,
      mimeType: att.mime_type,
    })
    attachmentsByNote.set(att.target_id, list)
  }

  const notes: BoardNote[] = noteRows.map((n) => ({
    id: n.id,
    title: n.title,
    content: n.content,
    color: normalizeColor(n.color),
    pinned: n.pinned,
    projectId: n.project_id,
    archivedAt: n.archived_at,
    trashedAt: n.trashed_at,
    createdBy: n.created_by,
    createdAt: n.created_at,
    updatedAt: n.updated_at,
    checklist: itemsByNote.get(n.id) ?? [],
    labelIds: labelIdsByNote.get(n.id) ?? [],
    attachments: attachmentsByNote.get(n.id) ?? [],
  }))

  const labels: BoardLabel[] = labelRows.map((l) => ({
    id: l.id,
    name: l.name,
    color: normalizeColor(l.color),
  }))

  return { notes, labels }
}
