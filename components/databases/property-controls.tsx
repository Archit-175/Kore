'use client'

import { useState } from 'react'
import {
  OPTION_COLOR_CLASSES,
  OPTION_COLORS,
  OPTION_COLOR_LABELS,
  nextOptionColor,
  type OptionColor,
} from '@/lib/databases/colors'
import {
  PROPERTY_TYPE_LABELS,
  PROPERTY_TYPES,
  type DatabaseActions,
  type DbProperty,
  type PropertyType,
  type SelectOption,
} from '@/lib/databases/types'
import { Popover, PROPERTY_TYPE_ICON } from './shared'

const SELECT_LIKE: readonly PropertyType[] = ['select', 'multi_select', 'status']

/** Per-option color picker (a row of swatches). */
function ColorDots({
  value,
  onPick,
}: {
  value: OptionColor
  onPick: (c: OptionColor) => void
}) {
  return (
    <div className="flex flex-wrap gap-1 p-1">
      {OPTION_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          title={OPTION_COLOR_LABELS[c]}
          onClick={() => onPick(c)}
          className={`h-5 w-5 rounded-full ${OPTION_COLOR_CLASSES[c].dot} ${
            value === c ? 'ring-2 ring-indigo-400 ring-offset-1 ring-offset-background' : ''
          }`}
        />
      ))}
    </div>
  )
}

/** Add / rename / recolor / remove the options of a select-like property. */
function OptionEditor({
  property,
  actions,
}: {
  property: DbProperty
  actions: DatabaseActions
}) {
  const commit = (options: SelectOption[]) => actions.updateProperty(property.id, { options })
  return (
    <div className="border-t border-border px-2 py-1.5">
      <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
        Options
      </p>
      <div className="max-h-48 space-y-1 overflow-y-auto">
        {property.options.map((o) => (
          <div key={o.id} className="flex items-center gap-1">
            <Popover
              panelClass="w-auto"
              trigger={({ setOpen }) => (
                <button
                  type="button"
                  onClick={() => setOpen(true)}
                  className={`h-4 w-4 shrink-0 rounded-full ${OPTION_COLOR_CLASSES[o.color].dot}`}
                  aria-label="Option color"
                />
              )}
            >
              {(close) => (
                <ColorDots
                  value={o.color}
                  onPick={(c) => {
                    commit(property.options.map((x) => (x.id === o.id ? { ...x, color: c } : x)))
                    close()
                  }}
                />
              )}
            </Popover>
            <input
              defaultValue={o.name}
              onBlur={(e) => {
                const name = e.target.value
                if (name !== o.name)
                  commit(property.options.map((x) => (x.id === o.id ? { ...x, name } : x)))
              }}
              className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm outline-none hover:border-border focus:border-indigo-500"
            />
            <button
              type="button"
              onClick={() => commit(property.options.filter((x) => x.id !== o.id))}
              className="shrink-0 rounded px-1 text-neutral-400 hover:text-red-600"
              aria-label="Remove option"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() =>
          commit([
            ...property.options,
            {
              id: crypto.randomUUID(),
              name: 'New option',
              color: nextOptionColor(property.options.length),
            },
          ])
        }
        className="mt-1 w-full rounded px-1 py-1 text-left text-xs text-neutral-500 hover:bg-black/5 dark:hover:bg-white/5"
      >
        + Add option
      </button>
    </div>
  )
}

/** A column header with a dropdown menu (rename / type / options / delete). */
export function PropertyHeader({
  property,
  actions,
}: {
  property: DbProperty
  actions: DatabaseActions
}) {
  const [name, setName] = useState(property.name)
  const showOptions = SELECT_LIKE.includes(property.type)
  return (
    <Popover
      panelClass="w-60"
      trigger={({ setOpen }) => (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-1.5 truncate text-left text-xs font-semibold text-neutral-500 transition hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100"
        >
          <span className="shrink-0 text-neutral-400">{PROPERTY_TYPE_ICON[property.type]}</span>
          <span className="truncate">{property.name || 'Untitled'}</span>
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="px-2 py-1.5">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name !== property.name && actions.updateProperty(property.id, { name })}
              className="w-full rounded border border-border bg-background px-2 py-1 text-sm outline-none focus:border-indigo-500"
            />
          </div>
          {property.type !== 'title' && (
            <div className="px-2 pb-1.5">
              <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                Type
              </p>
              <select
                value={property.type}
                onChange={(e) =>
                  actions.updateProperty(property.id, { type: e.target.value as PropertyType })
                }
                className="w-full rounded border border-border bg-background px-2 py-1 text-sm outline-none focus:border-indigo-500"
              >
                {PROPERTY_TYPES.filter((t) => t !== 'title').map((t) => (
                  <option key={t} value={t}>
                    {PROPERTY_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
          )}
          {showOptions && <OptionEditor property={property} actions={actions} />}
          {property.type !== 'title' && (
            <button
              type="button"
              onClick={() => {
                actions.deleteProperty(property.id)
                close()
              }}
              className="block w-full border-t border-border px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-500/10"
            >
              Delete property
            </button>
          )}
        </div>
      )}
    </Popover>
  )
}

/** The "+" header that adds a new column (pick a type). */
export function AddPropertyButton({ actions }: { actions: DatabaseActions }) {
  return (
    <Popover
      panelClass="w-44"
      trigger={({ setOpen }) => (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Add property"
          className="px-2 text-neutral-400 transition hover:text-neutral-700 dark:hover:text-neutral-200"
        >
          +
        </button>
      )}
    >
      {(close) => (
        <div className="py-0.5">
          {PROPERTY_TYPES.filter((t) => t !== 'title').map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                actions.addProperty(t)
                close()
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
            >
              <span className="w-4 text-center text-neutral-400">{PROPERTY_TYPE_ICON[t]}</span>
              {PROPERTY_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      )}
    </Popover>
  )
}
