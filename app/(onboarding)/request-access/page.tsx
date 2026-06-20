import { redirect } from 'next/navigation'
import { getActiveMembership, getCurrentUser, workspaceExists } from '@/lib/dal'
import { createClient } from '@/lib/supabase/server'
import { requestAccess } from '@/lib/actions/workspace'
import { SignOutButton } from '@/components/auth/sign-out-button'

export default async function RequestAccessPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (await getActiveMembership()) redirect('/')
  if (!(await workspaceExists())) redirect('/setup')

  const supabase = await createClient()
  const { data: status } = await supabase.rpc('my_membership_status')
  const alreadyRequested = status === 'requested'

  return (
    <div className="w-full max-w-md space-y-6 text-center">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {alreadyRequested ? 'Request sent' : 'Request access'}
        </h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Your account{' '}
          <span className="font-medium text-neutral-700 dark:text-neutral-200">
            {user.email}
          </span>{' '}
          {alreadyRequested
            ? "is waiting for the workspace owner to approve. You'll get in as soon as they do — refresh to check."
            : "isn't part of this workspace yet. Send a request and the owner can approve you."}
        </p>
      </div>

      {!alreadyRequested && (
        <form action={requestAccess}>
          <button
            type="submit"
            className="w-full rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-500"
          >
            Request access
          </button>
        </form>
      )}

      <SignOutButton className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400" />
    </div>
  )
}
