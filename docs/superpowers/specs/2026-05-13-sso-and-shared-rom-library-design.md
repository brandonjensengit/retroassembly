# SSO via Authentik + Shared ROM Library

**Status:** Approved — ready for implementation plan
**Date:** 2026-05-13
**Fork:** `brandonjensengit/retroassembly` (upstream: `arianrhodsandlot/retroassembly`)

## Goal

Pivot this fork so that:

1. Authentication is handled exclusively by an external Authentik SSO instance (fully configurable for any Authentik deployment).
2. The ROM library is **shared** across all authenticated users instead of being scoped per-user. Uploads of new ROMs are restricted to members of a configurable Authentik group; everyone else can browse and play everything.

The fork is intended to live on GitHub so the operator of the target Authentik server can self-host it and wire it into their own IdP.

## Non-goals

- Supporting both local password auth **and** SSO. SSO is required; local password auth is removed.
- Supporting SSO providers other than Authentik in this initial cut. The OIDC client is generic enough that other OIDC providers will likely work, but only Authentik is documented and tested.
- Migrating existing per-user ROM data from a production deployment. The target deployment starts with an empty database. A best-effort one-shot migration is included for anyone forking from existing data, but it collapses every user's ROMs into the shared library and is documented as destructive.
- Changing save state, favorite, or launch history semantics. Those remain per-user and private.
- Replacing R2/local file storage. ROM blobs are already keyed by `fileId`, independent of user.

## Approach

Three approaches were considered:

|     | Approach                                                                                                | Verdict                                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | Keep Supabase Auth, configure Authentik as a Supabase OIDC provider                                     | Rejected. Supabase Auth does not support arbitrary OIDC providers without their paid SAML SSO tier. Adds infra the fork does not need.                                           |
| B   | **Direct OIDC: app talks to Authentik via `openid-client`**, store session in existing `sessions` table | **Selected.** Self-contained, no third-party auth infra, minimal moving parts.                                                                                                   |
| C   | Authentik Proxy Provider in front of the app (forward-auth headers)                                     | Viable but pushes auth out of the app into the reverse proxy. Good when that pattern is already in use; overkill otherwise and complicates the "drop it in and go" deploy story. |

## Architecture

### Login flow

1. `GET /login` renders a single page with one button: "Log in with Nextuon" (label configurable via env).
2. `POST /login` (or `GET /auth/start`) generates a PKCE code verifier and CSRF state, stores them in a short-lived signed cookie, and 302-redirects to Authentik's authorization endpoint.
3. `GET /auth/callback?code=...&state=...` validates state, exchanges the code for tokens via Authentik's token endpoint, validates the ID token (issuer, audience, signature, expiry, nonce), upserts the local user record keyed by `oidcSub`, snapshots `groups` from the ID token onto the user, creates a row in the existing `sessions` table, sets the session cookie, and redirects to the original `redirect_to` (or `/library` by default).
4. `POST /logout` invalidates the session row, clears the cookie, and redirects to Authentik's `end_session_endpoint` with a `post_logout_redirect_uri` back to `/`. So the user is logged out of Authentik too, not just RetroAssembly.

### Authorization

- The existing `auth()` middleware (`src/middlewares/auth.ts`) continues to gate `/library*`. Any authenticated user passes.
- A new `requireUploader()` middleware checks `currentUser.groups.includes(env.AUTHENTIK_UPLOADER_GROUP)`. Applied to:
  - The ROM upload endpoint.
  - The delete-ROM endpoint (plus a check that `rom.uploadedBy === currentUser.id`, so uploaders can only delete their own uploads).
- Group membership is **snapshotted at login** — read from the ID token's `groups` claim and persisted on the user row. No live refresh against Authentik on each request. Consequences:
  - Adding someone to or removing them from the uploader group takes effect at their next login.
  - The existing `sessions` table already has an `expiresAt` per row. Stale group membership cannot outlive the session. Default session lifetime stays at whatever upstream uses (verify and document during implementation; introduce a `SESSION_MAX_AGE` env var if it isn't already configurable).
  - This is acceptable for the target use case (small trusted team). Documented in the SSO setup guide.

### Error handling

- **Authentik unreachable at login:** show a generic "SSO is currently unavailable, try again shortly" page. Do not fall back to any local auth.
- **State / PKCE mismatch on callback:** reject the callback with a 400; log the mismatch reason server-side.
- **ID token validation failure:** reject with 401; log the specific failure (bad issuer, bad signature, expired, etc.).
- **User not in any group / not in uploader group:** still a fully valid login — they just don't see the upload UI and any direct hit to upload/delete endpoints returns 403.
- **Session expired mid-flow:** standard redirect to `/login`, preserving `redirect_to`.

### Configuration (env vars, all required at boot)

```
AUTHENTIK_ISSUER=https://auth.example.com/application/o/retroassembly/
AUTHENTIK_CLIENT_ID=...
AUTHENTIK_CLIENT_SECRET=...
AUTHENTIK_REDIRECT_URI=https://retro.example.com/auth/callback
AUTHENTIK_UPLOADER_GROUP=retroassembly-uploaders
AUTHENTIK_LOGIN_BUTTON_LABEL=Log in with Nextuon    # optional, default "Log in with SSO"
SESSION_SECRET=...                                  # for signing the session cookie + PKCE state cookie
```

The app refuses to start if any required env var is missing or empty. Misconfiguration is a deploy-time failure, not a runtime one.

## Data model changes

### `users` table (`src/databases/schema.ts`)

| Drop                    | Add                                                          |
| ----------------------- | ------------------------------------------------------------ |
| `passwordHash`          | `oidcSub` (text, unique, not null) — Authentik subject claim |
| `registrationIp`        | `email` (text)                                               |
| `registrationUserAgent` | `displayName` (text) — from `name` claim                     |
|                         | `groups` (text, JSON-encoded array of strings)               |
|                         | `lastLoginAt` (timestamp_ms)                                 |

`username` stays, populated from `preferred_username` claim. Lookup index moves from `username` to `oidcSub`.

### `roms` table

- Rename `userId` column to `uploadedBy` (data-preserving rename via Drizzle migration).
- Replace user-prefixed composite indexes with non-user-prefixed equivalents on `(status, platform)`, `(status, createdAt)`, `(status, gameReleaseDate)`, `(status, fileName)`, and `(platform, fileName)`.
- Keep `idx_roms_file_status` (file cleanup).
- Add `idx_roms_uploadedby_status` on `(uploadedBy, status)` to support a future "my uploads" view and for cascading cleanup if a user is ever deleted.

### Unchanged

`states`, `favorites`, `launch_records`, `user_preferences` keep their per-user scoping and `userId` columns. No schema changes.

### File storage

ROM blobs are stored by `fileId` (content hash / nanoid), not user-scoped. No storage layout changes. Existing R2 / local FS code paths are untouched.

## Query layer changes

- Every ROM query drops its `userId = ?` `where` clause. The shared library is visible to anyone authenticated.
- Upload route: wraps with `requireUploader`. Sets `uploadedBy = currentUser.id` on insert.
- Delete-ROM route: wraps with `requireUploader` and additionally checks `rom.uploadedBy === currentUser.id`. Anyone else hitting the route gets 403.
- ROM list responses include `uploadedBy` so the UI can optionally show attribution. Default UI does not surface this yet (out of scope for v1); the field is present for follow-up.

## Migration

One Drizzle migration covering:

1. `users` table column add/drop as above. Existing rows are deleted before the migration runs (they have no `oidcSub` and cannot be reconciled). The migration is annotated as destructive in the migration file's comment header.
2. `roms` table column rename `userId` → `uploadedBy`, plus index swap.
3. Optional second migration `2026-05-13-shared-library-collapse.sql` (commented out by default) for anyone who wants to preserve ROM data from a prior multi-user database — it just renames the column without dropping the user table. They run it manually after wiring up their own user reconciliation.

For the target nextuon deployment: empty DB at first deploy, migrations run cleanly.

## Removed code

- Local password registration route + UI.
- Password reset routes + UI (if present).
- Supabase wiring in `src/middlewares/vendors.ts`, `src/utils/server/supabase.ts`, `src/pages/routes/login-google.ts`.
- `@supabase/ssr` and `@supabase/supabase-js` removed from `devDependencies`.

## Documentation changes

- `README.md` of the fork: a short "About this fork" preamble explaining the SSO + shared library pivot, then points at `docs/sso-setup.md` for Getting Started. Links back to upstream for the original local-auth flavor.
- `docs/sso-setup.md` (new, target ~30 lines): admin guide. Steps to:
  1. In Authentik, create an OAuth2/OpenID Provider with the redirect URI `https://your-host/auth/callback`.
  2. Create an Application with slug `retroassembly` (or whatever you prefer — the issuer URL is configurable).
  3. Create an Authentik group for uploaders (any name, recorded in `AUTHENTIK_UPLOADER_GROUP`).
  4. Copy client id, client secret, issuer URL into `.env`.
  5. `docker compose up` (or whatever the deploy mechanism is).
- `.env.example` committed at repo root with every required var and inline comments.

## Testing

The repo uses Playwright e2e tests (`tests/e2e`). For this work:

- **Unit-level:** logic in token validation, PKCE/state generation, group-claim parsing has small focused tests under `tests/unit/` (new directory; current repo has only e2e).
- **E2E:** existing Playwright tests assume local auth and will break. Two options for fixing them, decided in the implementation plan:
  - **Option 1:** Stand up a containerized Authentik in CI and run real OIDC flows. Truest test but heavy.
  - **Option 2:** Stub the OIDC client in a `NODE_ENV=test` mode that accepts a fixed test token. Lighter, faster, doesn't exercise the real network round trip.
  - Recommended: Option 2 for CI, with a separate manual smoke test against a real Authentik instance before each release.
- **Manual verification before merging:** log in with a real Authentik user, upload a ROM as an uploader, log in as a non-uploader and confirm the upload UI is hidden / blocked, log out flows back through Authentik.

## Open questions for implementation

- Exact route paths: `/auth/start` vs `/login`? Keep `/login` as the button page, add `/auth/start` as the redirect kicker? Decide in the plan.
- Whether to keep the existing username/password DB columns in the migration as nullable for a release or two before dropping them (rollback safety). For a new deployment, no value — drop immediately.
- Whether the "uploaded by" attribution should appear in the default UI (out of scope for v1; field is just present in the API).

## Out of scope / future work

- Multi-tenant deployments (one Authentik instance, many RetroAssembly libraries) — not modeled.
- Per-platform or per-folder upload permissions — uploader group is flat.
- Admin role for moderating others' uploads — explicitly declined during brainstorm (uploader can only delete own uploads).
- Synchronizing user display name / email when they change in Authentik — currently snapshotted at login like groups; refreshing on each login is sufficient.
- Migrating save states / favorites between local accounts and SSO accounts in a forked-from-existing-data deployment.
