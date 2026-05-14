import { getContext } from 'hono/context-storage'
import { setCookie } from 'hono/cookie'
import * as oidc from 'openid-client'
import { defaultRedirectTo } from '#@/constants/auth.ts'
import { buildAuthorizationUrl } from '#@/utils/server/oidc.ts'
import { sanitizeRedirectTo } from '#@/utils/server/safe-redirect.ts'
import type { Route } from './+types/auth.start.ts'

export async function loader({ request }: Route.LoaderArgs) {
  const c = getContext()
  const url = new URL(request.url)
  const redirectTo = sanitizeRedirectTo(url.searchParams.get('redirect_to'), defaultRedirectTo)

  const state = oidc.randomState()
  const nonce = oidc.randomNonce()
  const codeVerifier = oidc.randomPKCECodeVerifier()

  const cookie = { httpOnly: true, maxAge: 300, path: '/', sameSite: 'Lax', secure: false } as const
  setCookie(c, 'oidc_state', state, cookie)
  setCookie(c, 'oidc_nonce', nonce, cookie)
  setCookie(c, 'oidc_verifier', codeVerifier, cookie)
  setCookie(c, 'oidc_redirect_to', redirectTo, cookie)

  const authUrl = await buildAuthorizationUrl({ codeVerifier, nonce, state })
  throw c.redirect(authUrl.toString())
}

export { noop as default } from 'es-toolkit'
