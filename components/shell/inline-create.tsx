'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import type { ActionState } from '@/lib/actions/workspace'
import { Spinner } from '@/components/spinner'

/** Tiny "+ add" affordance that reveals an input bound to a server action. */
export function InlineCreate({
  action,
  placeholder,
  triggerLabel,
  hidden = [],
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>
  placeholder: string
  triggerLabel: string
  hidden?: { name: string; value: string }[]
}) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, undefined)
  const inputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const wasPending = useRef(false)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) {
      setOpen(false)
      formRef.current?.reset()
    }
    wasPending.current = pending
  }, [pending, state])

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded px-2 py-1 text-left text-xs text-neutral-400 transition hover:bg-black/5 hover:text-neutral-600 dark:hover:bg-white/5 dark:hover:text-neutral-300"
      >
        + {triggerLabel}
      </button>
    )
  }

  return (
    <form ref={formRef} action={formAction} className="px-1 py-0.5">
      {hidden.map((h) => (
        <input key={h.name} type="hidden" name={h.name} value={h.value} />
      ))}
      <div className="relative">
        <input
          ref={inputRef}
          name="name"
          placeholder={placeholder}
          disabled={pending}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false)
          }}
          className="w-full rounded border border-border bg-background px-2 py-1 pr-7 text-sm outline-none focus:border-indigo-500 disabled:opacity-60"
        />
        {pending && (
          <Spinner
            label={`Creating ${placeholder.toLowerCase()}`}
            className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-indigo-500"
          />
        )}
      </div>
      {state?.error && <p className="px-1 pt-1 text-xs text-red-500">{state.error}</p>}
    </form>
  )
}
