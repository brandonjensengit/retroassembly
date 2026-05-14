import { eq } from 'drizzle-orm'
import { getContext } from 'hono/context-storage'
import { HTTPException } from 'hono/http-exception'
import { romTable } from '#@/databases/schema.ts'
import { deleteRoms } from './delete-roms.ts'

export async function deleteRom(id: string) {
  const { currentUser, db } = getContext().var
  const [rom] = await db.library.select().from(romTable).where(eq(romTable.id, id)).limit(1)
  if (!rom) {
    throw new HTTPException(404, { message: 'ROM not found' })
  }
  if (rom.uploadedBy !== currentUser.id) {
    throw new HTTPException(403, { message: 'Only the uploader can delete this ROM' })
  }
  await deleteRoms([id])
}
