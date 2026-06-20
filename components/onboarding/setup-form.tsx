'use client'

import { useActionState } from 'react'
import { bootstrapWorkspace, type ActionState } from '@/lib/actions/workspace'

export function SetupForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    bootstrapWorkspace,
    undefined,
  )

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Create your workspace</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          You&apos;re the first one here — name your workspace to get started. You&apos;ll
          be the owner.
        </p>
      </div>

      <form action={formAction} className="space-y-3">
        <input
          name="name"
          type="text"
          required
          defaultValue="Kore"
          placeholder="Workspace name"
          className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/40 dark:border-white/15 dark:bg-white/5 dark:text-neutral-100"
        />
        {state?.error && (
          <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60"
        >
          {pending ? 'Creating…' : 'Create workspace'}
        </button>
      </form>
    </div>
  )
}
