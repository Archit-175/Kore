'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import type { BoardNote, NoteBoardActions, NotesTab } from '@/lib/notes/types'
import { NOTE_COLOR_CLASSES } from '@/lib/notes/colors'
import { ColorPicker } from './color-picker'
import { LabelPicker } from './label-picker'
import {
  ArchiveIcon,
  PaletteIcon,
  PinFilledIcon,
  PinIcon,
  RestoreIcon,
  TrashIcon,
  UnarchiveIcon,
} from './icons'

function stop(e: React.MouseEvent) {
  e.stopPropagation()
}

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: (e: React.MouseEvent) => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 transition hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
    >
      {children}
    </button>
  )
}

export function NoteCard({
  note,
  tab,
  actions,
  onOpen,
}: {
  note: BoardNote
  tab: NotesTab
  actions: NoteBoardActions
  onOpen: (note: BoardNote) => void
}) {
  const [colorOpen, setColorOpen] = useState(false)
  const colorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!colorOpen) return
    function onDown(e: MouseEvent) {
      if (colorRef.current && !colorRef.current.contains(e.target as Node)) setColorOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [colorOpen])

  const checklist = [...note.checklist].sort((a, b) => a.position - b.position)
  const checklistPreview = checklist.slice(0, 6)
  const noteLabels = note.labelIds
    .map((id) => actions.labels.find((l) => l.id === id))
    .filter((l): l is NonNullable<typeof l> => Boolean(l))
  const firstImage = note.attachments.find((a) => a.signedUrl)
  const hasBody = note.content.trim().length > 0

  return (
    <div
      onClick={() => onOpen(note)}
      className={`group mb-3 break-inside-avoid rounded-lg border p-3 text-left shadow-sm transition hover:shadow-md ${NOTE_COLOR_CLASSES[note.color].card}`}
    >
      {firstImage?.signedUrl && (
        <div className="relative mb-2 h-32 w-full overflow-hidden rounded-md">
          <Image
            src={firstImage.signedUrl}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, 280px"
            className="object-cover"
            unoptimized
          />
        </div>
      )}

      <div className="flex items-start justify-between gap-2">
        {note.title.trim() ? (
          <h3 className="min-w-0 break-words text-sm font-semibold leading-snug">{note.title}</h3>
        ) : (
          <span />
        )}
        {tab === 'active' && (
          <button
            type="button"
            onClick={(e) => {
              stop(e)
              actions.setPinned(note, !note.pinned)
            }}
            aria-label={note.pinned ? 'Unpin' : 'Pin'}
            title={note.pinned ? 'Unpin' : 'Pin'}
            className={`-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition hover:bg-black/5 dark:hover:bg-white/10 ${
              note.pinned ? 'text-indigo-600 dark:text-indigo-300' : 'text-neutral-400'
            }`}
          >
            {note.pinned ? <PinFilledIcon className="h-4 w-4" /> : <PinIcon className="h-4 w-4" />}
          </button>
        )}
      </div>

      {hasBody && (
        <p className="mt-1 line-clamp-[8] whitespace-pre-wrap break-words text-sm text-neutral-700 dark:text-neutral-300">
          {note.content}
        </p>
      )}

      {checklistPreview.length > 0 && (
        <ul className="mt-2 space-y-1">
          {checklistPreview.map((item) => (
            <li key={item.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={item.checked}
                onClick={stop}
                onChange={(e) => actions.toggleChecklistItem(note.id, item.id, e.target.checked)}
                className="h-3.5 w-3.5 shrink-0"
              />
              <span
                className={`truncate ${item.checked ? 'text-neutral-400 line-through' : 'text-neutral-700 dark:text-neutral-300'}`}
              >
                {item.text}
              </span>
            </li>
          ))}
          {checklist.length > checklistPreview.length && (
            <li className="text-xs text-neutral-400">
              + {checklist.length - checklistPreview.length} more
            </li>
          )}
        </ul>
      )}

      {noteLabels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {noteLabels.map((label) => (
            <span
              key={label.id}
              className={`rounded-full px-2 py-0.5 text-[11px] ${NOTE_COLOR_CLASSES[label.color].chip}`}
            >
              {label.name}
            </span>
          ))}
        </div>
      )}

      {/* Action toolbar — visible on hover (always visible on touch) */}
      <div
        className="mt-2 flex items-center gap-0.5 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100"
        onClick={stop}
      >
        {tab === 'trash' ? (
          <>
            <ToolbarButton label="Restore" onClick={() => actions.restore(note)}>
              <RestoreIcon />
            </ToolbarButton>
            {actions.isOwner && (
              <ToolbarButton label="Delete forever" onClick={() => actions.deletePermanent(note)}>
                <TrashIcon />
              </ToolbarButton>
            )}
          </>
        ) : (
          <>
            <div className="relative" ref={colorRef}>
              <ToolbarButton
                label="Color"
                onClick={() => setColorOpen((v) => !v)}
              >
                <PaletteIcon />
              </ToolbarButton>
              {colorOpen && (
                <div className="absolute z-20 mt-1 w-48 rounded-lg border border-border bg-background p-2 shadow-lg">
                  <ColorPicker
                    value={note.color}
                    onChange={(c) => {
                      actions.setColor(note, c)
                      setColorOpen(false)
                    }}
                  />
                </div>
              )}
            </div>
            <LabelPicker noteId={note.id} appliedLabelIds={note.labelIds} actions={actions} />
            {tab === 'archived' ? (
              <ToolbarButton label="Unarchive" onClick={() => actions.unarchive(note)}>
                <UnarchiveIcon />
              </ToolbarButton>
            ) : (
              <ToolbarButton label="Archive" onClick={() => actions.archive(note)}>
                <ArchiveIcon />
              </ToolbarButton>
            )}
            <ToolbarButton label="Trash" onClick={() => actions.trash(note)}>
              <TrashIcon />
            </ToolbarButton>
          </>
        )}
      </div>
    </div>
  )
}
