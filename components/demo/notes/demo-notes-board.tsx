'use client'

import { useCallback, useMemo, useState } from 'react'
import { useDemo } from '@/lib/demo/context'
import { validateImage } from '@/lib/storage'
import {
  noteTab,
  type BoardNote,
  type NoteBoardActions,
  type NotesTab,
  type NotesView,
} from '@/lib/notes/types'
import { NOTE_COLOR_CLASSES } from '@/lib/notes/colors'
import { NoteCard } from '@/components/notes/note-card'
import { NoteComposer, type ComposerInput } from '@/components/notes/note-composer'
import { NoteEditorModal } from '@/components/notes/note-editor-modal'
import { LabelManager } from '@/components/notes/label-manager'
import { ViewToggle } from '@/components/notes/view-toggle'
import { LabelIcon, SearchIcon, TrashIcon } from '@/components/notes/icons'
import { DemoCommentsPanel } from '@/components/demo/comments/demo-comments-panel'

const TABS: { key: NotesTab; label: string }[] = [
  { key: 'active', label: 'Notes' },
  { key: 'archived', label: 'Archive' },
  { key: 'trash', label: 'Trash' },
]

/** Demo fork of NotesBoard: identical leaves + optimistic action surface, but all
 *  state lives in the DemoStore and every server-action/realtime/Storage-upload
 *  call is dropped. Zero Supabase. */
export function DemoNotesBoard() {
  const store = useDemo()
  const notes = store.notes
  const labels = store.labels

  const [view, setView] = useState<NotesView>('grid')
  const [tab, setTab] = useState<NotesTab>('active')
  const [labelFilter, setLabelFilter] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [openNoteId, setOpenNoteId] = useState<string | null>(null)
  const [showLabelManager, setShowLabelManager] = useState(false)

  const patchNoteLocal = useCallback(
    (id: string, partial: Partial<BoardNote>) =>
      store.setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...partial } : n))),
    [store],
  )

  const actions: NoteBoardActions = useMemo(
    () => ({
      isOwner: true,
      labels,
      patchNoteLocal,
      setPinned: (note, pinned) => patchNoteLocal(note.id, { pinned }),
      setColor: (note, color) => patchNoteLocal(note.id, { color }),
      saveTitleContent: (noteId, patch) => patchNoteLocal(noteId, patch),
      archive: (note) => patchNoteLocal(note.id, { archivedAt: new Date().toISOString() }),
      unarchive: (note) => patchNoteLocal(note.id, { archivedAt: null }),
      trash: (note) => patchNoteLocal(note.id, { trashedAt: new Date().toISOString() }),
      restore: (note) => patchNoteLocal(note.id, { trashedAt: null }),
      deletePermanent: (note) => store.setNotes((prev) => prev.filter((n) => n.id !== note.id)),
      addChecklistItem: async (noteId, text) => {
        store.setNotes((prev) =>
          prev.map((n) =>
            n.id === noteId
              ? {
                  ...n,
                  checklist: [
                    ...n.checklist,
                    { id: crypto.randomUUID(), text, checked: false, position: n.checklist.length },
                  ],
                }
              : n,
          ),
        )
      },
      toggleChecklistItem: (noteId, itemId, checked) =>
        store.setNotes((prev) =>
          prev.map((n) =>
            n.id === noteId
              ? { ...n, checklist: n.checklist.map((it) => (it.id === itemId ? { ...it, checked } : it)) }
              : n,
          ),
        ),
      editChecklistItem: (noteId, itemId, text) =>
        store.setNotes((prev) =>
          prev.map((n) =>
            n.id === noteId
              ? { ...n, checklist: n.checklist.map((it) => (it.id === itemId ? { ...it, text } : it)) }
              : n,
          ),
        ),
      deleteChecklistItem: (noteId, itemId) =>
        store.setNotes((prev) =>
          prev.map((n) =>
            n.id === noteId ? { ...n, checklist: n.checklist.filter((it) => it.id !== itemId) } : n,
          ),
        ),
      createLabel: async (name, color) => {
        const label = { id: crypto.randomUUID(), name: name.trim(), color }
        store.setLabels((prev) => [...prev, label])
        return label
      },
      addLabel: (noteId, labelId) =>
        store.setNotes((prev) =>
          prev.map((n) =>
            n.id === noteId && !n.labelIds.includes(labelId)
              ? { ...n, labelIds: [...n.labelIds, labelId] }
              : n,
          ),
        ),
      removeLabel: (noteId, labelId) =>
        store.setNotes((prev) =>
          prev.map((n) => (n.id === noteId ? { ...n, labelIds: n.labelIds.filter((id) => id !== labelId) } : n)),
        ),
      renameLabel: (labelId, name) =>
        store.setLabels((prev) => prev.map((l) => (l.id === labelId ? { ...l, name } : l))),
      recolorLabel: (labelId, color) =>
        store.setLabels((prev) => prev.map((l) => (l.id === labelId ? { ...l, color } : l))),
      deleteLabel: (labelId) => {
        store.setLabels((prev) => prev.filter((l) => l.id !== labelId))
        store.setNotes((prev) => prev.map((n) => ({ ...n, labelIds: n.labelIds.filter((id) => id !== labelId) })))
        if (labelFilter === labelId) setLabelFilter(null)
      },
      uploadImage: async (noteId, file) => {
        const err = validateImage(file)
        if (err) return err
        const url = URL.createObjectURL(file)
        store.setNotes((prev) =>
          prev.map((n) =>
            n.id === noteId
              ? {
                  ...n,
                  attachments: [
                    ...n.attachments,
                    { id: crypto.randomUUID(), path: `demo/${file.name}`, signedUrl: url, mimeType: file.type },
                  ],
                }
              : n,
          ),
        )
        return null
      },
      removeAttachment: (noteId, attachmentId) =>
        store.setNotes((prev) =>
          prev.map((n) =>
            n.id === noteId ? { ...n, attachments: n.attachments.filter((a) => a.id !== attachmentId) } : n,
          ),
        ),
    }),
    [store, labels, labelFilter, patchNoteLocal],
  )

  const handleCreate = useCallback(
    async (input: ComposerInput) => {
      const now = new Date().toISOString()
      const optimistic: BoardNote = {
        id: crypto.randomUUID(),
        title: input.title,
        content: input.content,
        color: input.color,
        pinned: input.pinned,
        projectId: null,
        archivedAt: null,
        trashedAt: null,
        createdBy: store.currentUserId,
        createdAt: now,
        updatedAt: now,
        checklist: [],
        labelIds: [],
        attachments: [],
      }
      store.setNotes((prev) => [optimistic, ...prev])
    },
    [store],
  )

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
    view === 'grid' ? 'columns-1 gap-3 sm:columns-2 lg:columns-3 xl:columns-4' : 'mx-auto max-w-2xl'

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
            <ViewToggle view={view} onChange={setView} />
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
            {tab === 'trash' && trashCount > 0 && (
              <button
                type="button"
                onClick={() => store.setNotes((prev) => prev.filter((n) => !n.trashedAt))}
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-red-600 hover:bg-red-500/10"
              >
                <TrashIcon className="h-4 w-4" /> Empty trash
              </button>
            )}
          </div>
        </div>

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
                  labelFilter === label.id ? 'outline outline-2 outline-offset-1 outline-indigo-500' : ''
                } ${NOTE_COLOR_CLASSES[label.color].chip}`}
              >
                {label.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {tab === 'active' && <NoteComposer onCreate={handleCreate} />}

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
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Pinned</p>
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
          workspaceId={store.workspace.id}
          currentUserId={store.currentUserId}
          onClose={() => setOpenNoteId(null)}
          CommentsComponent={DemoCommentsPanel}
        />
      )}
      {showLabelManager && <LabelManager actions={actions} onClose={() => setShowLabelManager(false)} />}
    </div>
  )
}
