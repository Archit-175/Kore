import { test, expect } from '@playwright/test'

/**
 * Phase 6 (chat / comments / activity / search) auth-gate smoke tests. Like
 * example.spec.ts these need NO DB state — they prove the new /chat route is
 * wired into the Next.js 16 proxy.ts session gate. The authenticated happy-paths
 * (send/edit/delete a message, react, reply, comment, search) are verified by the
 * single-window Chrome inspection + the two-browser realtime ritual (see CLAUDE.md),
 * since the suite has no auth fixture.
 */
test('unauthenticated visitor cannot reach /chat', async ({ page }) => {
  await page.goto('/chat')
  await expect(page).toHaveURL(/\/login/)
})

test('unauthenticated visitor cannot reach a project (search/comment surfaces)', async ({ page }) => {
  await page.goto('/p/00000000-0000-0000-0000-000000000000')
  await expect(page).toHaveURL(/\/login/)
})
