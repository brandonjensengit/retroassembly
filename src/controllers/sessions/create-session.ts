import { and, eq } from 'drizzle-orm'
import { getContext } from 'hono/context-storage'
import { HTTPException } from 'hono/http-exception'
import { DateTime } from 'luxon'
import { sessionTable, statusEnum, userTable } from '#@/databases/schema.ts'
import { verify } from '#@/utils/server/argon2.ts'
import { getConnInfo } from '#@/utils/server/misc.ts'
import { nanoid } from '#@/utils/server/nanoid.ts'

const invalidException = new HTTPException(401, { message: 'Invalid username or password' })

type CreateSessionInput = { userId: string } | { password: string; username: string }

export async function createSession(input: CreateSessionInput) {
  const c = getContext()
  const { db } = c.var

  let userId: string
  let user: typeof userTable.$inferSelect | undefined

  if ('userId' in input) {
    userId = input.userId
  } else {
    const { password, username } = input
    const [foundUser] = await db.library
      .select()
      .from(userTable)
      .where(and(eq(userTable.username, username.trim()), eq(userTable.status, statusEnum.normal)))
      .limit(1)

    if (!foundUser) {
      throw invalidException
    }

    // @ts-expect-error -- legacy password branch; userTable.passwordHash was dropped in A3 and this branch is removed in A6.
    const isValidPassword = await verify(foundUser.passwordHash, password)
    if (!isValidPassword) {
      throw invalidException
    }

    user = foundUser
    userId = foundUser.id
  }

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

  return { session, user }
}
