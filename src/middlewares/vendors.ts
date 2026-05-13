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
