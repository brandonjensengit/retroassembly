import { useTranslation } from 'react-i18next'
import { useLoaderData } from 'react-router'
import { metadata } from '#@/constants/metadata.ts'
import type { loader } from '../routes/login.tsx'
import { PageContainer } from './components/page-container.tsx'

export function LoginPage() {
  const { t } = useTranslation()
  const { buttonLabel, redirectTo } = useLoaderData<typeof loader>()
  const startUrl = `/auth/start?redirect_to=${encodeURIComponent(redirectTo)}`

  return (
    <PageContainer
      description={t('auth.loginToBuildCollection')}
      title={t('auth.loginToTitle', { title: metadata.title })}
    >
      <a
        className='bg-accent-9 hover:bg-accent-10 inline-block rounded-md px-6 py-3 font-medium text-white'
        href={startUrl}
      >
        {buttonLabel}
      </a>
    </PageContainer>
  )
}
