import { Suspense } from 'react'
import { AuthForm } from '@/components/auth/auth-form'

export default function SignupPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <Suspense>
        <AuthForm mode="signup" />
      </Suspense>
    </main>
  )
}
