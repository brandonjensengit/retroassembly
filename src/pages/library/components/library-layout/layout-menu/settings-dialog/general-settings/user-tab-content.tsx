import { Button, Flex } from '@radix-ui/themes'
import { useTranslation } from 'react-i18next'
import { useGlobalLoaderData } from '#@/pages/hooks/use-global-loader-data.ts'

interface UserTabContentProps {
  canDelete: boolean
  onDelete?: () => void
  user: {
    id: string
  }
}

export function UserTabContent({ canDelete, onDelete, user }: Readonly<UserTabContentProps>) {
  const { t } = useTranslation()
  const { currentUser } = useGlobalLoaderData()

  const isCurrentUser = user.id === currentUser.id

  return (
    <Flex className={isCurrentUser ? '' : 'py-4'} direction='column' gap='4'>
      {canDelete ? (
        <div className='mt-2! lg:w-xl'>
          <Button
            className='w-full!'
            color='red'
            disabled={isCurrentUser}
            onClick={onDelete}
            type='button'
            variant='soft'
          >
            <span className='icon-[mdi--delete]' />
            {t('auth.deleteUser')}
          </Button>
        </div>
      ) : null}
    </Flex>
  )
}
