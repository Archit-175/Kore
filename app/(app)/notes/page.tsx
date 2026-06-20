import { requireMember, verifySession } from '@/lib/dal'
import { createClient } from '@/lib/supabase/server'
import { loadBoard } from '@/lib/notes/load-board'
import { NotesBoard } from '@/components/notes/notes-board'

export default async function NotesPage() {
  const membership = await requireMember()
  const user = await verifySession()
  const supabase = await createClient()
  const board = await loadBoard(supabase, membership.workspaceId)

  return (
    <NotesBoard
      initial={board}
      workspaceId={membership.workspaceId}
      currentUserId={user.id}
      isOwner={membership.role === 'owner'}
    />
  )
}
