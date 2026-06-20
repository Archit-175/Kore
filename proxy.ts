import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

// Next.js 16: this file replaces `middleware.ts` (renamed to `proxy`), runs on
// the Node.js runtime, and must NOT set a `runtime` config.
export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all paths except static assets and image files, so auth redirects
     * never block CSS/JS/images:
     * - _next/static, _next/image
     * - favicon.ico
     * - image files (svg, png, jpg, jpeg, gif, webp, ico)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
