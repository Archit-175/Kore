'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { uploadAvatar } from '@/lib/storage'
import { updateProfile } from '@/lib/actions/auth'
import { initials } from '@/lib/presence'

/**
 * Self-only profile editor (opened from the avatar menu). Edits display name,
 * the @-mention handle, and an uploaded avatar. Loads the current values on
 * open; on save, persists via `updateProfile` and `router.refresh()` so the
 * topbar/presence pick up the change.
 */
export function ProfileModal({
  workspaceId,
  userId,
  fallbackColor,
  onClose,
}: {
  workspaceId: string
  userId: string
  fallbackColor: string
  onClose: () => void
}) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading] = useState(true)
  const [fullName, setFullName] = useState('')
  const [handle, setHandle] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, startSave] = useTransition()

  useEffect(() => {
    let cancelled = false
    void supabase
      .from('profiles')
      .select('full_name, handle, avatar_url')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        setFullName(data?.full_name ?? '')
        setHandle(data?.handle ?? '')
        setAvatarUrl(data?.avatar_url ?? null)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [supabase, userId])

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file) return
    setError(null)
    setUploading(true)
    const res = await uploadAvatar(supabase, { workspaceId, userId, file })
    setUploading(false)
    if (res.error) {
      setError(res.error)
      return
    }
    setAvatarUrl(res.url ?? null)
  }

  const save = () => {
    setError(null)
    startSave(async () => {
      const res = await updateProfile({ fullName, handle, avatarUrl })
      if (res.error) {
        setError(res.error)
        return
      }
      router.refresh()
      onClose()
    })
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 p-4 pt-[12vh]"
      onMouseDown={onClose}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-border bg-background p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Edit profile</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md px-2 py-1 text-sm text-neutral-400 hover:bg-black/5 hover:text-neutral-700 dark:hover:bg-white/10 dark:hover:text-neutral-200"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <p className="py-8 text-center text-sm text-neutral-400">Loading…</p>
        ) : (
          <div className="space-y-4">
            {/* Avatar */}
            <div className="flex items-center gap-4">
              <span
                className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full text-lg font-semibold text-white"
                style={{ backgroundColor: fallbackColor }}
              >
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  initials(fullName || '?')
                )}
              </span>
              <div className="flex flex-col gap-1.5">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="rounded-md border border-border px-3 py-1.5 text-sm font-medium transition hover:bg-black/5 disabled:opacity-60 dark:hover:bg-white/5"
                  >
                    {uploading ? 'Uploading…' : 'Upload image'}
                  </button>
                  {avatarUrl && (
                    <button
                      type="button"
                      onClick={() => setAvatarUrl(null)}
                      className="rounded-md px-2 py-1.5 text-sm text-neutral-500 transition hover:text-red-600"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <p className="text-xs text-neutral-400">PNG, JPEG, WebP or GIF, up to 5 MB.</p>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={onPickFile}
                className="hidden"
              />
            </div>

            {/* Display name */}
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">
                Display name
              </span>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your name"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-indigo-400"
              />
            </label>

            {/* Handle */}
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">
                Mention handle
              </span>
              <div className="flex items-center rounded-md border border-border bg-background px-3 focus-within:border-indigo-400">
                <span className="text-sm text-neutral-400">@</span>
                <input
                  value={handle}
                  onChange={(e) =>
                    setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
                  }
                  maxLength={20}
                  placeholder="nickname"
                  className="w-full bg-transparent py-2 pl-1 text-sm outline-none"
                />
              </div>
              <span className="mt-1 block text-xs text-neutral-400">
                Others type @{handle || 'nickname'} to mention you. 3–20 chars: a–z, 0–9, _
              </span>
            </label>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md px-3 py-1.5 text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving || uploading}
                className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
