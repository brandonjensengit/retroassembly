import { expect, mergeTests } from '@playwright/test'
import { test as pagesTest } from '../fixtures/pages.ts'
import { test as userTest } from '../fixtures/user.ts'

const test = mergeTests(userTest, pagesTest)

test('log in via SSO stub', async ({ page, pages: { library, login }, user }) => {
  await login.login(user, false)
  await expect(page).toHaveURL(new RegExp(`${library.romsURL}$`, 'u'))
})

test('log out redirects unauthenticated requests to login', async ({ page, pages: { library, login }, user }) => {
  await login.login(user)
  await library.logout()
  // After logout, OIDC end_session is stubbed to undefined, so logout falls
  // back to redirecting to '/'. Unauthenticated home then bounces to /login.
  await expect(page).toHaveURL(new RegExp(`/${login.url}$`, 'u'))

  // Navigating to a library route while logged out should also bounce to login.
  await library.goto()
  await expect(page).toHaveURL(new RegExp(`/${login.url}`, 'u'))
})

// NOTE: The previous "update password" test was removed: local-password auth
// (including password change, current-password verification, and the related
// settings UI) was deleted in favor of Authentik SSO. Account password and
// email are now managed in Authentik. If we need coverage for the equivalent
// flow we should add a stubbed Authentik account-management probe instead.
