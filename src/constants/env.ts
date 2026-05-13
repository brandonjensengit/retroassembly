import assert from 'node:assert'
import path from 'node:path'
import { attempt } from 'es-toolkit'
import { defaults } from 'es-toolkit/compat'
import { env, getRuntimeKey } from 'hono/adapter'
import { getContext } from 'hono/context-storage'
import { metadata } from './metadata.ts'

export function getRunTimeEnv() {
  const [, c] = attempt(getContext)
  const runTimeEnv = c ? env<Env>(c) : process.env
  const runtimeKey = getRuntimeKey()
  assert.ok(runtimeKey === 'node' || runtimeKey === 'workerd', 'Unsupported runtime')

  return defaults(
    { ...runTimeEnv },
    {
      RETROASSEMBLY_RUN_TIME_ALLOW_CRAWLER:
        {
          node: 'false',
          workerd: `${Boolean(c?.req.url && new URL(metadata.link).origin === new URL(c.req.url).origin)}`,
        }[runtimeKey] || 'false',
      RETROASSEMBLY_RUN_TIME_AUTHENTIK_CLIENT_ID: '',
      RETROASSEMBLY_RUN_TIME_AUTHENTIK_CLIENT_SECRET: '',
      RETROASSEMBLY_RUN_TIME_AUTHENTIK_ISSUER: '',
      RETROASSEMBLY_RUN_TIME_AUTHENTIK_LOGIN_BUTTON_LABEL: 'Log in with SSO',
      RETROASSEMBLY_RUN_TIME_AUTHENTIK_REDIRECT_URI: '',
      RETROASSEMBLY_RUN_TIME_AUTHENTIK_UPLOADER_GROUP: '',
      RETROASSEMBLY_RUN_TIME_DATA_DIRECTORY: path.resolve('data'),
      RETROASSEMBLY_RUN_TIME_MAX_AUTO_STATES_PER_ROM: '20',
      RETROASSEMBLY_RUN_TIME_MAX_ROM_COUNT: { node: '', workerd: '1000' }[runtimeKey] || '',
      RETROASSEMBLY_RUN_TIME_MAX_ROM_COUNT_2026: { node: '', workerd: '200' }[runtimeKey] || '',
      RETROASSEMBLY_RUN_TIME_MAX_UPLOAD_AT_ONCE: { node: '1000', workerd: '100' }[runtimeKey] || '100',
      RETROASSEMBLY_RUN_TIME_MSLEUTH_FALLBACK_HOST: 'https://msleuth.fly.dev/',
      RETROASSEMBLY_RUN_TIME_MSLEUTH_HOST: 'https://msleuth.arianrhodsandlot.workers.dev/',
      RETROASSEMBLY_RUN_TIME_SESSION_SECRET: '',
      RETROASSEMBLY_RUN_TIME_SKIP_HOME:
        { node: `${runTimeEnv.NODE_ENV !== 'development'}`, workerd: 'false' }[runtimeKey] || 'false',
      RETROASSEMBLY_RUN_TIME_SKIP_HOME_IF_LOGGED_IN: { node: 'true', workerd: 'false' }[runtimeKey] || 'false',
      RETROASSEMBLY_RUN_TIME_STORAGE_DIRECTORY: path.resolve('data', 'storage'),
      RETROASSEMBLY_RUN_TIME_STORAGE_HOST: '',
      RETROASSEMBLY_RUN_TIME_SUPABASE_ANON_KEY: '',
      RETROASSEMBLY_RUN_TIME_SUPABASE_URL: '',
      RETROASSEMBLY_RUN_TIME_SUPERVISER_USER_IDS: '',
    },
  )
}

export function getDirectories() {
  const runTimeEnv = getRunTimeEnv()
  const dataDirectory = runTimeEnv.RETROASSEMBLY_RUN_TIME_DATA_DIRECTORY
  const storageDirectory = runTimeEnv.RETROASSEMBLY_RUN_TIME_STORAGE_DIRECTORY
  return { dataDirectory, storageDirectory }
}

export function getDatabasePath() {
  const { dataDirectory } = getDirectories()
  return path.join(dataDirectory, 'retroassembly.sqlite')
}

export interface AuthentikConfig {
  clientId: string
  clientSecret: string
  issuer: string
  loginButtonLabel: string
  redirectUri: string
  sessionSecret: string
  uploaderGroup: string
}

export function assertAuthentikEnv(env: Record<string, string | undefined>): AuthentikConfig {
  const required = [
    'RETROASSEMBLY_RUN_TIME_AUTHENTIK_ISSUER',
    'RETROASSEMBLY_RUN_TIME_AUTHENTIK_CLIENT_ID',
    'RETROASSEMBLY_RUN_TIME_AUTHENTIK_CLIENT_SECRET',
    'RETROASSEMBLY_RUN_TIME_AUTHENTIK_REDIRECT_URI',
    'RETROASSEMBLY_RUN_TIME_AUTHENTIK_UPLOADER_GROUP',
    'RETROASSEMBLY_RUN_TIME_SESSION_SECRET',
  ] as const
  for (const key of required) {
    if (!env[key]) {
      throw new Error(`Missing required env var: ${key.replace('RETROASSEMBLY_RUN_TIME_', '')}`)
    }
  }
  const sessionSecret = env.RETROASSEMBLY_RUN_TIME_SESSION_SECRET!
  if (sessionSecret.length < 16) {
    throw new Error('SESSION_SECRET must be at least 16 characters')
  }
  return {
    clientId: env.RETROASSEMBLY_RUN_TIME_AUTHENTIK_CLIENT_ID!,
    clientSecret: env.RETROASSEMBLY_RUN_TIME_AUTHENTIK_CLIENT_SECRET!,
    issuer: env.RETROASSEMBLY_RUN_TIME_AUTHENTIK_ISSUER!,
    loginButtonLabel: env.RETROASSEMBLY_RUN_TIME_AUTHENTIK_LOGIN_BUTTON_LABEL || 'Log in with SSO',
    redirectUri: env.RETROASSEMBLY_RUN_TIME_AUTHENTIK_REDIRECT_URI!,
    sessionSecret,
    uploaderGroup: env.RETROASSEMBLY_RUN_TIME_AUTHENTIK_UPLOADER_GROUP!,
  }
}
