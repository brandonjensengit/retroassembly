import { test as base } from '@playwright/test'

/**
 * Test user fixture for the SSO/stub flow.
 *
 * The legacy local-password registration flow no longer exists. When the
 * server is started with `RETROASSEMBLY_RUN_TIME_OIDC_TEST_STUB=1`, the OIDC
 * client short-circuits and returns a canned identity (see
 * `src/utils/server/oidc.ts`). All tests therefore share the same stub user.
 */
interface User {
  username: string
}

export const test = base.extend<{ user: User }>({
  user: [
    async ({ page: _page }, use) => {
      await use({ username: 'tester' })
    },
    { scope: 'test' },
  ],
})
