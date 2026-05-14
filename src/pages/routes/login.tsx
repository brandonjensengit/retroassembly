import { getContext } from 'hono/context-storage'
import { defaultRedirectTo } from '#@/constants/auth.ts'
import { getAuthentikConfig } from '#@/utils/server/oidc.ts'
import { sanitizeRedirectTo } from '#@/utils/server/safe-redirect.ts'
import { LoginPage } from '../login/page.tsx'
import type { Route } from './+types/login.ts'

export function loader({ request }: Route.LoaderArgs) {
  const c = getContext()
  const { currentUser, t } = c.var
  const { searchParams } = new URL(request.url)
  const redirectTo = sanitizeRedirectTo(searchParams.get('redirect_to'), defaultRedirectTo)

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
