'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { verifySession } from '@/lib/dal'

export type AuthState = { error?: string; message?: string } | undefined

const HANDLE_RE = /^[a-z0-9_]{3,20}$/

/** Update the signed-in user's own profile (display name, mention handle,
 *  avatar URL). Self-only — enforced by `profiles_update_self` RLS. */
export async function updateProfile(input: {
  fullName: string
  handle: string
  avatarUrl?: string | null
}): Promise<{ error?: string }> {
  const user = await verifySession()

  const fullName = input.fullName.trim()
  const handle = input.handle.trim().toLowerCase()
  if (!fullName) return { error: 'Display name is required.' }
  if (!HANDLE_RE.test(handle)) {
    return { error: 'Handle must be 3–20 chars: lowercase letters, numbers, or underscore.' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: fullName,
      handle,
      avatar_url: input.avatarUrl ?? null,
    })
    .eq('id', user.id)

  if (error) {
    if (error.code === '23505') return { error: 'That handle is already taken.' }
    return { error: error.message }
  }

  revalidatePath('/', 'layout')
  return {}
}

function sanitizeRedirect(target: string): string {
  // Only allow internal, single-slash paths to prevent open-redirects.
  if (target.startsWith('/') && !target.startsWith('//')) return target
  return '/'
}

export async function signInWithPassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const redirectTo = sanitizeRedirect(String(formData.get('redirect') ?? '/'))

  if (!email || !password) return { error: 'Email and password are required.' }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { error: error.message }

  redirect(redirectTo)
}

export async function signUpWithPassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const fullName = String(formData.get('fullName') ?? '').trim()

  if (!email) return { error: 'Email is required.' }
  if (password.length < 8) return { error: 'Password must be at least 8 characters.' }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName || null } },
  })
  if (error) return { error: error.message }

  // Email-confirmation enabled ⇒ no session yet.
  if (!data.session) {
    return { message: 'Check your email to confirm your account, then sign in.' }
  }

  redirect('/')
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
