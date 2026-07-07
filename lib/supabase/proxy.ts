import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/types/database'

// Public paths that don't require a session. Everything else needs auth.
// `/demo` is the public, no-login sandbox — it lives outside the (app) group so
// it never hits the DAL, and this keeps the proxy from redirecting it to /login.
const PUBLIC_PREFIXES = ['/login', '/signup', '/auth', '/demo']

function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

/**
 * Refreshes the Supabase session on every request (writing rotated cookies)
 * and performs OPTIMISTIC auth redirects only. The real membership/role gate
 * lives in the DAL (lib/dal.ts) because Server Actions bypass the proxy
 * matcher — see node_modules/next/dist/docs/.../proxy.md ("Execution order").
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // Do not run code between createServerClient and getUser — it refreshes the token.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname

  // Carry any refreshed auth cookies across a redirect response.
  const redirectTo = (pathname: string, withRedirectParam = false) => {
    const url = request.nextUrl.clone()
    url.pathname = pathname
    url.search = ''
    if (withRedirectParam && path !== '/') url.searchParams.set('redirect', path)
    const redirect = NextResponse.redirect(url)
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c))
    return redirect
  }

  if (!user && !isPublic(path)) {
    return redirectTo('/login', true)
  }

  if (user && (path === '/login' || path === '/signup')) {
    return redirectTo('/')
  }

  return response
}
