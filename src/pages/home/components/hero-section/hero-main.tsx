import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ButtonLinks } from '../../../components/button-links.tsx'
import { DockerDialog } from './docker-dialog.tsx'

export function HeroMain() {
  const { t } = useTranslation()
  const [dockerDialogOpen, setDockerDialogOpen] = useState(false)

  return (
    <div className='flex flex-col items-center justify-center'>
      <img alt='Nextuon' className='h-24 w-auto md:h-32 lg:h-40' src='/assets/nextuon-logo.png' />
      <h1 className='mt-6 text-center font-serif text-3xl font-semibold text-(--gray-12) lg:text-5xl'>retro</h1>
      <div className='relative mt-4 px-10 text-center'>
        <div className='overflow-hidden rounded p-2 font-serif text-xl text-(--gray-10)'>{t('home.tagline')}</div>
      </div>
      <ButtonLinks />
      <button
        className='mt-4 flex items-center gap-2 text-xs underline opacity-80'
        onClick={() => setDockerDialogOpen(true)}
        type='button'
      >
        <span className='icon-[mdi--docker] motion-preset-oscillate motion-duration-2000 img-saturate relative -top-0.5 text-2xl text-[#1d63ed]' />
        {t('home.selfHostingTitle')}
      </button>
      <DockerDialog onOpenChange={setDockerDialogOpen} open={dockerDialogOpen} />
    </div>
  )
}
