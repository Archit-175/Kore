'use server'

import { createClient } from '@/lib/supabase/server'
import { requireMember, requireOwner, verifySession } from '@/lib/dal'
import { logActivity, type ActivityAction } from '@/lib/actions/activity'
import { normalizeColor } from '@/lib/notes/colors'
import { NOTE_BUCKET } from '@/lib/storage'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * Notes Server Actions — the real authz boundary (gate via the DAL; RLS double-
 * checks). Conventions copied from lib/actions/workspace.ts: stamp workspace_id
 * from membership (never client input) + created_by from the session, return
 * { error } on failure.
 *
 * NO revalidatePath here: the notes board is a client component that owns its own
 * realtime (Postgres Changes) + optimistic state, so revalidating the shell on
 * every edit would cause reload churn and fight the optimistic UI.
 */

type Supabase = SupabaseClient<Database>
type Result = { error?: string }
type CreateResult = { error?: string; id?: string }

/** Log a coarse activity event for a note — only when it's filed under a project
 *  (the activity feed is per-project; workspace-wide notes are skipped). */
async function logNoteEventById(id: string, action: ActivityAction): Promise<void> {
  const membership = await requireMember()
  const user = await verifySession()
  const supabase = await createClient()
  const { data } = await supabase
    .from('notes')
    .select('project_id, title')
    .eq('id', id)
    .eq('workspace_id', membership.workspaceId)
    .maybeSingle()
  if (!data?.project_id) return
  await logActivity(supabase, {
    workspaceId: membership.workspaceId,
    projectId: data.project_id,
    actorId: user.id,
    action,
    targetType: 'note',
    targetId: id,
    targetTitle: data.title || 'Untitled',
  })
}

// ----------------------------------------------------------------------------
// Notes
// ----------------------------------------------------------------------------
export async function createNote(input: {
  title?: string
  content?: string
  color?: string
  pinned?: boolean
  projectId?: string | null
}): Promise<CreateResult> {
  const membership = await requireMember()
  const user = await verifySession()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('notes')
    .insert({
      workspace_id: membership.workspaceId,
      project_id: input.projectId ?? null,
      title: (input.title ?? '').trim(),
      content: input.content ?? '',
      color: normalizeColor(input.color),
      pinned: input.pinned ?? false,
      created_by: user.id,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }
  if (input.projectId) {
    // Only log when the project is genuinely in this workspace (don't let a
    // client-supplied foreign project_id land in activity_log — M1).
    const { data: proj } = await supabase
      .from('projects')
      .select('id')
      .eq('id', input.projectId)
      .eq('workspace_id', membership.workspaceId)
      .maybeSingle()
    if (proj) {
      await logActivity(supabase, {
        workspaceId: membership.workspaceId,
        projectId: input.projectId,
        actorId: user.id,
        action: 'created',
        targetType: 'note',
        targetId: data.id,
        targetTitle: (input.title ?? '').trim() || 'Untitled',
      })
    }
  }
  return { id: data.id }
}

export async function updateNote(
  id: string,
  patch: {
    title?: string
    content?: string
    color?: string
    pinned?: boolean
    projectId?: string | null
  },
): Promise<Result> {
  await requireMember()
  const supabase = await createClient()

  const update: Database['public']['Tables']['notes']['Update'] = {}
  if (patch.title !== undefined) update.title = patch.title
  if (patch.content !== undefined) update.content = patch.content
  if (patch.color !== undefined) update.color = normalizeColor(patch.color)
  if (patch.pinned !== undefined) update.pinned = patch.pinned
  if (patch.projectId !== undefined) update.project_id = patch.projectId
  if (Object.keys(update).length === 0) return {}

  const { error } = await supabase.from('notes').update(update).eq('id', id)
  return error ? { error: error.message } : {}
}

async function setNoteTimestamp(
  id: string,
  column: 'archived_at' | 'trashed_at',
  value: string | null,
): Promise<Result> {
  await requireMember()
  const supabase = await createClient()
  const update: Database['public']['Tables']['notes']['Update'] =
    column === 'archived_at' ? { archived_at: value } : { trashed_at: value }
  const { error } = await supabase.from('notes').update(update).eq('id', id)
  return error ? { error: error.message } : {}
}

export async function archiveNote(id: string): Promise<Result> {
  return setNoteTimestamp(id, 'archived_at', new Date().toISOString())
}
export async function unarchiveNote(id: string): Promise<Result> {
  return setNoteTimestamp(id, 'archived_at', null)
}
export async function trashNote(id: string): Promise<Result> {
  const res = await setNoteTimestamp(id, 'trashed_at', new Date().toISOString())
  if (!res.error) await logNoteEventById(id, 'trashed')
  return res
}
export async function restoreNote(id: string): Promise<Result> {
  const res = await setNoteTimestamp(id, 'trashed_at', null)
  if (!res.error) await logNoteEventById(id, 'restored')
  return res
}

/** Permanent delete — owner-only (mirrors projects_delete). Also purges the
 * note's image objects + attachment rows (no FK cascade for generic attachments). */
export async function deleteNotePermanent(id: string): Promise<Result> {
  await requireOwner()
  const supabase = await createClient()
  // Snapshot the event BEFORE the row is gone (only logs if project-filed).
  await logNoteEventById(id, 'deleted')
  await purgeAttachmentsFor(supabase, [id])
  const { error } = await supabase.from('notes').delete().eq('id', id)
  return error ? { error: error.message } : {}
}

/** Empty trash — owner-only. Purges attachments of all trashed notes, then the
 * owner-gated RPC hard-deletes them. */
export async function emptyTrash(): Promise<Result> {
  const membership = await requireOwner()
  const supabase = await createClient()
  const { data: trashed } = await supabase
    .from('notes')
    .select('id')
    .eq('workspace_id', membership.workspaceId)
    .not('trashed_at', 'is', null)
  await purgeAttachmentsFor(supabase, (trashed ?? []).map((n) => n.id))
  const { error } = await supabase.rpc('empty_trash')
  return error ? { error: error.message } : {}
}

/** Best-effort cleanup of storage objects + attachment rows for the given notes. */
async function purgeAttachmentsFor(supabase: Supabase, noteIds: string[]): Promise<void> {
  if (noteIds.length === 0) return
  const { data } = await supabase
    .from('attachments')
    .select('id, url')
    .eq('target_type', 'note')
    .in('target_id', noteIds)
  const rows = data ?? []
  if (rows.length === 0) return
  await supabase.storage.from(NOTE_BUCKET).remove(rows.map((r) => r.url))
  await supabase
    .from('attachments')
    .delete()
    .in(
      'id',
      rows.map((r) => r.id),
    )
}

// ----------------------------------------------------------------------------
// Checklist items
// ----------------------------------------------------------------------------
export async function addChecklistItem(
  noteId: string,
  text: string,
  position: number,
): Promise<CreateResult> {
  const membership = await requireMember()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('note_checklist_items')
    .insert({
      note_id: noteId,
      workspace_id: membership.workspaceId,
      text: text ?? '',
      position,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }
  return { id: data.id }
}

export async function toggleChecklistItem(itemId: string, checked: boolean): Promise<Result> {
  await requireMember()
  const supabase = await createClient()
  const { error } = await supabase
    .from('note_checklist_items')
    .update({ checked })
    .eq('id', itemId)
  return error ? { error: error.message } : {}
}

export async function updateChecklistItem(itemId: string, text: string): Promise<Result> {
  await requireMember()
  const supabase = await createClient()
  const { error } = await supabase
    .from('note_checklist_items')
    .update({ text })
    .eq('id', itemId)
  return error ? { error: error.message } : {}
}

export async function deleteChecklistItem(itemId: string): Promise<Result> {
  await requireMember()
  const supabase = await createClient()
  const { error } = await supabase.from('note_checklist_items').delete().eq('id', itemId)
  return error ? { error: error.message } : {}
}

export async function reorderChecklist(noteId: string, orderedItemIds: string[]): Promise<Result> {
  await requireMember()
  const supabase = await createClient()
  for (let i = 0; i < orderedItemIds.length; i++) {
    const { error } = await supabase
      .from('note_checklist_items')
      .update({ position: i })
      .eq('id', orderedItemIds[i])
      .eq('note_id', noteId)
    if (error) return { error: error.message }
  }
  return {}
}

// ----------------------------------------------------------------------------
// Labels (workspace-wide shared; delete is owner-only)
// ----------------------------------------------------------------------------
export async function createLabel(name: string, color: string): Promise<CreateResult> {
  const membership = await requireMember()
  const user = await verifySession()
  const trimmed = (name ?? '').trim()
  if (!trimmed) return { error: 'Label name is required.' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('labels')
    .insert({
      workspace_id: membership.workspaceId,
      name: trimmed,
      color: normalizeColor(color),
      created_by: user.id,
    })
    .select('id')
    .single()
  if (error) {
    if (error.code === '23505') return { error: 'That label already exists.' }
    return { error: error.message }
  }
  return { id: data.id }
}

export async function renameLabel(id: string, name: string): Promise<Result> {
  await requireMember()
  const trimmed = (name ?? '').trim()
  if (!trimmed) return { error: 'Label name is required.' }
  const supabase = await createClient()
  const { error } = await supabase.from('labels').update({ name: trimmed }).eq('id', id)
  if (error) {
    if (error.code === '23505') return { error: 'That label already exists.' }
    return { error: error.message }
  }
  return {}
}

export async function recolorLabel(id: string, color: string): Promise<Result> {
  await requireMember()
  const supabase = await createClient()
  const { error } = await supabase
    .from('labels')
    .update({ color: normalizeColor(color) })
    .eq('id', id)
  return error ? { error: error.message } : {}
}

export async function deleteLabel(id: string): Promise<Result> {
  await requireOwner()
  const supabase = await createClient()
  const { error } = await supabase.from('labels').delete().eq('id', id)
  return error ? { error: error.message } : {}
}

export async function addLabelToNote(noteId: string, labelId: string): Promise<Result> {
  const membership = await requireMember()
  const supabase = await createClient()
  const { error } = await supabase.from('note_labels').insert({
    note_id: noteId,
    label_id: labelId,
    workspace_id: membership.workspaceId,
  })
  if (error && error.code !== '23505') return { error: error.message } // ignore "already applied"
  return {}
}

export async function removeLabelFromNote(noteId: string, labelId: string): Promise<Result> {
  await requireMember()
  const supabase = await createClient()
  const { error } = await supabase
    .from('note_labels')
    .delete()
    .eq('note_id', noteId)
    .eq('label_id', labelId)
  return error ? { error: error.message } : {}
}

// ----------------------------------------------------------------------------
// Attachments (image is uploaded client-side first; this records the row)
// ----------------------------------------------------------------------------
export async function addAttachment(
  noteId: string,
  path: string,
  mimeType: string,
): Promise<CreateResult> {
  const membership = await requireMember()
  const user = await verifySession()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('attachments')
    .insert({
      workspace_id: membership.workspaceId,
      url: path,
      target_type: 'note',
      target_id: noteId,
      mime_type: mimeType,
      created_by: user.id,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }
  // Bump the parent note so the image propagates over the notes realtime feed
  // (attachments aren't published) and the note floats to the top (Keep behavior).
  await supabase.from('notes').update({ updated_at: new Date().toISOString() }).eq('id', noteId)
  return { id: data.id }
}

export async function removeAttachment(attachmentId: string): Promise<Result> {
  await requireMember()
  const supabase = await createClient()
  const { data: att } = await supabase
    .from('attachments')
    .select('id, url, target_id')
    .eq('id', attachmentId)
    .maybeSingle()
  if (!att) return {}
  await supabase.storage.from(NOTE_BUCKET).remove([att.url])
  const { error } = await supabase.from('attachments').delete().eq('id', attachmentId)
  if (error) return { error: error.message }
  await supabase.from('notes').update({ updated_at: new Date().toISOString() }).eq('id', att.target_id)
  return {}
}
