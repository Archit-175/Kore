'use client'

import { useActionState, useEffect, useRef } from 'react'
import { createInvite, type ActionState } from '@/lib/actions/workspace'

export function InviteForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createInvite,
    undefined,
  )
  const formRef = useRef<HTMLFormElement>(null)
  const wasPending = useRef(false)

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) formRef.current?.reset()
    wasPending.current = pending
  }, [pending, state])

  return (
    <form ref={formRef} action={action} className="space-y-2">
      <div className="flex gap-2">
        <input
          name="email"
          type="email"
          required
          placeholder="teammate@email.com"
          className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-indigo-500"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60"
        >
          {pending ? 'Inviting…' : 'Invite'}
        </button>
      </div>
      {state?.error && <p className="text-sm text-red-500">{state.error}</p>}
      <p className="text-xs text-neutral-400">
        They join automatically as an Editor when they sign up with this email.
      </p>
    </form>
  )
}
