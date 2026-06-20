import { test, expect } from '@playwright/test'

/**
 * Auth-gate smoke test (no DB state required): proves the dev server, the
 * Next.js 16 `proxy.ts` session gate, and the auth pages are wired together.
 *
 * The realtime collaboration ritual (two browsers, live edit + cursor) needs
 * the migration applied + Realtime Authorization enabled — see CLAUDE.md.
 */
test('unauthenticated visitor is redirected to /login', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible()
  await expect(page.getByPlaceholder('Email')).toBeVisible()
})

test('signup page renders', async ({ page }) => {
  await page.goto('/signup')
  await expect(page.getByRole('button', { name: /create account/i })).toBeVisible()
})
