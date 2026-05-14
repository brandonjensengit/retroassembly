import type { Page } from '@playwright/test'

/**
 * Page object for the login flow.
 *
 * Local-password auth has been removed; the app delegates to Authentik via
 * OIDC. The Playwright suite runs against a server booted with
 * `RETROASSEMBLY_RUN_TIME_OIDC_TEST_STUB=1`, which makes `/auth/start` redirect
 * straight to `/auth/callback?code=test-code&state=...` with a canned
 * identity. We don't need to interact with the login UI — we just hit
 * `/auth/start` and let the browser follow the redirect chain.
 */
export class LoginPage {
  readonly page: Page
  readonly url = 'login'

  constructor(page: Page) {
    this.page = page
  }

  async goto() {
    await this.page.goto(this.url, { waitUntil: 'load' })
  }

  async login(_user?: { username: string }, waitForLoaded = true) {
    const target = waitForLoaded ? '/library' : '/library/roms'
    await this.page.goto(`auth/start?redirect_to=${encodeURIComponent(target)}`, { waitUntil: 'load' })
    if (waitForLoaded) {
      await this.page.waitForURL('library')
    }
  }

  async waitForLoaded() {
    await this.page.waitForURL(this.url, { waitUntil: 'load' })
  }
}
