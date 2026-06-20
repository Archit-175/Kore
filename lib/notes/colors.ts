// Note + label color palette. The DB stores a palette KEY (text); the UI maps it
// to Tailwind classes here. Class strings are full literals so Tailwind v4's JIT
// scanner emits them (never build class names by concatenation).

export const NOTE_COLORS = [
  'default',
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'purple',
  'pink',
  'gray',
] as const

export type NoteColor = (typeof NOTE_COLORS)[number]

type ColorClasses = {
  /** card background + border */
  card: string
  /** small solid swatch for the color picker */
  swatch: string
  /** label chip background + text */
  chip: string
}

export const NOTE_COLOR_CLASSES: Record<NoteColor, ColorClasses> = {
  default: {
    card: 'bg-surface border-border',
    swatch: 'bg-surface border border-border',
    chip: 'bg-black/5 text-neutral-600 dark:bg-white/10 dark:text-neutral-300',
  },
  red: {
    card: 'bg-red-50 border-red-200 dark:bg-red-950/40 dark:border-red-900/50',
    swatch: 'bg-red-200 dark:bg-red-800',
    chip: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-200',
  },
  orange: {
    card: 'bg-orange-50 border-orange-200 dark:bg-orange-950/40 dark:border-orange-900/50',
    swatch: 'bg-orange-200 dark:bg-orange-800',
    chip: 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-200',
  },
  yellow: {
    card: 'bg-yellow-50 border-yellow-200 dark:bg-yellow-950/40 dark:border-yellow-900/50',
    swatch: 'bg-yellow-200 dark:bg-yellow-700',
    chip: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200',
  },
  green: {
    card: 'bg-green-50 border-green-200 dark:bg-green-950/40 dark:border-green-900/50',
    swatch: 'bg-green-200 dark:bg-green-800',
    chip: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-200',
  },
  teal: {
    card: 'bg-teal-50 border-teal-200 dark:bg-teal-950/40 dark:border-teal-900/50',
    swatch: 'bg-teal-200 dark:bg-teal-800',
    chip: 'bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-200',
  },
  blue: {
    card: 'bg-blue-50 border-blue-200 dark:bg-blue-950/40 dark:border-blue-900/50',
    swatch: 'bg-blue-200 dark:bg-blue-800',
    chip: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200',
  },
  purple: {
    card: 'bg-purple-50 border-purple-200 dark:bg-purple-950/40 dark:border-purple-900/50',
    swatch: 'bg-purple-200 dark:bg-purple-800',
    chip: 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-200',
  },
  pink: {
    card: 'bg-pink-50 border-pink-200 dark:bg-pink-950/40 dark:border-pink-900/50',
    swatch: 'bg-pink-200 dark:bg-pink-800',
    chip: 'bg-pink-100 text-pink-700 dark:bg-pink-900/50 dark:text-pink-200',
  },
  gray: {
    card: 'bg-gray-100 border-gray-200 dark:bg-gray-900/60 dark:border-gray-800',
    swatch: 'bg-gray-300 dark:bg-gray-700',
    chip: 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-200',
  },
}

/** Human label for the color picker tooltip. */
export const NOTE_COLOR_LABELS: Record<NoteColor, string> = {
  default: 'Default',
  red: 'Red',
  orange: 'Orange',
  yellow: 'Yellow',
  green: 'Green',
  teal: 'Teal',
  blue: 'Blue',
  purple: 'Purple',
  pink: 'Pink',
  gray: 'Gray',
}

export function isNoteColor(value: unknown): value is NoteColor {
  return typeof value === 'string' && (NOTE_COLORS as readonly string[]).includes(value)
}

/** Coerce an arbitrary stored/incoming value to a valid color key. */
export function normalizeColor(value: unknown): NoteColor {
  return isNoteColor(value) ? value : 'default'
}
