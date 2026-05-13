import { getContext } from 'hono/context-storage'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { defaultRedirectTo } from '#@/constants/auth.ts'
import { createSession } from '#@/controllers/sessions/create-session.ts'
import { upsertOidcUser } from '#@/controllers/users/upsert-oidc-user.ts'
import { exchangeCode, type ExtractedClaims } from '#@/utils/server/oidc.ts'
import type { Route } from './+types/auth.callback.ts'

export async function loader({ request }: Route.LoaderArgs) {
  const c = getContext()
  const url = new URL(request.url)

  const state = getCookie(c, 'oidc_state')
  const nonce = getCookie(c, 'oidc_nonce')
  const verifier = getCookie(c, 'oidc_verifier')
  const redirectTo = getCookie(c, 'oidc_redirect_to') ?? defaultRedirectTo

  if (!state || !nonce || !verifier) {
    return new Response('Login state missing or expired. Please try again.', { status: 400 })
  }

  let claims: ExtractedClaims
  try {
    claims = await exchangeCode({
      codeVerifier: verifier,
      currentUrl: url,
      expectedNonce: nonce,
      expectedState: state,
    })
  } catch (error) {
    console.error('OIDC exchange failed:', error)
    return new Response('SSO login failed. Please try again.', { status: 401 })
  }

  const user = await upsertOidcUser(claims)
  const { session } = await createSession({ userId: user.id })

  for (const name of ['oidc_state', 'oidc_nonce', 'oidc_verifier', 'oidc_redirect_to']) {
    deleteCookie(c, name)
  }
  setCookie(c, 'token', session.token, {
    expires: session.expiresAt,
    httpOnly: true,
    path: '/',
    sameSite: 'Strict',
    secure: false,
  })

  throw c.redirect(redirectTo)
}

export { noop as default } from 'es-toolkit'
