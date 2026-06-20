import { getPresenceUser, requireMember, verifySession } from '@/lib/dal'
import { createClient } from '@/lib/supabase/server'
import { loadChatMessages } from '@/lib/chat/load-chat'
import { loadWorkspaceMembers } from '@/lib/databases/load-database'
import { ChatView } from '@/components/chat/chat-view'

export default async function ChatPage() {
  const membership = await requireMember()
  const user = await verifySession()
  const presence = await getPresenceUser()
  const supabase = await createClient()

  const [page, members] = await Promise.all([
    loadChatMessages(supabase, membership.workspaceId, user.id, {}),
    loadWorkspaceMembers(supabase, membership.workspaceId),
  ])

  return (
    <ChatView
      initial={page}
      members={members}
      workspaceId={membership.workspaceId}
      user={presence}
      isOwner={membership.role === 'owner'}
    />
  )
}
