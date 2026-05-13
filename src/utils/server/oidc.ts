import * as oidc from 'openid-client'
import { assertAuthentikEnv, type AuthentikConfig, getRunTimeEnv } from '#@/constants/env.ts'

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
