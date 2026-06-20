import { verifySession } from '@/lib/dal'

// Requires authentication, but NOT workspace membership (that's the whole point
// of the setup / request-access screens).
export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await verifySession()
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      {children}
    </main>
  )
}
