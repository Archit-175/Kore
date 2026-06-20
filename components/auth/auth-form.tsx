'use client'

import { useActionState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  signInWithPassword,
  signUpWithPassword,
  type AuthState,
} from '@/lib/actions/auth'
import { GoogleButton } from './google-button'

const inputClass =
  'w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/40 dark:border-white/15 dark:bg-white/5 dark:text-neutral-100'

export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const isLogin = mode === 'login'
  const action = isLogin ? signInWithPassword : signUpWithPassword
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    action,
    undefined,
  )
  const params = useSearchParams()
  const redirectParam = params.get('redirect') ?? '/'

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {isLogin ? 'Welcome back' : 'Create your account'}
        </h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          {isLogin ? 'Sign in to Kore' : 'Join your team on Kore'}
        </p>
      </div>

      <GoogleButton next={redirectParam} />

      <div className="flex items-center gap-3 text-xs text-neutral-400">
        <span className="h-px flex-1 bg-black/10 dark:bg-white/10" />
        or
        <span className="h-px flex-1 bg-black/10 dark:bg-white/10" />
      </div>

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="redirect" value={redirectParam} />
        {!isLogin && (
          <input
            name="fullName"
            type="text"
            autoComplete="name"
            placeholder="Full name"
            className={inputClass}
          />
        )}
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="Email"
          className={inputClass}
        />
        <input
          name="password"
          type="password"
          required
          minLength={isLogin ? undefined : 8}
          autoComplete={isLogin ? 'current-password' : 'new-password'}
          placeholder="Password"
          className={inputClass}
        />

        {state?.error && (
          <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
        )}
        {state?.message && (
          <p className="text-sm text-emerald-600 dark:text-emerald-400">
            {state.message}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60"
        >
          {pending ? 'Please wait…' : isLogin ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <p className="text-center text-sm text-neutral-500 dark:text-neutral-400">
        {isLogin ? "Don't have an account? " : 'Already have an account? '}
        <Link
          href={isLogin ? '/signup' : '/login'}
          className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
        >
          {isLogin ? 'Sign up' : 'Sign in'}
        </Link>
      </p>
    </div>
  )
}
