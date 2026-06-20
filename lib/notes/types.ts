import type { NoteColor } from './colors'

/** A checklist line within a note. */
export type ChecklistItem = {
  id: string
  text: string
  checked: boolean
  position: number
}

/** An image attached to a note. `path` is the storage object path (stored in
 * attachments.url); `signedUrl` is minted on read for rendering. */
export type BoardAttachment = {
  id: string
  path: string
  signedUrl: string | null
  mimeType: string | null
}

/** Aggregate note shape the board UI renders (note row + its children). */
export type BoardNote = {
  id: string
  title: string
  content: string
  color: NoteColor
  pinned: boolean
  projectId: string | null
  archivedAt: string | null
  trashedAt: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
  checklist: ChecklistItem[]
  labelIds: string[]
  attachments: BoardAttachment[]
}

/** A workspace-wide shared label. */
export type BoardLabel = {
  id: string
  name: string
  color: NoteColor
}

export type BoardData = {
  notes: BoardNote[]
  labels: BoardLabel[]
}

export type NotesView = 'grid' | 'list'
export type NotesTab = 'active' | 'archived' | 'trash'

/** Which tab a note belongs to, given its status timestamps. */
export function noteTab(note: Pick<BoardNote, 'archivedAt' | 'trashedAt'>): NotesTab {
  if (note.trashedAt) return 'trash'
  if (note.archivedAt) return 'archived'
  return 'active'
}

/**
 * The mutation surface the board hands to cards / editor / pickers. Each method
 * applies an optimistic local change and fires the corresponding Server Action;
 * the realtime refetch reconciles to authoritative state.
 */
export type NoteBoardActions = {
  isOwner: boolean
  labels: BoardLabel[]
  patchNoteLocal: (id: string, partial: Partial<BoardNote>) => void
  setPinned: (note: BoardNote, pinned: boolean) => void
  setColor: (note: BoardNote, color: NoteColor) => void
  saveTitleContent: (noteId: string, patch: { title?: string; content?: string }) => void
  archive: (note: BoardNote) => void
  unarchive: (note: BoardNote) => void
  trash: (note: BoardNote) => void
  restore: (note: BoardNote) => void
  deletePermanent: (note: BoardNote) => void
  addChecklistItem: (noteId: string, text: string) => Promise<void>
  toggleChecklistItem: (noteId: string, itemId: string, checked: boolean) => void
  editChecklistItem: (noteId: string, itemId: string, text: string) => void
  deleteChecklistItem: (noteId: string, itemId: string) => void
  createLabel: (name: string, color: NoteColor) => Promise<BoardLabel | null>
  addLabel: (noteId: string, labelId: string) => void
  removeLabel: (noteId: string, labelId: string) => void
  renameLabel: (labelId: string, name: string) => void
  recolorLabel: (labelId: string, color: NoteColor) => void
  deleteLabel: (labelId: string) => void
  /** Upload an image to the note; returns an error message or null on success. */
  uploadImage: (noteId: string, file: File) => Promise<string | null>
  removeAttachment: (noteId: string, attachmentId: string) => void
}
