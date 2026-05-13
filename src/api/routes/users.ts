import { Hono } from 'hono'
import { deleteUser } from '#@/controllers/users/delete-user.ts'
import { getAllUsers } from '#@/controllers/users/get-all-users.ts'
import { getCurrentUser } from '#@/controllers/users/get-current-user.ts'

export const users = new Hono()

  .get('', async (c) => {
    const users = await getAllUsers()
    return c.json(users)
  })

  .get('current', async (c) => {
    const user = await getCurrentUser()
    return c.json(user)
  })

  .delete(':id', async (c) => {
    await deleteUser(c.req.param('id'))
    return c.json({ success: true })
  })
