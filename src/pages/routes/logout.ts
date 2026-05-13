import { eq } from 'drizzle-orm'
import { getContext } from 'hono/context-storage'
import { deleteCookie } from 'hono/cookie'
import { sessionTable, statusEnum } from '#@/databases/schema.ts'
import { buildEndSessionUrl } from '#@/utils/server/oidc.ts'
import type { Route } from './+types/logout.ts'

async function handleLogout() {
  const c = getContext()
  const { db, token } = c.var

  if (token) {
    await db.library.update(sessionTable).set({ status: statusEnum.deleted }).where(eq(sessionTable.token, token))
  }
  deleteCookie(c, 'token')

  const { origin } = new URL(c.req.raw.url)
  const endSessionUrl = await buildEndSessionUrl({ postLogoutRedirectUri: `${origin}/` })
  throw c.redirect(endSessionUrl?.toString() ?? '/')
}

export function action(_args: Route.ActionArgs) {
  return handleLogout()
}

export function loader(_args: Route.LoaderArgs) {
  return handleLogout()
}

export { noop as default } from 'es-toolkit'
