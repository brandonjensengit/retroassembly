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
