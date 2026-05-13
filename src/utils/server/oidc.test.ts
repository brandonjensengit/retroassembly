import { describe, expect, it } from 'vitest'
import { extractUserClaims } from './oidc.ts'

describe('extractUserClaims', () => {
  it('extracts sub, email, name, preferred_username, groups from claims', () => {
    const claims = {
      email: 'alice@example.com',
      groups: ['retroassembly-uploaders', 'staff'],
      name: 'Alice Doe',
      preferred_username: 'alice',
      sub: 'abc-123',
    }
    expect(extractUserClaims(claims)).toEqual({
      displayName: 'Alice Doe',
      email: 'alice@example.com',
      groups: ['retroassembly-uploaders', 'staff'],
      oidcSub: 'abc-123',
      username: 'alice',
    })
  })

  it('falls back to email-local-part when preferred_username is missing', () => {
    expect(extractUserClaims({ email: 'bob@example.com', name: 'Bob', sub: 'x' })).toMatchObject({ username: 'bob' })
  })

  it('returns empty groups array when claim absent or non-array', () => {
    expect(extractUserClaims({ email: 'c@e.com', name: 'C', sub: 'x' })).toMatchObject({ groups: [] })
    expect(
      extractUserClaims({ email: 'c@e.com', groups: 'not-an-array' as unknown as string[], name: 'C', sub: 'x' }),
    ).toMatchObject({ groups: [] })
  })

  it('throws when sub is missing', () => {
    expect(() => extractUserClaims({ email: 'x@y' } as never)).toThrow(/sub/)
  })
})
