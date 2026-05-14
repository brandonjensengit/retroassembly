import { eq } from 'drizzle-orm'
import { getContext } from 'hono/context-storage'
import { statusEnum, userTable } from '#@/databases/schema.ts'
import type { ExtractedClaims } from '#@/utils/server/oidc.ts'

export async function upsertOidcUser(claims: ExtractedClaims) {
  const { db } = getContext().var
  const [existing] = await db.library.select().from(userTable).where(eq(userTable.oidcSub, claims.oidcSub)).limit(1)

  if (existing) {
    await db.library
      .update(userTable)
      .set({
        displayName: claims.displayName,
        email: claims.email,
        groups: claims.groups,
        lastLoginAt: new Date(),
        status: statusEnum.normal,
        username: claims.username,
      })
      .where(eq(userTable.id, existing.id))
    return { id: existing.id }
  }

  const [inserted] = await db.library
    .insert(userTable)
    .values({
      displayName: claims.displayName,
      email: claims.email,
      groups: claims.groups,
      lastLoginAt: new Date(),
      oidcSub: claims.oidcSub,
      username: claims.username,
    })
    .returning({ id: userTable.id })
  return { id: inserted.id }
}
