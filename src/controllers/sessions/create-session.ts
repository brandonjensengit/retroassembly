import { getContext } from 'hono/context-storage'
import { DateTime } from 'luxon'
import { sessionTable } from '#@/databases/schema.ts'
import { getConnInfo } from '#@/utils/server/misc.ts'
import { nanoid } from '#@/utils/server/nanoid.ts'

export async function createSession({ userId }: { userId: string }) {
  const c = getContext()
  const { db } = c.var

  const [session] = await db.library
    .insert(sessionTable)
    .values({
      expiresAt: DateTime.now().plus({ days: 30 }).toJSDate(),
      ip: getConnInfo()?.remote.address,
      token: nanoid(),
      userAgent: c.req.header('User-Agent'),
      userId,
    })
    .returning()

  return { session }
}
