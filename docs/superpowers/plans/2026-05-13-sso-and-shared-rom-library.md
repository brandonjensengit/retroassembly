# Authentik SSO + Shared ROM Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing local-password + Supabase auth with direct OIDC against an Authentik instance, and switch the ROM library from per-user to shared (with uploads gated by an Authentik group).

**Architecture:** Direct OIDC client (`openid-client` library) talks to Authentik. Sessions still ride on the existing `sessions` table with HTTP-only cookies. ROMs lose their `userId`-scoped query filters and the column is renamed `uploadedBy` for attribution. A new `requireUploader` middleware gates upload/delete endpoints based on the snapshotted `groups` claim.

**Tech Stack:** Hono (server), React Router 7 (routes), Drizzle ORM (SQLite/D1), `openid-client` v6 (new dependency), Vitest (new — for unit tests of OIDC helpers), Playwright (existing — e2e).

**Reference spec:** [docs/superpowers/specs/2026-05-13-sso-and-shared-rom-library-design.md](../specs/2026-05-13-sso-and-shared-rom-library-design.md)

---

## Phase A — SSO foundation

Phase A leaves the ROM library per-user. After Phase A, the app authenticates via Authentik but ROMs are still scoped to whoever uploaded them. This is intentional — Phase A is independently shippable.

### Task A1: Add Authentik env vars and startup validation

**Files:**

- Modify: `src/constants/env.ts`
- Create: `src/constants/env.test.ts`
- Modify: `package.json` (add `vitest` to devDependencies)
- Create: `vitest.config.ts`

- [ ] **Step 1: Add `vitest` and unit-test scaffolding**

Add vitest as a dev dependency:

```bash
source ~/.nvm/nvm.sh && nvm use 25 && pnpm add -D vitest@^2.1.0
```

Create `vitest.config.ts` at the repo root:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
```

Add a `test:unit` script to `package.json`'s `scripts` block:

```json
"test:unit": "vitest run"
```

- [ ] **Step 2: Write failing test for required-env validation**

Create `src/constants/env.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { assertAuthentikEnv } from './env.ts'

describe('assertAuthentikEnv', () => {
  it('throws when AUTHENTIK_ISSUER is missing', () => {
    expect(() =>
      assertAuthentikEnv({
        RETROASSEMBLY_RUN_TIME_AUTHENTIK_ISSUER: '',
        RETROASSEMBLY_RUN_TIME_AUTHENTIK_CLIENT_ID: 'cid',
        RETROASSEMBLY_RUN_TIME_AUTHENTIK_CLIENT_SECRET: 'sec',
        RETROASSEMBLY_RUN_TIME_AUTHENTIK_REDIRECT_URI: 'https://x/cb',
        RETROASSEMBLY_RUN_TIME_AUTHENTIK_UPLOADER_GROUP: 'g',
        RETROASSEMBLY_RUN_TIME_SESSION_SECRET: 'sssss',
      }),
    ).toThrow(/AUTHENTIK_ISSUER/)
  })

  it('returns the typed config when all vars present', () => {
    const cfg = assertAuthentikEnv({
      RETROASSEMBLY_RUN_TIME_AUTHENTIK_ISSUER: 'https://auth.example/application/o/r/',
      RETROASSEMBLY_RUN_TIME_AUTHENTIK_CLIENT_ID: 'cid',
      RETROASSEMBLY_RUN_TIME_AUTHENTIK_CLIENT_SECRET: 'sec',
      RETROASSEMBLY_RUN_TIME_AUTHENTIK_REDIRECT_URI: 'https://x/cb',
      RETROASSEMBLY_RUN_TIME_AUTHENTIK_UPLOADER_GROUP: 'uploaders',
      RETROASSEMBLY_RUN_TIME_SESSION_SECRET: 'a-secret-of-sufficient-length',
    })
    expect(cfg.issuer).toBe('https://auth.example/application/o/r/')
    expect(cfg.uploaderGroup).toBe('uploaders')
  })

  it('throws when SESSION_SECRET is shorter than 16 chars', () => {
    expect(() =>
      assertAuthentikEnv({
        RETROASSEMBLY_RUN_TIME_AUTHENTIK_ISSUER: 'https://auth.example/application/o/r/',
        RETROASSEMBLY_RUN_TIME_AUTHENTIK_CLIENT_ID: 'cid',
        RETROASSEMBLY_RUN_TIME_AUTHENTIK_CLIENT_SECRET: 'sec',
        RETROASSEMBLY_RUN_TIME_AUTHENTIK_REDIRECT_URI: 'https://x/cb',
        RETROASSEMBLY_RUN_TIME_AUTHENTIK_UPLOADER_GROUP: 'g',
        RETROASSEMBLY_RUN_TIME_SESSION_SECRET: 'short',
      }),
    ).toThrow(/SESSION_SECRET/)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test:unit src/constants/env.test.ts`
Expected: FAIL — `assertAuthentikEnv` is not exported.

- [ ] **Step 4: Add `assertAuthentikEnv` and new defaults to `src/constants/env.ts`**

In `src/constants/env.ts`, inside the `getRunTimeEnv()` defaults object, add:

```ts
RETROASSEMBLY_RUN_TIME_AUTHENTIK_ISSUER: '',
RETROASSEMBLY_RUN_TIME_AUTHENTIK_CLIENT_ID: '',
RETROASSEMBLY_RUN_TIME_AUTHENTIK_CLIENT_SECRET: '',
RETROASSEMBLY_RUN_TIME_AUTHENTIK_REDIRECT_URI: '',
RETROASSEMBLY_RUN_TIME_AUTHENTIK_UPLOADER_GROUP: '',
RETROASSEMBLY_RUN_TIME_AUTHENTIK_LOGIN_BUTTON_LABEL: 'Log in with SSO',
RETROASSEMBLY_RUN_TIME_SESSION_SECRET: '',
```

Then append at the bottom of the file:

```ts
export interface AuthentikConfig {
  issuer: string
  clientId: string
  clientSecret: string
  redirectUri: string
  uploaderGroup: string
  loginButtonLabel: string
  sessionSecret: string
}

export function assertAuthentikEnv(env: Record<string, string | undefined>): AuthentikConfig {
  const required = [
    'RETROASSEMBLY_RUN_TIME_AUTHENTIK_ISSUER',
    'RETROASSEMBLY_RUN_TIME_AUTHENTIK_CLIENT_ID',
    'RETROASSEMBLY_RUN_TIME_AUTHENTIK_CLIENT_SECRET',
    'RETROASSEMBLY_RUN_TIME_AUTHENTIK_REDIRECT_URI',
    'RETROASSEMBLY_RUN_TIME_AUTHENTIK_UPLOADER_GROUP',
    'RETROASSEMBLY_RUN_TIME_SESSION_SECRET',
  ] as const
  for (const key of required) {
    if (!env[key]) throw new Error(`Missing required env var: ${key.replace('RETROASSEMBLY_RUN_TIME_', '')}`)
  }
  const sessionSecret = env.RETROASSEMBLY_RUN_TIME_SESSION_SECRET!
  if (sessionSecret.length < 16) {
    throw new Error('SESSION_SECRET must be at least 16 characters')
  }
  return {
    issuer: env.RETROASSEMBLY_RUN_TIME_AUTHENTIK_ISSUER!,
    clientId: env.RETROASSEMBLY_RUN_TIME_AUTHENTIK_CLIENT_ID!,
    clientSecret: env.RETROASSEMBLY_RUN_TIME_AUTHENTIK_CLIENT_SECRET!,
    redirectUri: env.RETROASSEMBLY_RUN_TIME_AUTHENTIK_REDIRECT_URI!,
    uploaderGroup: env.RETROASSEMBLY_RUN_TIME_AUTHENTIK_UPLOADER_GROUP!,
    loginButtonLabel: env.RETROASSEMBLY_RUN_TIME_AUTHENTIK_LOGIN_BUTTON_LABEL || 'Log in with SSO',
    sessionSecret,
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test:unit src/constants/env.test.ts`
Expected: PASS, all three cases.

- [ ] **Step 6: Commit**

```bash
git add src/constants/env.ts src/constants/env.test.ts vitest.config.ts package.json pnpm-lock.yaml
git commit -m "feat(env): add Authentik config vars and startup validation"
```

---

### Task A2: Add OIDC client wrapper

**Files:**

- Create: `src/utils/server/oidc.ts`
- Create: `src/utils/server/oidc.test.ts`
- Modify: `package.json` (add `openid-client`)

- [ ] **Step 1: Install `openid-client`**

```bash
source ~/.nvm/nvm.sh && nvm use 25 && pnpm add openid-client@^6.0.0
```

- [ ] **Step 2: Write failing test for ID token claim extraction**

Create `src/utils/server/oidc.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { extractUserClaims } from './oidc.ts'

describe('extractUserClaims', () => {
  it('extracts sub, email, name, preferred_username, groups from claims', () => {
    const claims = {
      sub: 'abc-123',
      email: 'alice@example.com',
      name: 'Alice Doe',
      preferred_username: 'alice',
      groups: ['retroassembly-uploaders', 'staff'],
    }
    expect(extractUserClaims(claims)).toEqual({
      oidcSub: 'abc-123',
      email: 'alice@example.com',
      displayName: 'Alice Doe',
      username: 'alice',
      groups: ['retroassembly-uploaders', 'staff'],
    })
  })

  it('falls back to email-local-part when preferred_username is missing', () => {
    expect(extractUserClaims({ sub: 'x', email: 'bob@example.com', name: 'Bob' })).toMatchObject({ username: 'bob' })
  })

  it('returns empty groups array when claim absent or non-array', () => {
    expect(extractUserClaims({ sub: 'x', email: 'c@e.com', name: 'C' })).toMatchObject({ groups: [] })
    expect(
      extractUserClaims({ sub: 'x', email: 'c@e.com', name: 'C', groups: 'not-an-array' as unknown as string[] }),
    ).toMatchObject({ groups: [] })
  })

  it('throws when sub is missing', () => {
    expect(() => extractUserClaims({ email: 'x@y' } as never)).toThrow(/sub/)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test:unit src/utils/server/oidc.test.ts`
Expected: FAIL — `extractUserClaims` is not exported.

- [ ] **Step 4: Implement `src/utils/server/oidc.ts`**

```ts
import * as oidc from 'openid-client'
import { getRunTimeEnv, assertAuthentikEnv, type AuthentikConfig } from '#@/constants/env.ts'

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
  if (!claims.sub) throw new Error('ID token missing required claim: sub')
  const email = claims.email ?? ''
  const username =
    claims.preferred_username && claims.preferred_username.length > 0
      ? claims.preferred_username
      : email.split('@')[0] || claims.sub
  return {
    oidcSub: claims.sub,
    email,
    displayName: claims.name ?? username,
    username,
    groups: Array.isArray(claims.groups) ? (claims.groups as string[]) : [],
  }
}

let cachedConfig: oidc.Configuration | undefined

export async function getOidcConfig(): Promise<oidc.Configuration> {
  if (cachedConfig) return cachedConfig
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
    redirect_uri: env.redirectUri,
    scope: 'openid email profile groups',
    state: opts.state,
    nonce: opts.nonce,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
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
    pkceCodeVerifier: opts.codeVerifier,
    expectedState: opts.expectedState,
    expectedNonce: opts.expectedNonce,
  })
  const claims = tokens.claims()
  if (!claims) throw new Error('Token response missing ID token claims')
  return extractUserClaims(claims as OidcClaims)
}

export async function buildEndSessionUrl(opts: { postLogoutRedirectUri: string }): Promise<URL | undefined> {
  const cfg = await getOidcConfig()
  const meta = cfg.serverMetadata()
  if (!meta.end_session_endpoint) return undefined
  const url = new URL(meta.end_session_endpoint)
  url.searchParams.set('post_logout_redirect_uri', opts.postLogoutRedirectUri)
  url.searchParams.set('client_id', getAuthentikConfig().clientId)
  return url
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test:unit src/utils/server/oidc.test.ts`
Expected: PASS, all four cases.

- [ ] **Step 6: Commit**

```bash
git add src/utils/server/oidc.ts src/utils/server/oidc.test.ts package.json pnpm-lock.yaml
git commit -m "feat(oidc): add openid-client wrapper with discovery, PKCE, and token validation"
```

---

### Task A3: Migrate user schema for OIDC fields

**Files:**

- Modify: `src/databases/schema.ts:28-38`
- Generate: new file under `src/databases/migrations/`

- [ ] **Step 1: Update `userTable` definition**

In `src/databases/schema.ts`, replace the `userTable` block (lines 28-38) with:

```ts
export const userTable = sqliteTable(
  'users',
  {
    oidcSub: text().notNull(),
    email: text().notNull().default(''),
    displayName: text().notNull().default(''),
    groups: text({ mode: 'json' })
      .$type<string[]>()
      .notNull()
      .$defaultFn(() => []),
    username: text().notNull(),
    lastLoginAt: integer({ mode: 'timestamp_ms' }),
    ...baseSchema,
  },
  (table) => [uniqueIndex('idx_users_oidc_sub').on(table.oidcSub), index('idx_users_username').on(table.username)],
)
```

(Note: this drops `passwordHash`, `registrationIp`, `registrationUserAgent`. Any existing rows will be removed in the next step.)

- [ ] **Step 2: Pre-migration: wipe existing users (dev DB only)**

For the local dev DB this is a fresh setup; no data to lose. Document this in the migration file's comment header in step 3.

- [ ] **Step 3: Generate the Drizzle migration**

```bash
source ~/.nvm/nvm.sh && nvm use 25 && pnpm exec drizzle-kit generate --name=sso_user_schema
```

Drizzle generates a file like `src/databases/migrations/0006_*.sql`. Open it and add this comment at the very top:

```sql
-- DESTRUCTIVE: drops password/registration columns. Existing user rows will fail to migrate; recreate users via SSO.
```

- [ ] **Step 4: Apply migrations to local dev DB**

```bash
source ~/.nvm/nvm.sh && nvm use 25 && rm -f data/retroassembly.sqlite && node --run=setup
```

Expected: setup completes without errors. Fresh DB has the new users schema.

- [ ] **Step 5: Verify schema with sqlite CLI**

```bash
sqlite3 data/retroassembly.sqlite ".schema users"
```

Expected: output contains `oidc_sub`, `email`, `display_name`, `groups`, `username`, `last_login_at`. No `password_hash`, `registration_ip`, `registration_user_agent`.

- [ ] **Step 6: Commit**

```bash
git add src/databases/schema.ts src/databases/migrations/
git commit -m "feat(schema): migrate users table to OIDC-backed identity fields"
```

---

### Task A4: Replace login/callback/logout routes

**Files:**

- Modify: `src/pages/routes/login.tsx`
- Modify: `src/pages/login/page.tsx`
- Create: `src/pages/routes/auth.start.ts`
- Create: `src/pages/routes/auth.callback.ts`
- Modify: `src/pages/routes/logout.ts`
- Create: `src/controllers/users/upsert-oidc-user.ts`
- Modify: `src/controllers/sessions/create-session.ts` (the existing helper) — review for compatibility

- [ ] **Step 1: Add `upsertOidcUser` controller**

Create `src/controllers/users/upsert-oidc-user.ts`:

```ts
import { eq } from 'drizzle-orm'
import { getContext } from 'hono/context-storage'
import { userTable, statusEnum } from '#@/databases/schema.ts'
import type { ExtractedClaims } from '#@/utils/server/oidc.ts'

export async function upsertOidcUser(claims: ExtractedClaims) {
  const { db } = getContext().var
  const [existing] = await db.library.select().from(userTable).where(eq(userTable.oidcSub, claims.oidcSub)).limit(1)

  if (existing) {
    await db.library
      .update(userTable)
      .set({
        email: claims.email,
        displayName: claims.displayName,
        groups: claims.groups,
        username: claims.username,
        lastLoginAt: new Date(),
        status: statusEnum.normal,
      })
      .where(eq(userTable.id, existing.id))
    return { id: existing.id }
  }

  const [inserted] = await db.library
    .insert(userTable)
    .values({
      oidcSub: claims.oidcSub,
      email: claims.email,
      displayName: claims.displayName,
      groups: claims.groups,
      username: claims.username,
      lastLoginAt: new Date(),
    })
    .returning({ id: userTable.id })
  return { id: inserted.id }
}
```

- [ ] **Step 2: Add `/auth/start` route**

Create `src/pages/routes/auth.start.ts`:

```ts
import { getContext } from 'hono/context-storage'
import { setCookie } from 'hono/cookie'
import * as oidc from 'openid-client'
import { buildAuthorizationUrl } from '#@/utils/server/oidc.ts'
import type { Route } from './+types/auth.start.ts'

export async function loader({ request }: Route.LoaderArgs) {
  const c = getContext()
  const url = new URL(request.url)
  const redirectTo = url.searchParams.get('redirect_to') ?? '/library'

  const state = oidc.randomState()
  const nonce = oidc.randomNonce()
  const codeVerifier = oidc.randomPKCECodeVerifier()

  const cookie = { httpOnly: true, path: '/', sameSite: 'Lax', secure: false, maxAge: 300 } as const
  setCookie(c, 'oidc_state', state, cookie)
  setCookie(c, 'oidc_nonce', nonce, cookie)
  setCookie(c, 'oidc_verifier', codeVerifier, cookie)
  setCookie(c, 'oidc_redirect_to', redirectTo, cookie)

  const authUrl = await buildAuthorizationUrl({ state, nonce, codeVerifier })
  throw c.redirect(authUrl.toString())
}
```

Add the route to React Router config. Inspect `src/server/app.ts` and any router/manifest files for the existing pattern — file naming (`auth.start.ts`) implies the URL `/auth/start` per React Router 7 file conventions. If the project uses a manifest, add the entry there.

- [ ] **Step 3: Add `/auth/callback` route**

Create `src/pages/routes/auth.callback.ts`:

```ts
import { getContext } from 'hono/context-storage'
import { getCookie, deleteCookie, setCookie } from 'hono/cookie'
import { createSession } from '#@/controllers/sessions/create-session.ts'
import { upsertOidcUser } from '#@/controllers/users/upsert-oidc-user.ts'
import { exchangeCode } from '#@/utils/server/oidc.ts'
import type { Route } from './+types/auth.callback.ts'

export async function loader({ request }: Route.LoaderArgs) {
  const c = getContext()
  const url = new URL(request.url)

  const state = getCookie(c, 'oidc_state')
  const nonce = getCookie(c, 'oidc_nonce')
  const verifier = getCookie(c, 'oidc_verifier')
  const redirectTo = getCookie(c, 'oidc_redirect_to') ?? '/library'

  if (!state || !nonce || !verifier) {
    return new Response('Login state missing or expired. Please try again.', { status: 400 })
  }

  let claims
  try {
    claims = await exchangeCode({
      currentUrl: url,
      codeVerifier: verifier,
      expectedState: state,
      expectedNonce: nonce,
    })
  } catch (err) {
    console.error('OIDC exchange failed:', err)
    return new Response('SSO login failed. Please try again.', { status: 401 })
  }

  const user = await upsertOidcUser(claims)
  const session = await createSession({ userId: user.id })

  for (const name of ['oidc_state', 'oidc_nonce', 'oidc_verifier', 'oidc_redirect_to']) deleteCookie(c, name)
  setCookie(c, 'token', session.token, {
    expires: session.expiresAt,
    httpOnly: true,
    path: '/',
    sameSite: 'Strict',
    secure: false,
  })

  throw c.redirect(redirectTo)
}
```

Note: if `createSession` currently takes a `{ username, password }` form, refactor it (or add an overload `createSession({ userId })`) — see Step 5.

- [ ] **Step 4: Replace login page UI with single button**

Replace `src/pages/routes/login.tsx` entirely:

```tsx
import { getContext } from 'hono/context-storage'
import { getAuthentikConfig } from '#@/utils/server/oidc.ts'
import { LoginPage } from '../login/page.tsx'
import type { Route } from './+types/login.ts'

export async function loader({ request }: Route.LoaderArgs) {
  const c = getContext()
  const { currentUser, t } = c.var
  const { searchParams } = new URL(request.url)
  const redirectTo = searchParams.get('redirect_to') ?? '/library'

  if (currentUser) {
    throw c.redirect(redirectTo)
  }

  const authentik = getAuthentikConfig()
  return {
    buttonLabel: authentik.loginButtonLabel,
    redirectTo,
    title: t('auth.login'),
  }
}

export default function LoginRoute() {
  return <LoginPage />
}
```

Replace `src/pages/login/page.tsx` with:

```tsx
import { useTranslation } from 'react-i18next'
import { useLoaderData } from 'react-router'
import { metadata } from '#@/constants/metadata.ts'
import type { loader } from '../routes/login.tsx'
import { PageContainer } from './components/page-container.tsx'

export function LoginPage() {
  const { t } = useTranslation()
  const { buttonLabel, redirectTo } = useLoaderData<typeof loader>()
  const startUrl = `/auth/start?redirect_to=${encodeURIComponent(redirectTo)}`

  return (
    <PageContainer
      title={t('auth.loginToTitle', { title: metadata.title })}
      description={t('auth.loginToBuildCollection')}
    >
      <a
        href={startUrl}
        className='inline-block px-6 py-3 rounded-md bg-accent-9 text-white font-medium hover:bg-accent-10'
      >
        {buttonLabel}
      </a>
    </PageContainer>
  )
}
```

- [ ] **Step 5: Adapt or overload `createSession`**

Read `src/controllers/sessions/create-session.ts`. If it accepts `{ username, password }`, add an overload that takes `{ userId }` directly:

```ts
export async function createSession(input: { userId: string } | { username: string; password: string }) {
  // existing logic for the password branch stays
  let userId: string
  if ('userId' in input) {
    userId = input.userId
  } else {
    // ... existing password verification path
  }
  // ... existing session row creation, returns { session, user? }
}
```

The OIDC callback uses the `{ userId }` form. The password branch becomes dead in Phase A6 but lives until then to keep this commit isolated.

- [ ] **Step 6: Update `/logout` to end Authentik session**

Replace `src/pages/routes/logout.ts` with:

```ts
import { eq } from 'drizzle-orm'
import { getContext } from 'hono/context-storage'
import { deleteCookie } from 'hono/cookie'
import { sessionTable, statusEnum } from '#@/databases/schema.ts'
import { buildEndSessionUrl } from '#@/utils/server/oidc.ts'
import type { Route } from './+types/logout.ts'

export async function action() {
  const c = getContext()
  const { db, token } = c.var

  if (token) {
    await db.library.update(sessionTable).set({ status: statusEnum.deleted }).where(eq(sessionTable.token, token))
  }
  deleteCookie(c, 'token')

  const origin = new URL(c.req.raw.url).origin
  const endSessionUrl = await buildEndSessionUrl({ postLogoutRedirectUri: `${origin}/` })
  throw c.redirect(endSessionUrl?.toString() ?? '/')
}

export async function loader() {
  return action()
}
```

- [ ] **Step 7: Manual smoke test (requires real Authentik instance)**

Pre-req: an Authentik instance with an OAuth2/OpenID Provider + Application configured for `http://localhost:8001/auth/callback`. Populate `.env` with the resulting client id/secret and issuer URL (see Task C1 for the docs that will land later — for now, just paste them in a local `.env`).

```bash
source ~/.nvm/nvm.sh && nvm use 25 && node --run=dev
```

Visit `http://localhost:8001/login`, click "Log in with SSO", complete the Authentik flow, expect to land on `/library` with a valid session cookie. Visit `/library` directly afterwards — should NOT redirect to `/login`.

- [ ] **Step 8: Commit**

```bash
git add src/pages/routes/login.tsx src/pages/routes/auth.start.ts src/pages/routes/auth.callback.ts src/pages/routes/logout.ts src/pages/login/page.tsx src/controllers/users/upsert-oidc-user.ts src/controllers/sessions/create-session.ts
git commit -m "feat(auth): replace local login with Authentik OIDC flow"
```

---

### Task A5: Drop Supabase from middleware and current-user lookup

**Files:**

- Modify: `src/middlewares/vendors.ts`
- Modify: `src/middlewares/globals.ts:63-85`
- Modify: `src/controllers/users/get-current-user.ts:7-16`

- [ ] **Step 1: Remove supabase from `vendors.ts`**

Replace `src/middlewares/vendors.ts` with:

```ts
import { createMiddleware } from 'hono/factory'
import { createDrizzle } from '#@/utils/server/drizzle.ts'
import { createStorage } from '#@/utils/server/storage.ts'

declare module 'hono' {
  interface ContextVariableMap {
    db: ReturnType<typeof createDrizzle>
    storage: ReturnType<typeof createStorage>
  }
}

export function vendors() {
  return createMiddleware(async function middleware(c, next) {
    c.set('db', createDrizzle())
    c.set('storage', createStorage())
    await next()
  })
}
```

- [ ] **Step 2: Strip supabase admin impersonation from `globals.ts`**

Replace the `getTempUserOrCurrentUser` function in `src/middlewares/globals.ts` with:

```ts
async function getTempUserOrCurrentUser(c: Context) {
  const runtimeEnv = getRunTimeEnv()

  let currentUser = await getCurrentUser()

  const isSuperviser =
    currentUser?.id && runtimeEnv.RETROASSEMBLY_RUN_TIME_SUPERVISER_USER_IDS.split(',').includes(currentUser?.id)

  if (isSuperviser) {
    const tempUserId = getCookie(c, 'temp-user-id') || c.req.query('temp-user-id')
    if (tempUserId) {
      const { db } = c.var
      const [row] = await db.library.select().from(userTable).where(eq(userTable.id, tempUserId)).limit(1)
      if (row) {
        currentUser = { id: row.id, username: row.username, groups: row.groups }
      }
    }
  }
  return currentUser
}
```

Add the missing imports to the top of `globals.ts`:

```ts
import { eq } from 'drizzle-orm'
import { userTable } from '#@/databases/schema.ts'
```

- [ ] **Step 3: Strip supabase branch from `get-current-user.ts`**

Replace `src/controllers/users/get-current-user.ts` (lines 1-22) with:

```ts
import { and, eq, gt } from 'drizzle-orm'
import { getContext } from 'hono/context-storage'
import { DateTime } from 'luxon'
import { sessionTable, statusEnum, userTable } from '#@/databases/schema.ts'

export async function getCurrentUser() {
  const c = getContext()
  const { db, token } = c.var

  if (!token) {
    return
  }
```

Then update the return value at the bottom to include `groups`:

```ts
return {
  id: result.users.id,
  username: result.users.username,
  groups: result.users.groups,
}
```

- [ ] **Step 4: Run dev server and verify**

```bash
source ~/.nvm/nvm.sh && nvm use 25 && node --run=dev
```

Visit a non-login route (`/`) — should still render. Hit `/login` — should redirect-loop into Authentik (because no session). Log in via Authentik (from Task A4). Confirm `currentUser.groups` is populated by adding a temporary `console.log(currentUser)` in `globals.ts` and watching the dev server output. Remove the log before committing.

- [ ] **Step 5: Commit**

```bash
git add src/middlewares/vendors.ts src/middlewares/globals.ts src/controllers/users/get-current-user.ts
git commit -m "refactor(auth): drop Supabase wiring from middleware and current-user lookup"
```

---

### Task A6: Delete dead local-auth code and Supabase deps

**Files:**

- Delete: `src/utils/server/supabase.ts`
- Delete: `src/pages/routes/login-google.ts`
- Delete: `src/pages/login/components/log-in-form.tsx`
- Delete: `src/pages/login/components/log-in-with-google-button.tsx`
- Delete: `src/pages/login/components/register-form.tsx`
- Delete: `src/controllers/users/create-user.ts`
- Delete: `src/controllers/users/update-password.ts`
- Delete: `src/controllers/users/count-users.ts`
- Modify: `src/api/routes/auth.ts` (remove register, login-by-password, password endpoints)
- Modify: `src/controllers/sessions/create-session.ts` (remove username/password branch)
- Modify: `package.json` (remove `@supabase/ssr`, `@supabase/supabase-js`)

- [ ] **Step 1: Confirm no remaining imports of the files about to be deleted**

```bash
grep -rln "create-user\|update-password\|count-users\|log-in-form\|log-in-with-google-button\|register-form\|login-google\|server/supabase" src/ --include="*.ts" --include="*.tsx"
```

Expected: empty. If any matches remain, update those callers first.

- [ ] **Step 2: Delete files**

```bash
rm src/utils/server/supabase.ts \
   src/pages/routes/login-google.ts \
   src/pages/login/components/log-in-form.tsx \
   src/pages/login/components/log-in-with-google-button.tsx \
   src/pages/login/components/register-form.tsx \
   src/controllers/users/create-user.ts \
   src/controllers/users/update-password.ts \
   src/controllers/users/count-users.ts
```

- [ ] **Step 3: Simplify `src/api/routes/auth.ts`**

Replace the contents with a stub that exists only because the router imports it:

```ts
import { Hono } from 'hono'

// Auth endpoints moved to /auth/start and /auth/callback (page routes).
// This file remains as a placeholder for any future API-level auth endpoints.
export const app = new Hono()
```

- [ ] **Step 4: Simplify `createSession`**

Edit `src/controllers/sessions/create-session.ts` so the function only handles the `{ userId }` form. Remove the password branch and the parameter overload from Task A4 Step 5. Final signature:

```ts
export async function createSession({ userId }: { userId: string }) {
  // ... existing session row insertion code, returns { session, user? }
}
```

If the function currently also returns `user`, simplify to return just `{ session }` and update the callsite in `auth.callback.ts` to not destructure `user`.

- [ ] **Step 5: Remove Supabase devDependencies**

```bash
source ~/.nvm/nvm.sh && nvm use 25 && pnpm remove @supabase/ssr @supabase/supabase-js
```

- [ ] **Step 6: Type-check**

```bash
pnpm exec tsc --noEmit
```

Expected: no errors. Any error here is a missed reference to deleted code — fix and re-run.

- [ ] **Step 7: Unit tests still pass**

```bash
pnpm test:unit
```

Expected: PASS.

- [ ] **Step 8: Dev server still boots**

```bash
source ~/.nvm/nvm.sh && nvm use 25 && node --run=dev
```

Expected: starts cleanly, `/login` renders the single-button page, `/library` redirects to `/login` when unauthenticated.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore(auth): remove dead local-password and Supabase code paths"
```

---

## Phase B — Shared ROM library

Phase A leaves the ROM library per-user. Phase B switches it to shared and gates uploads.

### Task B1: Rename `roms.userId` → `roms.uploadedBy`

**Files:**

- Modify: `src/databases/schema.ts:55-90`
- Generate: new file under `src/databases/migrations/`

- [ ] **Step 1: Update `romTable` schema**

Replace the `romTable` block (lines 55-90) in `src/databases/schema.ts` with:

```ts
const romFileSchema = {
  ...baseSchema,
  fileId: text().notNull(),
  uploadedBy: text().notNull(),
}

export const romTable = sqliteTable(
  'roms',
  {
    fileName: text().notNull(),
    gameBoxartFileIds: text(),
    gameDescription: text(),
    gameDeveloper: text(),
    gameGenres: text(),
    gameName: text(),
    gamePlayers: integer(),
    gamePublisher: text(),
    gameRating: integer(),
    gameReleaseDate: integer({ mode: 'timestamp_ms' }),
    /** @deprecated use gameReleaseDate instead */
    gameReleaseYear: integer(),
    gameThumbnailFileIds: text(),
    launchboxGameId: integer(),
    libretroGameId: text(),
    platform: text().notNull().$type<PlatformName>(),
    rawGameMetadata: text({ mode: 'json' }).$type<{
      launchbox?: any
      libretro?: any
    }>(),
    ...romFileSchema,
  },
  (table) => [
    index('idx_roms_status_platform').on(table.status, table.platform),
    index('idx_roms_status_created').on(table.status, table.createdAt),
    index('idx_roms_status_released').on(table.status, table.gameReleaseDate),
    index('idx_roms_status_name').on(table.status, table.fileName),
    index('idx_roms_platform_filename').on(table.platform, table.fileName),
    index('idx_roms_file_status').on(table.fileId, table.status),
    index('idx_roms_uploadedby_status').on(table.uploadedBy, table.status),
  ],
)
```

- [ ] **Step 2: Generate migration**

```bash
source ~/.nvm/nvm.sh && nvm use 25 && pnpm exec drizzle-kit generate --name=rom_uploaded_by_rename
```

Open the generated file. Drizzle generates an `ALTER TABLE ... RENAME COLUMN` for `user_id` → `uploaded_by` and a sequence of `DROP INDEX` / `CREATE INDEX` statements. Verify the rename is present and not a `DROP + ADD` (data-preserving). If Drizzle proposes a destructive sequence, manually edit the SQL to use `RENAME COLUMN`:

```sql
ALTER TABLE `roms` RENAME COLUMN `user_id` TO `uploaded_by`;
```

- [ ] **Step 3: Apply migration**

```bash
pnpm exec drizzle-kit migrate
```

- [ ] **Step 4: Verify schema**

```bash
sqlite3 data/retroassembly.sqlite ".schema roms"
```

Expected: column is now `uploaded_by`; indexes match the new set.

- [ ] **Step 5: Commit**

```bash
git add src/databases/schema.ts src/databases/migrations/
git commit -m "feat(schema): rename roms.userId to roms.uploadedBy"
```

---

### Task B2: Drop `userId` filter from ROM queries

**Files:**

- Modify: `src/controllers/roms/get-roms.ts`
- Modify: `src/controllers/roms/get-rom.ts`
- Modify: `src/controllers/roms/get-roms-with-states.ts`
- Modify: `src/controllers/roms/get-rom-platform-count.ts`
- Modify: `src/controllers/roms/get-rom-content.ts`
- Modify: `src/controllers/roms/count-roms.ts`
- Modify: `src/controllers/roms/search-roms.ts`
- Modify: `src/controllers/roms/update-rom.ts`
- Modify: `src/controllers/roms/delete-roms.ts`
- Modify: `src/controllers/roms/delete-rom.ts`
- Modify: `src/controllers/roms/create-roms.ts` (sets `uploadedBy = currentUser.id` on insert)

- [ ] **Step 1: Find every `userId` filter in ROM controllers**

```bash
grep -n "romTable.userId\|romTable\.userId" src/controllers/roms/*.ts
```

Note every line. For each file, remove the `eq(romTable.userId, currentUser.id)` condition from the `conditions` array (or wherever it lives). Favorite-join clauses with `favoriteTable.userId` STAY — favorites remain per-user.

- [ ] **Step 2: Update `get-roms.ts`**

In `src/controllers/roms/get-roms.ts:34`, change:

```ts
const conditions = [eq(romTable.userId, currentUser.id), eq(romTable.status, 1)]
```

to:

```ts
const conditions = [eq(romTable.status, 1)]
```

The `favoriteJoinCondition` block (lines 56-60) stays unchanged — favorites are still scoped to the current user.

- [ ] **Step 3: Apply the same pattern to the other rom controllers**

For each file listed above, remove the `eq(romTable.userId, ...)` condition. The pattern is consistent — only the `where`/`and()` block changes. Other code (joins, ordering, pagination) is untouched.

In `create-roms.ts`, the insert that previously set `userId: currentUser.id` now sets `uploadedBy: currentUser.id`.

In `delete-rom.ts`, ownership check: after fetching the rom, assert `rom.uploadedBy === currentUser.id` before deleting. If not, return 403.

```ts
if (rom.uploadedBy !== currentUser.id) {
  throw new Response('Forbidden: you can only delete ROMs you uploaded', { status: 403 })
}
```

- [ ] **Step 4: Type-check**

```bash
pnpm exec tsc --noEmit
```

Expected: clean. Any error is a stale `userId` reference on `romTable`.

- [ ] **Step 5: Manual smoke test**

```bash
source ~/.nvm/nvm.sh && nvm use 25 && node --run=dev
```

Log in as user A via Authentik. Upload a ROM. Log out. Log in as user B via Authentik. `/library` should show user A's ROM. Try to delete it as user B — expect 403. Try to delete it as user A — succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/controllers/roms/
git commit -m "feat(roms): make library shared across all users; enforce uploader-only deletes"
```

---

### Task B3: Add `requireUploader` middleware and apply to upload routes

**Files:**

- Create: `src/middlewares/require-uploader.ts`
- Modify: `src/api/routes/roms.ts` (or whatever file mounts the upload endpoint — verify with `grep`)
- Modify: `src/pages/library/components/` (hide upload UI when not in group)

- [ ] **Step 1: Locate the upload endpoint**

```bash
grep -rln "create-roms\|createRoms\|romsUpload\|file_upload" src/api src/pages
```

Expected: one or two files mount `POST /api/roms` (or similar). Record the exact route mount point for Step 3.

- [ ] **Step 2: Create the middleware**

Create `src/middlewares/require-uploader.ts`:

```ts
import { createMiddleware } from 'hono/factory'
import { getAuthentikConfig } from '#@/utils/server/oidc.ts'

export function requireUploader() {
  return createMiddleware(async function middleware(c, next) {
    const { currentUser } = c.var
    if (!currentUser) {
      return c.json({ error: 'Not authenticated' }, 401)
    }
    const { uploaderGroup } = getAuthentikConfig()
    if (!currentUser.groups?.includes(uploaderGroup)) {
      return c.json({ error: 'Forbidden: uploader group membership required' }, 403)
    }
    await next()
  })
}
```

- [ ] **Step 3: Apply middleware to upload and delete endpoints**

In the api route file located in Step 1, wrap the upload + delete handlers with `requireUploader()`. Example:

```ts
import { requireUploader } from '#@/middlewares/require-uploader.ts'

app.post('/upload', requireUploader(), async (c) => {
  /* existing handler */
})
app.delete('/:id', requireUploader(), async (c) => {
  /* existing handler */
})
```

- [ ] **Step 4: Hide upload UI for non-uploaders**

Locate the upload button/component:

```bash
grep -rln "Upload\|file_upload\|dropzone\|Dropzone" src/pages/library
```

First, surface the uploader group name and the user's groups through the loader. In the route's `loader` (whichever route renders the upload UI), add:

```ts
import { getAuthentikConfig } from '#@/utils/server/oidc.ts'
// inside the existing loader, alongside other returned fields:
const { currentUser } = getContext().var
return {
  // ... existing fields
  uploaderGroup: getAuthentikConfig().uploaderGroup,
  currentUserGroups: currentUser?.groups ?? [],
}
```

Then in the component that renders the upload affordance, guard on group membership:

```tsx
import { useLoaderData } from 'react-router'

export function UploadButton() {
  const { uploaderGroup, currentUserGroups } = useLoaderData<typeof loader>()
  if (!currentUserGroups.includes(uploaderGroup)) return null
  return /* existing upload button JSX */
}
```

- [ ] **Step 5: Manual smoke test**

Restart dev server. Log in as a user **not** in the uploader group — upload UI should be hidden. Direct `curl POST /api/roms/upload` from that session — expect 403.

Log in as a user **in** the uploader group — upload UI visible; upload succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/middlewares/require-uploader.ts src/api/ src/pages/library/
git commit -m "feat(roms): gate uploads on Authentik uploader group membership"
```

---

## Phase C — Docs and deploy hygiene

### Task C1: Write SSO setup guide, env example, and README update

**Files:**

- Create: `docs/sso-setup.md`
- Create: `.env.example`
- Modify: `readme.md`

- [ ] **Step 1: Write `docs/sso-setup.md`**

```markdown
# SSO Setup (Authentik)

This fork of RetroAssembly requires an Authentik instance for authentication.
There is no local-password fallback.

## What you need

- An Authentik instance you can administer
- Admin access to create an OAuth2/OpenID Provider, an Application, and a Group

## Authentik configuration

1. **Create an OAuth2/OpenID Provider** in Authentik:
   - Authorization flow: your default (e.g. `default-provider-authorization-implicit-consent`)
   - Client type: `Confidential`
   - Redirect URIs: `https://<your-retroassembly-host>/auth/callback`
   - Signing Key: your default signing key
   - Scopes: include `openid`, `email`, `profile`, and a scope that emits the `groups` claim
     (Authentik ships a `groups` property mapping; ensure it is added to the provider)
2. **Create an Application** bound to that provider. Note the slug (default: `retroassembly`).
3. **Create a group** for users allowed to upload ROMs (e.g. `retroassembly-uploaders`).
   Add the appropriate Authentik users to this group. Members can upload and delete
   their own uploads. Everyone else can log in and play.

## RetroAssembly configuration

Copy `.env.example` to `.env` and fill in:

| Variable                                              | Value                                                        |
| ----------------------------------------------------- | ------------------------------------------------------------ |
| `RETROASSEMBLY_RUN_TIME_AUTHENTIK_ISSUER`             | `https://<authentik-host>/application/o/<application-slug>/` |
| `RETROASSEMBLY_RUN_TIME_AUTHENTIK_CLIENT_ID`          | Client ID from the Authentik provider                        |
| `RETROASSEMBLY_RUN_TIME_AUTHENTIK_CLIENT_SECRET`      | Client Secret from the Authentik provider                    |
| `RETROASSEMBLY_RUN_TIME_AUTHENTIK_REDIRECT_URI`       | `https://<your-retroassembly-host>/auth/callback`            |
| `RETROASSEMBLY_RUN_TIME_AUTHENTIK_UPLOADER_GROUP`     | The Authentik group name (e.g. `retroassembly-uploaders`)    |
| `RETROASSEMBLY_RUN_TIME_AUTHENTIK_LOGIN_BUTTON_LABEL` | (Optional) Custom button label, e.g. `Log in with Nextuon`   |
| `RETROASSEMBLY_RUN_TIME_SESSION_SECRET`               | 32+ random chars; used to sign session cookies               |

The app refuses to start if any of the required variables is empty.

## Group membership refresh

Group membership is read from the ID token at login and stored on the user record.
If you add or remove someone from the uploader group in Authentik, they will see the
change at their next login (or after their session expires, whichever comes first).

## Logout

Logging out of RetroAssembly also logs the user out of Authentik via the
end-session endpoint. To log back in, they go through Authentik again.
```

- [ ] **Step 2: Write `.env.example`**

```bash
# Authentik SSO (required)
RETROASSEMBLY_RUN_TIME_AUTHENTIK_ISSUER=https://auth.example.com/application/o/retroassembly/
RETROASSEMBLY_RUN_TIME_AUTHENTIK_CLIENT_ID=
RETROASSEMBLY_RUN_TIME_AUTHENTIK_CLIENT_SECRET=
RETROASSEMBLY_RUN_TIME_AUTHENTIK_REDIRECT_URI=https://retroassembly.example.com/auth/callback
RETROASSEMBLY_RUN_TIME_AUTHENTIK_UPLOADER_GROUP=retroassembly-uploaders

# Optional: custom button label on the login page
RETROASSEMBLY_RUN_TIME_AUTHENTIK_LOGIN_BUTTON_LABEL=Log in with SSO

# Session signing (required, 32+ random chars)
RETROASSEMBLY_RUN_TIME_SESSION_SECRET=replace-me-with-32-plus-random-chars
```

- [ ] **Step 3: Update `readme.md` fork preamble**

At the top of `readme.md`, immediately under the title block, add:

```markdown
> ## About this fork
>
> This fork replaces upstream's local-password + optional Google OAuth with **required Authentik SSO**, and converts the ROM library from per-user to **shared across all logged-in users**. Uploads are gated by membership in a configurable Authentik group; everyone else can browse and play.
>
> See [docs/sso-setup.md](docs/sso-setup.md) for deployment. The original upstream project is at [arianrhodsandlot/retroassembly](https://github.com/arianrhodsandlot/retroassembly) — use it if you want the local-password / hosted SaaS flavor.
```

Replace the "Getting Started" section's Option 1 / Option 2 split with a single section that points at `docs/sso-setup.md`.

- [ ] **Step 4: Commit**

```bash
git add docs/sso-setup.md .env.example readme.md
git commit -m "docs: add SSO setup guide and fork-specific README preamble"
```

---

## Phase D — Test mode for OIDC

The existing Playwright e2e suite assumes local-password auth and will fail after Phase A. This phase adds a stub IdP mode so e2e tests can run without a real Authentik instance.

### Task D1: Stub OIDC client when `NODE_ENV=test`

**Files:**

- Modify: `src/utils/server/oidc.ts`
- Modify (or skip) existing e2e tests under `tests/e2e/` that rely on registration/login

- [ ] **Step 1: Add a test-mode shim to `oidc.ts`**

At the top of `src/utils/server/oidc.ts`, add:

```ts
const TEST_STUB_ENABLED = process.env.RETROASSEMBLY_RUN_TIME_OIDC_TEST_STUB === '1'
```

In `buildAuthorizationUrl`, when `TEST_STUB_ENABLED`, return a URL that loops directly back to the local callback with a fixed test code. In `exchangeCode`, when `TEST_STUB_ENABLED`, accept the fixed code and return canned claims:

```ts
if (TEST_STUB_ENABLED && opts.currentUrl.searchParams.get('code') === 'test-code') {
  return {
    oidcSub: 'test-user-sub',
    email: 'tester@example.com',
    displayName: 'Tester',
    username: 'tester',
    groups: ['retroassembly-uploaders'],
  }
}
```

Document in code: the stub is only enabled when the env var is explicitly set to `1`. It is never on in production builds.

- [ ] **Step 2: Identify e2e tests that break**

```bash
grep -rln "register\|password\|/api/auth" tests/e2e/
```

For each test that exercises a flow no longer available:

- If the test's intent still applies (e.g. "log in and see library"), update it to use the stub-IdP flow: visit `/auth/start?redirect_to=/library`, then `/auth/callback?code=test-code&state=...` with the cookies the stub expects.
- If the test's intent no longer applies (e.g. "register a new account with username/password"), delete the test.

A second-pass rewrite of e2e to fully exercise SSO is out of scope; the goal is "tests run green, even if narrower than before."

- [ ] **Step 3: Run the e2e suite**

```bash
source ~/.nvm/nvm.sh && nvm use 25 && RETROASSEMBLY_RUN_TIME_OIDC_TEST_STUB=1 node --run=test
```

Expected: pass. Document any tests that needed to be deleted in the commit message.

- [ ] **Step 4: Commit**

```bash
git add src/utils/server/oidc.ts tests/e2e/
git commit -m "test: stub OIDC client for e2e tests; update tests for SSO flow"
```

---

## Final verification

- [ ] **Step 1: Clean install + setup**

```bash
source ~/.nvm/nvm.sh && nvm use 25 && rm -rf node_modules && pnpm install && pnpm rebuild better-sqlite3 && rm -f data/retroassembly.sqlite && node --run=setup
```

- [ ] **Step 2: Unit tests pass**

```bash
pnpm test:unit
```

- [ ] **Step 3: E2E tests pass (with stub)**

```bash
RETROASSEMBLY_RUN_TIME_OIDC_TEST_STUB=1 node --run=test
```

- [ ] **Step 4: Manual end-to-end against real Authentik**

Pre-req: configure a real Authentik instance per `docs/sso-setup.md`. Set the env vars. `node --run=dev`.

Verification checklist:

1. Visit `/` — renders. Visit `/library` — redirects to `/login`.
2. Click "Log in with SSO" — redirects to Authentik. Complete login.
3. Land on `/library` with a session cookie. No console errors.
4. As an uploader, upload a ROM. As a non-uploader (different Authentik user), the upload UI is hidden, and direct `curl` to the upload endpoint returns 403.
5. As any user, you see all uploaded ROMs.
6. Try to delete another user's ROM as a non-owner — 403. As the owner — succeeds.
7. Log out — redirected through Authentik's end-session endpoint, then back to `/`.

- [ ] **Step 5: Push to fork**

```bash
git push origin main
```

(Only after explicit confirmation from the user — per project policy.)

---

## Self-review notes

**Spec coverage:** every spec section has a task:

- Goal #1 (Authentik OIDC) — Tasks A1, A2, A4, A5
- Goal #2 (Shared ROM library) — Tasks B1, B2
- Non-goal (no local fallback) — Task A6 removes the local code paths
- User schema changes — Task A3
- ROM schema rename — Task B1
- Query layer changes — Task B2
- File storage (no change) — N/A by design
- Uploader gating — Task B3
- Env vars + startup validation — Task A1
- Docs (`.env.example`, `docs/sso-setup.md`, README) — Task C1
- Removed code list — Task A6
- Testing — Task D1
- Error handling — covered inline in A4 (callback) and B3 (forbidden cases)

**Open spec questions resolved during planning:**

- Route paths: `/auth/start` and `/auth/callback`; `/login` keeps the button page.
- Migration rollback: no nullable retention; existing rows wiped on Phase A3 (documented in migration SQL header).
- "Uploaded by" attribution in UI: kept out of v1 (field exists in API, no UI surface yet).
