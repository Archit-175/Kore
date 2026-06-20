import { requireOwner, verifySession } from '@/lib/dal'
import { createClient } from '@/lib/supabase/server'
import { approveMember, removeMember } from '@/lib/actions/workspace'
import { InviteForm } from '@/components/members/invite-form'
import { initials } from '@/lib/presence'
import { userColor } from '@/lib/yjs/awareness'

type Row = {
  id: string
  invited_email: string
  role: 'owner' | 'editor'
  status: 'pending' | 'requested' | 'active'
  user_id: string | null
}

export default async function MembersPage() {
  const membership = await requireOwner()
  const me = await verifySession()
  const supabase = await createClient()

  const { data } = await supabase
    .from('memberships')
    .select('id, invited_email, role, status, user_id')
    .eq('workspace_id', membership.workspaceId)
    .order('created_at')
  // `status` is a text column (typed `string` by codegen); the DB only ever
  // holds the three membership statuses, so this narrowing cast is safe.
  const rows = (data ?? []) as Row[]

  const activeIds = rows.map((r) => r.user_id).filter((id): id is string => Boolean(id))
  const profilesById = new Map<string, { full_name: string | null; email: string }>()
  if (activeIds.length) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', activeIds)
    for (const p of profs ?? []) profilesById.set(p.id, { full_name: p.full_name, email: p.email })
  }

  const nameOf = (r: Row) => {
    const p = r.user_id ? profilesById.get(r.user_id) : undefined
    return p?.full_name || p?.email || r.invited_email
  }

  const requests = rows.filter((r) => r.status === 'requested')
  const members = rows.filter((r) => r.status !== 'requested')

  function Avatar({ row }: { row: Row }) {
    return (
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
        style={{ backgroundColor: userColor(row.user_id ?? row.invited_email) }}
      >
        {initials(nameOf(row))}
      </span>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        Invite teammates by email, or approve people who request to join. Everyone joins
        as an Editor; you&apos;re the owner.
      </p>

      <div className="mt-6 rounded-lg border border-border bg-surface p-4">
        <InviteForm />
      </div>

      {requests.length > 0 && (
        <>
          <h2 className="mt-8 mb-2 text-sm font-semibold text-neutral-500 dark:text-neutral-400">
            Requests ({requests.length})
          </h2>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-amber-500/30">
            {requests.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar row={r} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{nameOf(r)}</p>
                  <p className="truncate text-xs text-neutral-400">{r.invited_email}</p>
                </div>
                <form action={approveMember.bind(null, r.id)}>
                  <button
                    type="submit"
                    className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500"
                  >
                    Approve
                  </button>
                </form>
                <form action={removeMember.bind(null, r.id)}>
                  <button
                    type="submit"
                    className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-500/10"
                  >
                    Deny
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 className="mt-8 mb-2 text-sm font-semibold text-neutral-500 dark:text-neutral-400">
        Members
      </h2>
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
        {members.map((r) => {
          const isSelf = r.user_id === me.id
          const canRemove = r.role !== 'owner' && !isSelf
          return (
            <li key={r.id} className="flex items-center gap-3 px-4 py-3">
              <Avatar row={r} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{nameOf(r)}</p>
                <p className="truncate text-xs text-neutral-400">{r.invited_email}</p>
              </div>
              <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs capitalize text-neutral-500 dark:bg-white/10 dark:text-neutral-300">
                {r.role}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  r.status === 'active'
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                }`}
              >
                {r.status === 'active' ? 'Active' : 'Invited'}
              </span>
              {canRemove && (
                <form action={removeMember.bind(null, r.id)}>
                  <button
                    type="submit"
                    className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-500/10"
                  >
                    Remove
                  </button>
                </form>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
