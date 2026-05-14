import { Theme } from '@radix-ui/themes'
import type { PropsWithChildren } from 'react'

export function RadixTheme({ children }: Readonly<PropsWithChildren>) {
  return (
    <Theme accentColor='blue' grayColor='gray'>
      {children}
    </Theme>
  )
}
