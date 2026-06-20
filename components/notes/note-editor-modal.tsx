'use client'

import { useEffect, useRef, useState } from 'react'
import type { BoardNote, NoteBoardActions, NotesTab } from '@/lib/notes/types'
import { NOTE_COLOR_CLASSES } from '@/lib/notes/colors'
import { ChecklistEditor } from './checklist-editor'
import { ColorPicker } from './color-picker'
import { ImageUploader } from './image-uploader'
import { LabelPicker } from './label-picker'
import {
  ArchiveIcon,
  CloseIcon,
  PinFilledIcon,
  PinIcon,
  RestoreIcon,
  TrashIcon,
  UnarchiveIcon,
} from './icons'

export function NoteEditorModal({
  note,
  tab,
  actions,
  onClose,
}: {
  note: BoardNote
  tab: NotesTab
  actions: NoteBoardActions
  onClose: () => void
}) {
  const [title, setTitle] = useState(note.title)
  const [content, setContent] = useState(note.content)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<{ title?: string; content?: string }>({})
  const titleRef = useRef<HTMLInputElement>(null)
  const contentRef = useRef<HTMLTextAreaElement>(null)

  function scheduleSave() {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const patch = pending.current
      pending.current = {}
      timer.current = null
      if (patch.title !== undefined || patch.content !== undefined) {
        actions.saveTitleContent(note.id, patch)
      }
    }, 600)
  }

  // Flush any pending text save when the editor closes/unmounts.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
      const patch = pending.current
      if (patch.title !== undefined || patch.content !== undefined) {
        actions.saveTitleContent(note.id, patch)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Pull remote edits into the fields when the user isn't actively editing them,
  // so an open-but-idle editor stays live without clobbering active typing.
  useEffect(() => {
    if (document.activeElement !== titleRef.current) setTitle(note.title)
  }, [note.title])
  useEffect(() => {
    if (document.activeElement !== contentRef.current) setContent(note.content)
  }, [note.content])

  // Escape to close.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const noteLabels = note.labelIds
    .map((id) => actions.labels.find((l) => l.id === id))
    .filter((l): l is NonNullable<typeof l> => Boolean(l))
  const readOnly = tab === 'trash'

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 sm:items-start sm:p-4"
      onMouseDown={onClose}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className={`flex h-full w-full flex-col border-border shadow-xl sm:mt-12 sm:h-auto sm:max-h-[85vh] sm:max-w-xl sm:rounded-xl sm:border ${NOTE_COLOR_CLASSES[note.color].card}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
          {tab === 'active' ? (
            <button
              type="button"
              onClick={() => actions.setPinned(note, !note.pinned)}
              aria-label={note.pinned ? 'Unpin' : 'Pin'}
              className={`flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-black/5 dark:hover:bg-white/10 ${
                note.pinned ? 'text-indigo-600 dark:text-indigo-300' : 'text-neutral-400'
              }`}
            >
              {note.pinned ? <PinFilledIcon /> : <PinIcon />}
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          <input
            ref={titleRef}
            value={title}
            disabled={readOnly}
            onChange={(e) => {
              setTitle(e.target.value)
              pending.current.title = e.target.value
              scheduleSave()
            }}
            placeholder="Title"
            className="w-full bg-transparent text-base font-semibold outline-none placeholder:text-neutral-400 disabled:opacity-70"
          />
          <textarea
            ref={contentRef}
            value={content}
            disabled={readOnly}
            onChange={(e) => {
              setContent(e.target.value)
              pending.current.content = e.target.value
              scheduleSave()
            }}
            placeholder="Take a note…"
            rows={4}
            className="w-full resize-none bg-transparent text-sm leading-6 outline-none placeholder:text-neutral-400 disabled:opacity-70"
          />

          {!readOnly && <ChecklistEditor note={note} actions={actions} />}
          {readOnly && note.checklist.length > 0 && (
            <ul className="space-y-1">
              {[...note.checklist]
                .sort((a, b) => a.position - b.position)
                .map((item) => (
                  <li key={item.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={item.checked} readOnly className="h-4 w-4" />
                    <span className={item.checked ? 'text-neutral-400 line-through' : ''}>
                      {item.text}
                    </span>
                  </li>
                ))}
            </ul>
          )}

          {!readOnly && <ImageUploader note={note} actions={actions} />}

          {noteLabels.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {noteLabels.map((label) => (
                <span
                  key={label.id}
                  className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${NOTE_COLOR_CLASSES[label.color].chip}`}
                >
                  {label.name}
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => actions.removeLabel(note.id, label.id)}
                      aria-label={`Remove ${label.name}`}
                      className="opacity-60 hover:opacity-100"
                    >
                      <CloseIcon className="h-3 w-3" />
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border/60 px-3 py-2">
          {readOnly ? (
            <>
              <button
                type="button"
                onClick={() => {
                  actions.restore(note)
                  onClose()
                }}
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-neutral-600 hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/10"
              >
                <RestoreIcon className="h-4 w-4" /> Restore
              </button>
              {actions.isOwner && (
                <button
                  type="button"
                  onClick={() => {
                    actions.deletePermanent(note)
                    onClose()
                  }}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-red-600 hover:bg-red-500/10"
                >
                  <TrashIcon className="h-4 w-4" /> Delete forever
                </button>
              )}
            </>
          ) : (
            <>
              <div className="mr-auto">
                <ColorPicker value={note.color} onChange={(c) => actions.setColor(note, c)} />
              </div>
              <LabelPicker noteId={note.id} appliedLabelIds={note.labelIds} actions={actions} />
              {tab === 'archived' ? (
                <button
                  type="button"
                  onClick={() => {
                    actions.unarchive(note)
                    onClose()
                  }}
                  aria-label="Unarchive"
                  title="Unarchive"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
                >
                  <UnarchiveIcon />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    actions.archive(note)
                    onClose()
                  }}
                  aria-label="Archive"
                  title="Archive"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
                >
                  <ArchiveIcon />
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  actions.trash(note)
                  onClose()
                }}
                aria-label="Trash"
                title="Trash"
                className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
              >
                <TrashIcon />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
