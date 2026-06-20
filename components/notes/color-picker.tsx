'use client'

import {
  NOTE_COLORS,
  NOTE_COLOR_CLASSES,
  NOTE_COLOR_LABELS,
  type NoteColor,
} from '@/lib/notes/colors'
import { CheckIcon } from './icons'

/** A row of color swatches. Used both for note color and label color. */
export function ColorPicker({
  value,
  onChange,
}: {
  value: NoteColor
  onChange: (color: NoteColor) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {NOTE_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          title={NOTE_COLOR_LABELS[color]}
          aria-label={NOTE_COLOR_LABELS[color]}
          aria-pressed={value === color}
          onClick={() => onChange(color)}
          className={`flex h-6 w-6 items-center justify-center rounded-full ring-1 ring-inset ring-black/10 transition hover:scale-110 dark:ring-white/15 ${NOTE_COLOR_CLASSES[color].swatch} ${
            value === color ? 'outline outline-2 outline-offset-1 outline-indigo-500' : ''
          }`}
        >
          {value === color && <CheckIcon className="h-3.5 w-3.5 text-neutral-700 dark:text-neutral-200" />}
        </button>
      ))}
    </div>
  )
}
