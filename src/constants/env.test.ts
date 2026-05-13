import { describe, expect, it } from 'vitest'
import { assertAuthentikEnv } from './env.ts'

describe('assertAuthentikEnv', () => {
  it('throws when AUTHENTIK_ISSUER is missing', () => {
    expect(() =>
      assertAuthentikEnv({
        RETROASSEMBLY_RUN_TIME_AUTHENTIK_CLIENT_ID: 'cid',
        RETROASSEMBLY_RUN_TIME_AUTHENTIK_CLIENT_SECRET: 'sec',
        RETROASSEMBLY_RUN_TIME_AUTHENTIK_ISSUER: '',
        RETROASSEMBLY_RUN_TIME_AUTHENTIK_REDIRECT_URI: 'https://x/cb',
        RETROASSEMBLY_RUN_TIME_AUTHENTIK_UPLOADER_GROUP: 'g',
        RETROASSEMBLY_RUN_TIME_SESSION_SECRET: 'sssss',
      }),
    ).toThrow(/Missing required env var.*AUTHENTIK_ISSUER/u)
  })

  it('returns the typed config when all vars present', () => {
    const cfg = assertAuthentikEnv({
      RETROASSEMBLY_RUN_TIME_AUTHENTIK_CLIENT_ID: 'cid',
      RETROASSEMBLY_RUN_TIME_AUTHENTIK_CLIENT_SECRET: 'sec',
      RETROASSEMBLY_RUN_TIME_AUTHENTIK_ISSUER: 'https://auth.example/application/o/r/',
      RETROASSEMBLY_RUN_TIME_AUTHENTIK_REDIRECT_URI: 'https://x/cb',
      RETROASSEMBLY_RUN_TIME_AUTHENTIK_UPLOADER_GROUP: 'uploaders',
      RETROASSEMBLY_RUN_TIME_SESSION_SECRET: 'a-secret-of-sufficient-length',
    })
    expect(cfg.issuer).toBe('https://auth.example/application/o/r/')
    expect(cfg.uploaderGroup).toBe('uploaders')
  })

  it('throws when SESSION_SECRET is shorter than 16 chars', () => {
    expect(() =>
      assertAuthentikEnv({
        RETROASSEMBLY_RUN_TIME_AUTHENTIK_CLIENT_ID: 'cid',
        RETROASSEMBLY_RUN_TIME_AUTHENTIK_CLIENT_SECRET: 'sec',
        RETROASSEMBLY_RUN_TIME_AUTHENTIK_ISSUER: 'https://auth.example/application/o/r/',
        RETROASSEMBLY_RUN_TIME_AUTHENTIK_REDIRECT_URI: 'https://x/cb',
        RETROASSEMBLY_RUN_TIME_AUTHENTIK_UPLOADER_GROUP: 'g',
        RETROASSEMBLY_RUN_TIME_SESSION_SECRET: 'short',
      }),
    ).toThrow(/SESSION_SECRET must be at least 16 characters/u)
  })
})
