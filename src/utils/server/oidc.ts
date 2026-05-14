import * as oidc from 'openid-client'
import { assertAuthentikEnv, type AuthentikConfig, getRunTimeEnv } from '#@/constants/env.ts'

/**
 * Test-mode escape hatch for the OIDC client.
 *
 * When `RETROASSEMBLY_RUN_TIME_OIDC_TEST_STUB === '1'`, the network-facing
 * functions in this module (buildAuthorizationUrl, exchangeCode,
 * buildEndSessionUrl) short-circuit and return canned values so the Playwright
 * e2e suite can drive the SSO flow end-to-end without contacting a real
 * Authentik instance.
 *
 * The flag is gated on a specific, opt-in env var so it is impossible to
 * accidentally activate in production (a normal deployment never sets it).
 * It is read once at module load — tests must export the env var before the
 * server boots.
 *
 * The other env vars asserted by `assertAuthentikEnv` (issuer, client id,
 * client secret, redirect uri, uploader group) must still be set to
 * non-empty values for the app to boot. Tests can use fake values; they are
 * never sent to a network.
 */
const TEST_STUB_ENABLED = process.env.RETROASSEMBLY_RUN_TIME_OIDC_TEST_STUB === '1'

const TEST_STUB_CODE = 'test-code'

interface OidcClaims {
  sub?: string
  email?: string
  name?: string
  preferred_username?: string
  groups?: unknown
}

export interface ExtractedClaims {
  oidcSub: string
  email: string
  displayName: string
  username: string
  groups: string[]
}

export function extractUserClaims(claims: OidcClaims): ExtractedClaims {
  if (!claims.sub) {
    throw new Error('ID token missing required claim: sub')
  }
  const email = claims.email ?? ''
  const username =
    claims.preferred_username && claims.preferred_username.length > 0
      ? claims.preferred_username
      : email.split('@')[0] || claims.sub
  return {
    displayName: claims.name ?? username,
    email,
    groups: Array.isArray(claims.groups) ? (claims.groups as string[]) : [],
    oidcSub: claims.sub,
    username,
  }
}

let cachedConfig: oidc.Configuration | undefined

export async function getOidcConfig(): Promise<oidc.Configuration> {
  if (cachedConfig) {
    return cachedConfig
  }
  const env = assertAuthentikEnv(getRunTimeEnv())
  cachedConfig = await oidc.discovery(new URL(env.issuer), env.clientId, env.clientSecret)
  return cachedConfig
}

export function getAuthentikConfig(): AuthentikConfig {
  return assertAuthentikEnv(getRunTimeEnv())
}

export async function buildAuthorizationUrl(opts: {
  state: string
  codeVerifier: string
  nonce: string
}): Promise<URL> {
  if (TEST_STUB_ENABLED) {
    const env = getAuthentikConfig()
    const url = new URL(env.redirectUri)
    url.searchParams.set('code', TEST_STUB_CODE)
    url.searchParams.set('state', opts.state)
    return url
  }
  const cfg = await getOidcConfig()
  const env = getAuthentikConfig()
  const codeChallenge = await oidc.calculatePKCECodeChallenge(opts.codeVerifier)
  return oidc.buildAuthorizationUrl(cfg, {
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    nonce: opts.nonce,
    redirect_uri: env.redirectUri,
    scope: 'openid email profile groups',
    state: opts.state,
  })
}

export async function exchangeCode(opts: {
  currentUrl: URL
  codeVerifier: string
  expectedState: string
  expectedNonce: string
}): Promise<ExtractedClaims> {
  if (TEST_STUB_ENABLED && opts.currentUrl.searchParams.get('code') === TEST_STUB_CODE) {
    return {
      displayName: 'Tester',
      email: 'tester@example.com',
      groups: ['retroassembly-uploaders'],
      oidcSub: 'test-user-sub',
      username: 'tester',
    }
  }
  const cfg = await getOidcConfig()
  const tokens = await oidc.authorizationCodeGrant(cfg, opts.currentUrl, {
    expectedNonce: opts.expectedNonce,
    expectedState: opts.expectedState,
    pkceCodeVerifier: opts.codeVerifier,
  })
  const claims = tokens.claims()
  if (!claims) {
    throw new Error('Token response missing ID token claims')
  }
  return extractUserClaims(claims as OidcClaims)
}

export async function buildEndSessionUrl(opts: { postLogoutRedirectUri: string }): Promise<URL | undefined> {
  if (TEST_STUB_ENABLED) {
    return undefined
  }
  const cfg = await getOidcConfig()
  const meta = cfg.serverMetadata()
  if (!meta.end_session_endpoint) {
    return undefined
  }
  const url = new URL(meta.end_session_endpoint)
  url.searchParams.set('post_logout_redirect_uri', opts.postLogoutRedirectUri)
  url.searchParams.set('client_id', getAuthentikConfig().clientId)
  return url
}
