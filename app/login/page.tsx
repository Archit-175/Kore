import { Suspense } from 'react'
import { AuthForm } from '@/components/auth/auth-form'

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <Suspense>
        <AuthForm mode="login" />
      </Suspense>
    </main>
  )
}
