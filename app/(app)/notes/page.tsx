import { requireMember } from '@/lib/dal'
import { createClient } from '@/lib/supabase/server'
import { loadBoard } from '@/lib/notes/load-board'
import { NotesBoard } from '@/components/notes/notes-board'

export default async function NotesPage() {
  const membership = await requireMember()
  const supabase = await createClient()
  const board = await loadBoard(supabase, membership.workspaceId)

  return (
    <NotesBoard
      initial={board}
      workspaceId={membership.workspaceId}
      isOwner={membership.role === 'owner'}
    />
  )
}
