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
      <img alt='Nextuon' className='mb-6 h-12 w-auto md:h-16' src='/assets/nextuon-logo.png' />
      <a
        className='inline-block rounded-md bg-gradient-to-r from-[#2a8aff] to-[#a346d4] px-6 py-3 font-medium text-white shadow-lg transition hover:opacity-90'
        href={startUrl}
      >
        {buttonLabel}
      </a>
    </PageContainer>
  )
}
