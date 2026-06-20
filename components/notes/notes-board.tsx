'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { loadBoard } from '@/lib/notes/load-board'
import { getSignedUrl, uploadFile } from '@/lib/storage'
import * as api from '@/lib/actions/notes'
import {
  noteTab,
  type BoardData,
  type BoardLabel,
  type BoardNote,
  type NoteBoardActions,
  type NotesTab,
  type NotesView,
} from '@/lib/notes/types'
import { NOTE_COLOR_CLASSES } from '@/lib/notes/colors'
import { NoteCard } from './note-card'
import { NoteComposer, type ComposerInput } from './note-composer'
import { NoteEditorModal } from './note-editor-modal'
import { LabelManager } from './label-manager'
import { ViewToggle } from './view-toggle'
import { LabelIcon, SearchIcon, TrashIcon } from './icons'

const TABS: { key: NotesTab; label: string }[] = [
  { key: 'active', label: 'Notes' },
  { key: 'archived', label: 'Archive' },
  { key: 'trash', label: 'Trash' },
]

export function NotesBoard({
  initial,
  workspaceId,
  currentUserId,
  isOwner,
}: {
  initial: BoardData
  workspaceId: string
  currentUserId: string
  isOwner: boolean
}) {
  const supabase = useMemo(() => createClient(), [])
  const [notes, setNotes] = useState<BoardNote[]>(initial.notes)
  const [labels, setLabels] = useState<BoardLabel[]>(initial.labels)
  const [view, setView] = useState<NotesView>('grid')
  const [tab, setTab] = useState<NotesTab>('active')
  const [labelFilter, setLabelFilter] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [openNoteId, setOpenNoteId] = useState<string | null>(null)
  const [showLabelManager, setShowLabelManager] = useState(false)

  const notesRef = useRef(notes)
  useEffect(() => {
    notesRef.current = notes
  }, [notes])

  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // --- realtime: debounced full-board refetch on any relevant change ---------
  const doRefetch = useCallback(async () => {
    const board = await loadBoard(supabase, workspaceId)
    setLabels(board.labels)
    setNotes(board.notes)
  }, [supabase, workspaceId])

  const scheduleRefetch = useCallback(() => {
    if (refetchTimer.current) clearTimeout(refetchTimer.current)
    refetchTimer.current = setTimeout(() => void doRefetch(), 300)
  }, [doRefetch])

  useEffect(() => {
    let channel: RealtimeChannel | null = null
    let cancelled = false
    void (async () => {
      // setAuth must be awaited before subscribe() or the RLS-gated change feed
      // hangs (same gotcha as the Yjs provider).
      const { data } = await supabase.auth.getSession()
      await supabase.realtime.setAuth(data.session?.access_token ?? null)
      if (cancelled) return
      const filter = `workspace_id=eq.${workspaceId}`
      channel = supabase
        .channel(`notes:${workspaceId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notes', filter }, scheduleRefetch)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'note_checklist_items', filter },
          scheduleRefetch,
        )
        .on('postgres_changes', { event: '*', schema: 'public', table: 'note_labels', filter }, scheduleRefetch)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'labels', filter }, scheduleRefetch)
        .subscribe()
    })()
    return () => {
      cancelled = true
      if (refetchTimer.current) clearTimeout(refetchTimer.current)
      if (channel) void supabase.removeChannel(channel)
    }
  }, [supabase, workspaceId, scheduleRefetch])

  // --- view persistence ------------------------------------------------------
  useEffect(() => {
    const saved = localStorage.getItem('kore-notes-view')
    // Restore the persisted view preference on mount (browser-only read).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved === 'grid' || saved === 'list') setView(saved)
  }, [])
  const changeView = useCallback((v: NotesView) => {
    setView(v)
    localStorage.setItem('kore-notes-view', v)
  }, [])

  // --- local optimistic mutators ---------------------------------------------
  const patchNoteLocal = useCallback((id: string, partial: Partial<BoardNote>) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...partial } : n)))
  }, [])
  const removeNoteLocal = useCallback((id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id))
  }, [])
  const upsertLabelLocal = useCallback((label: BoardLabel) => {
    setLabels((prev) =>
      prev.some((l) => l.id === label.id) ? prev.map((l) => (l.id === label.id ? label : l)) : [...prev, label],
    )
  }, [])
  const removeLabelLocal = useCallback((id: string) => {
    setLabels((prev) => prev.filter((l) => l.id !== id))
  }, [])

  // --- the action surface handed to cards / editor / pickers -----------------
  const actions: NoteBoardActions = useMemo(
    () => ({
      isOwner,
      labels,
      patchNoteLocal,
      setPinned: (note, pinned) => {
        patchNoteLocal(note.id, { pinned })
        void api.updateNote(note.id, { pinned })
      },
      setColor: (note, color) => {
        patchNoteLocal(note.id, { color })
        void api.updateNote(note.id, { color })
      },
      saveTitleContent: (noteId, patch) => {
        patchNoteLocal(noteId, patch)
        void api.updateNote(noteId, patch)
      },
      archive: (note) => {
        patchNoteLocal(note.id, { archivedAt: new Date().toISOString() })
        void api.archiveNote(note.id)
      },
      unarchive: (note) => {
        patchNoteLocal(note.id, { archivedAt: null })
        void api.unarchiveNote(note.id)
      },
      trash: (note) => {
        patchNoteLocal(note.id, { trashedAt: new Date().toISOString() })
        void api.trashNote(note.id)
      },
      restore: (note) => {
        patchNoteLocal(note.id, { trashedAt: null })
        void api.restoreNote(note.id)
      },
      deletePermanent: (note) => {
        removeNoteLocal(note.id)
        void api.deleteNotePermanent(note.id)
      },
      addChecklistItem: async (noteId, text) => {
        const current = notesRef.current.find((n) => n.id === noteId)
        const position = current ? current.checklist.length : 0
        const tempId = crypto.randomUUID()
        setNotes((prev) =>
          prev.map((n) =>
            n.id === noteId
              ? { ...n, checklist: [...n.checklist, { id: tempId, text, checked: false, position }] }
              : n,
          ),
        )
        const res = await api.addChecklistItem(noteId, text, position)
        if (res.id) {
          const realId = res.id
          setNotes((prev) =>
            prev.map((n) =>
              n.id === noteId
                ? { ...n, checklist: n.checklist.map((it) => (it.id === tempId ? { ...it, id: realId } : it)) }
                : n,
            ),
          )
        }
      },
      toggleChecklistItem: (noteId, itemId, checked) => {
        setNotes((prev) =>
          prev.map((n) =>
            n.id === noteId
              ? { ...n, checklist: n.checklist.map((it) => (it.id === itemId ? { ...it, checked } : it)) }
              : n,
          ),
        )
        void api.toggleChecklistItem(itemId, checked)
      },
      editChecklistItem: (noteId, itemId, text) => {
        setNotes((prev) =>
          prev.map((n) =>
            n.id === noteId
              ? { ...n, checklist: n.checklist.map((it) => (it.id === itemId ? { ...it, text } : it)) }
              : n,
          ),
        )
        void api.updateChecklistItem(itemId, text)
      },
      deleteChecklistItem: (noteId, itemId) => {
        setNotes((prev) =>
          prev.map((n) =>
            n.id === noteId ? { ...n, checklist: n.checklist.filter((it) => it.id !== itemId) } : n,
          ),
        )
        void api.deleteChecklistItem(itemId)
      },
      createLabel: async (name, color) => {
        const res = await api.createLabel(name, color)
        if (res.error || !res.id) return null
        const label: BoardLabel = { id: res.id, name: name.trim(), color }
        upsertLabelLocal(label)
        return label
      },
      addLabel: (noteId, labelId) => {
        setNotes((prev) =>
          prev.map((n) =>
            n.id === noteId && !n.labelIds.includes(labelId)
              ? { ...n, labelIds: [...n.labelIds, labelId] }
              : n,
          ),
        )
        void api.addLabelToNote(noteId, labelId)
      },
      removeLabel: (noteId, labelId) => {
        setNotes((prev) =>
          prev.map((n) => (n.id === noteId ? { ...n, labelIds: n.labelIds.filter((id) => id !== labelId) } : n)),
        )
        void api.removeLabelFromNote(noteId, labelId)
      },
      renameLabel: (labelId, name) => {
        setLabels((prev) => prev.map((l) => (l.id === labelId ? { ...l, name } : l)))
        void api.renameLabel(labelId, name)
      },
      recolorLabel: (labelId, color) => {
        setLabels((prev) => prev.map((l) => (l.id === labelId ? { ...l, color } : l)))
        void api.recolorLabel(labelId, color)
      },
      deleteLabel: (labelId) => {
        removeLabelLocal(labelId)
        setNotes((prev) => prev.map((n) => ({ ...n, labelIds: n.labelIds.filter((id) => id !== labelId) })))
        if (labelFilter === labelId) setLabelFilter(null)
        void api.deleteLabel(labelId)
      },
      uploadImage: async (noteId, file) => {
        const up = await uploadFile(supabase, { workspaceId, noteId, file })
        if (up.error || !up.path) return up.error ?? 'Upload failed.'
        const res = await api.addAttachment(noteId, up.path, file.type)
        if (res.error || !res.id) return res.error ?? 'Could not save image.'
        const signedUrl = await getSignedUrl(supabase, up.path)
        const attId = res.id
        const path = up.path
        setNotes((prev) =>
          prev.map((n) =>
            n.id === noteId
              ? { ...n, attachments: [...n.attachments, { id: attId, path, signedUrl, mimeType: file.type }] }
              : n,
          ),
        )
        return null
      },
      removeAttachment: (noteId, attachmentId) => {
        setNotes((prev) =>
          prev.map((n) =>
            n.id === noteId ? { ...n, attachments: n.attachments.filter((a) => a.id !== attachmentId) } : n,
          ),
        )
        void api.removeAttachment(attachmentId)
      },
    }),
    [
      isOwner,
      labels,
      labelFilter,
      supabase,
      workspaceId,
      patchNoteLocal,
      removeNoteLocal,
      upsertLabelLocal,
      removeLabelLocal,
    ],
  )

  const handleCreate = useCallback(async (input: ComposerInput) => {
    const tempId = crypto.randomUUID()
    const now = new Date().toISOString()
    const optimistic: BoardNote = {
      id: tempId,
      title: input.title,
      content: input.content,
      color: input.color,
      pinned: input.pinned,
      projectId: null,
      archivedAt: null,
      trashedAt: null,
      createdBy: null,
      createdAt: now,
      updatedAt: now,
      checklist: [],
      labelIds: [],
      attachments: [],
    }
    setNotes((prev) => [optimistic, ...prev])
    const res = await api.createNote(input)
    if (res.id) {
      const realId = res.id
      setNotes((prev) => prev.map((n) => (n.id === tempId ? { ...n, id: realId } : n)))
    } else {
      setNotes((prev) => prev.filter((n) => n.id !== tempId))
    }
  }, [])

  // --- derived view ----------------------------------------------------------
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return notes.filter((n) => {
      if (noteTab(n) !== tab) return false
      if (labelFilter && !n.labelIds.includes(labelFilter)) return false
      if (q) {
        const hay = `${n.title} ${n.content} ${n.checklist.map((i) => i.text).join(' ')}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [notes, tab, labelFilter, query])

  const pinnedNotes = tab === 'active' ? visible.filter((n) => n.pinned) : []
  const otherNotes = tab === 'active' ? visible.filter((n) => !n.pinned) : visible
  const trashCount = useMemo(() => notes.filter((n) => n.trashedAt).length, [notes])

  const openNote = openNoteId ? (notes.find((n) => n.id === openNoteId) ?? null) : null

  const gridClass =
    view === 'grid'
      ? 'columns-1 gap-3 sm:columns-2 lg:columns-3 xl:columns-4'
      : 'mx-auto max-w-2xl'

  function renderGroup(items: BoardNote[]) {
    return (
      <div className={gridClass}>
        {items.map((note) => (
          <NoteCard key={note.id} note={note} tab={tab} actions={actions} onOpen={(n) => setOpenNoteId(n.id)} />
        ))}
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg font-semibold">Notes</h1>
          <div className="flex items-center gap-2">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search notes"
                className="w-40 rounded-md border border-border bg-background py-1.5 pl-8 pr-3 text-sm outline-none focus:border-indigo-500 sm:w-56"
              />
            </div>
            <ViewToggle view={view} onChange={changeView} />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`rounded-md px-3 py-1 text-sm transition ${
                  tab === t.key
                    ? 'bg-indigo-500/10 font-medium text-indigo-600 dark:text-indigo-300'
                    : 'text-neutral-600 hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/5'
                }`}
              >
                {t.label}
                {t.key === 'trash' && trashCount > 0 ? ` (${trashCount})` : ''}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowLabelManager(true)}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-neutral-600 hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/5"
            >
              <LabelIcon className="h-4 w-4" /> Edit labels
            </button>
            {tab === 'trash' && isOwner && trashCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setNotes((prev) => prev.filter((n) => !n.trashedAt))
                  void api.emptyTrash()
                }}
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-red-600 hover:bg-red-500/10"
              >
                <TrashIcon className="h-4 w-4" /> Empty trash
              </button>
            )}
          </div>
        </div>

        {/* Label filter chips */}
        {labels.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setLabelFilter(null)}
              className={`rounded-full px-2.5 py-0.5 text-xs transition ${
                labelFilter === null
                  ? 'bg-foreground text-background'
                  : 'bg-black/5 text-neutral-600 hover:bg-black/10 dark:bg-white/10 dark:text-neutral-300'
              }`}
            >
              All
            </button>
            {labels.map((label) => (
              <button
                key={label.id}
                type="button"
                onClick={() => setLabelFilter((cur) => (cur === label.id ? null : label.id))}
                className={`rounded-full px-2.5 py-0.5 text-xs transition ${
                  labelFilter === label.id
                    ? 'outline outline-2 outline-offset-1 outline-indigo-500'
                    : ''
                } ${NOTE_COLOR_CLASSES[label.color].chip}`}
              >
                {label.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Composer (active tab only) */}
      {tab === 'active' && <NoteComposer onCreate={handleCreate} />}

      {/* Notes */}
      {visible.length === 0 ? (
        <p className="py-16 text-center text-sm text-neutral-400">
          {tab === 'active'
            ? 'No notes yet. Take one above.'
            : tab === 'archived'
              ? 'Nothing archived.'
              : 'Trash is empty.'}
        </p>
      ) : (
        <>
          {pinnedNotes.length > 0 && (
            <>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                Pinned
              </p>
              {renderGroup(pinnedNotes)}
              {otherNotes.length > 0 && (
                <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                  Others
                </p>
              )}
            </>
          )}
          {otherNotes.length > 0 && renderGroup(otherNotes)}
        </>
      )}

      {openNote && (
        <NoteEditorModal
          note={openNote}
          tab={noteTab(openNote)}
          actions={actions}
          workspaceId={workspaceId}
          currentUserId={currentUserId}
          onClose={() => setOpenNoteId(null)}
        />
      )}
      {showLabelManager && (
        <LabelManager actions={actions} onClose={() => setShowLabelManager(false)} />
      )}
    </div>
  )
}
