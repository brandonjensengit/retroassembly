import type { PropsWithChildren } from 'react'
import { useTranslation } from 'react-i18next'
import { metadata } from '#@/constants/metadata.ts'

interface PageContainerProps extends PropsWithChildren {
  description?: string
  title: string
}

export function PageContainer({ children, description, title }: Readonly<PageContainerProps>) {
  const { t } = useTranslation()

  return (
    <>
      <title>{t('auth.loginToTitle', { title: metadata.title })}</title>
      <div className='min-h-dvh bg-(--accent-9) px-4 py-20'>
        <div className='mx-auto w-full max-w-full rounded bg-(--color-background) p-10 md:w-3xl'>
          <h1 className='text-center text-3xl font-semibold'>{title}</h1>

          {description ? <div className='mt-4 text-center text-(--color-text)/40'>{description}</div> : null}

          <div className='mt-4 border-t border-t-(--gray-6) py-8'>{children}</div>

          <div className='text-center text-xs text-(--color-text)/40'>
            {t('auth.agreeToTermsPrefix')}{' '}
            <a className='underline' href='/privacy-policy.md' rel='noopener noreferrer' target='_blank'>
              {t('common.privacyPolicy')}
            </a>
            .
          </div>
        </div>
      </div>
    </>
  )
}
