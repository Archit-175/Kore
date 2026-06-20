import { redirect } from 'next/navigation'
import { getActiveMembership, workspaceExists } from '@/lib/dal'
import { SetupForm } from '@/components/onboarding/setup-form'

export default async function SetupPage() {
  // A workspace already exists ⇒ this user can't bootstrap one.
  if (await workspaceExists()) {
    const membership = await getActiveMembership()
    redirect(membership ? '/' : '/request-access')
  }
  return <SetupForm />
}
