// Option color palette for select/multi_select/status properties. The DB stores a
// palette KEY (text) on each option; the UI maps it to Tailwind classes here.
// Class strings are full literals so Tailwind v4's JIT scanner emits them (never
// build class names by concatenation). Mirrors lib/notes/colors.ts.

export const OPTION_COLORS = [
  'gray',
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'purple',
  'pink',
] as const

export type OptionColor = (typeof OPTION_COLORS)[number]

type OptionColorClasses = {
  /** chip background + text (table cells, board cards) */
  chip: string
  /** small solid dot (board column header, option editor swatch) */
  dot: string
  /** tinted surface for a board column header strip */
  header: string
}

export const OPTION_COLOR_CLASSES: Record<OptionColor, OptionColorClasses> = {
  gray: {
    chip: 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-200',
    dot: 'bg-gray-400 dark:bg-gray-500',
    header: 'bg-gray-100 dark:bg-gray-900/60',
  },
  red: {
    chip: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-200',
    dot: 'bg-red-400 dark:bg-red-500',
    header: 'bg-red-50 dark:bg-red-950/40',
  },
  orange: {
    chip: 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-200',
    dot: 'bg-orange-400 dark:bg-orange-500',
    header: 'bg-orange-50 dark:bg-orange-950/40',
  },
  yellow: {
    chip: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200',
    dot: 'bg-yellow-400 dark:bg-yellow-500',
    header: 'bg-yellow-50 dark:bg-yellow-950/40',
  },
  green: {
    chip: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-200',
    dot: 'bg-green-400 dark:bg-green-500',
    header: 'bg-green-50 dark:bg-green-950/40',
  },
  teal: {
    chip: 'bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-200',
    dot: 'bg-teal-400 dark:bg-teal-500',
    header: 'bg-teal-50 dark:bg-teal-950/40',
  },
  blue: {
    chip: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200',
    dot: 'bg-blue-400 dark:bg-blue-500',
    header: 'bg-blue-50 dark:bg-blue-950/40',
  },
  purple: {
    chip: 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-200',
    dot: 'bg-purple-400 dark:bg-purple-500',
    header: 'bg-purple-50 dark:bg-purple-950/40',
  },
  pink: {
    chip: 'bg-pink-100 text-pink-700 dark:bg-pink-900/50 dark:text-pink-200',
    dot: 'bg-pink-400 dark:bg-pink-500',
    header: 'bg-pink-50 dark:bg-pink-950/40',
  },
}

export const OPTION_COLOR_LABELS: Record<OptionColor, string> = {
  gray: 'Gray',
  red: 'Red',
  orange: 'Orange',
  yellow: 'Yellow',
  green: 'Green',
  teal: 'Teal',
  blue: 'Blue',
  purple: 'Purple',
  pink: 'Pink',
}

export function isOptionColor(value: unknown): value is OptionColor {
  return typeof value === 'string' && (OPTION_COLORS as readonly string[]).includes(value)
}

/** Coerce an arbitrary stored/incoming value to a valid option color (→ gray). */
export function normalizeOptionColor(value: unknown): OptionColor {
  return isOptionColor(value) ? value : 'gray'
}

/** Pick the next color for a freshly-created option (cycles deterministically by
 *  count so adjacent options differ without any randomness). */
export function nextOptionColor(existingCount: number): OptionColor {
  // Skip gray (index 0) so new options get a distinct hue first.
  const hues = OPTION_COLORS.slice(1)
  return hues[existingCount % hues.length]
}
