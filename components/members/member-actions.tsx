'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { approveMember, removeMember } from '@/lib/actions/workspace'
import { Spinner } from '@/components/spinner'

/** Approve / Deny controls for a pending join request. Runs the server action
 *  then router.refresh() so the list updates without a manual page reload. */
export function RequestActions({ membershipId }: { membershipId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const run = (fn: (id: string) => Promise<void>) =>
    startTransition(async () => {
      await fn(membershipId)
      router.refresh()
    })

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => run(approveMember)}
        className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white transition hover:bg-emerald-500 disabled:opacity-60"
      >
        {pending && <Spinner className="h-3 w-3" label="Approving" />}
        {pending ? 'Approving…' : 'Approve'}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => run(removeMember)}
        className="rounded px-2 py-1 text-xs text-red-500 transition hover:bg-red-500/10 disabled:opacity-60"
      >
        Deny
      </button>
    </div>
  )
}

/** Remove control for an active/invited member. Same refresh-after-action pattern. */
export function RemoveMemberButton({ membershipId }: { membershipId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await removeMember(membershipId)
          router.refresh()
        })
      }
      className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-red-500 transition hover:bg-red-500/10 disabled:opacity-60"
    >
      {pending && <Spinner className="h-3 w-3" label="Removing" />}
      {pending ? 'Removing…' : 'Remove'}
    </button>
  )
}
