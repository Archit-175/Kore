import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * The single file-storage seam (ADR 0001). Everything reads/writes through these
 * helpers and the storage object PATH stored in `attachments.url` — never a
 * hard-coded Supabase URL. Swapping Supabase Storage → GCS is a reimplementation
 * of THIS file only (signed URLs / uploads against GCS); schema + components
 * stay put. Private bucket + server-minted signed URLs keep access governed by
 * membership (storage.objects RLS, see the notes migration).
 */

type Supabase = SupabaseClient<Database>

export const NOTE_BUCKET = 'note-attachments'
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 5 MB
export const ALLOWED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const

const EXT_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

/** Client-side validation. Returns an error message, or null if the file is OK. */
export function validateImage(file: File): string | null {
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return 'Only PNG, JPEG, WebP, or GIF images are allowed.'
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return 'Image must be 5 MB or smaller.'
  }
  return null
}

/**
 * Upload an image to the private bucket under {workspaceId}/{noteId}/{uuid}.{ext}
 * (segment 1 = workspace_id is what storage.objects RLS checks). Runs client-side
 * (browser Supabase client) to avoid Server-Action body-size limits. Returns the
 * backend-neutral object path to record in `attachments.url`.
 */
export async function uploadFile(
  client: Supabase,
  opts: { workspaceId: string; noteId: string; file: File },
): Promise<{ path?: string; error?: string }> {
  const validationError = validateImage(opts.file)
  if (validationError) return { error: validationError }

  const ext = EXT_BY_TYPE[opts.file.type] ?? 'bin'
  const path = `${opts.workspaceId}/${opts.noteId}/${crypto.randomUUID()}.${ext}`

  const { error } = await client.storage.from(NOTE_BUCKET).upload(path, opts.file, {
    contentType: opts.file.type,
    upsert: false,
  })
  if (error) return { error: error.message }
  return { path }
}

/** Mint a time-limited signed URL for a single stored path. */
export async function getSignedUrl(
  client: Supabase,
  path: string,
  expiresInSec = 3600,
): Promise<string | null> {
  const { data } = await client.storage.from(NOTE_BUCKET).createSignedUrl(path, expiresInSec)
  return data?.signedUrl ?? null
}

/** Batch-mint signed URLs; returns a path → signedUrl map. */
export async function getSignedUrls(
  client: Supabase,
  paths: string[],
  expiresInSec = 3600,
): Promise<Record<string, string>> {
  if (paths.length === 0) return {}
  const { data } = await client.storage.from(NOTE_BUCKET).createSignedUrls(paths, expiresInSec)
  const out: Record<string, string> = {}
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) out[item.path] = item.signedUrl
  }
  return out
}

/** Delete the underlying object (called when an attachment is removed). */
export async function deleteFile(client: Supabase, path: string): Promise<void> {
  await client.storage.from(NOTE_BUCKET).remove([path])
}
