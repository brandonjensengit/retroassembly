import { describe, expect, it } from 'vitest'
import { sanitizeRedirectTo } from './safe-redirect.ts'

describe('sanitizeRedirectTo', () => {
  it('accepts relative paths starting with /', () => {
    expect(sanitizeRedirectTo('/library')).toBe('/library')
    expect(sanitizeRedirectTo('/library/platform/nes')).toBe('/library/platform/nes')
    expect(sanitizeRedirectTo('/library?foo=bar')).toBe('/library?foo=bar')
  })

  it('rejects absolute URLs and falls back', () => {
    expect(sanitizeRedirectTo('https://evil.example/')).toBe('/library')
    expect(sanitizeRedirectTo('http://evil.example')).toBe('/library')
  })

  it('rejects protocol-relative URLs', () => {
    expect(sanitizeRedirectTo('//evil.example')).toBe('/library')
    expect(sanitizeRedirectTo('//evil.example/library')).toBe('/library')
  })

  it('rejects backslash-prefixed escapes', () => {
    expect(sanitizeRedirectTo(String.raw`/\evil.example`)).toBe('/library')
  })

  it('accepts custom fallback', () => {
    expect(sanitizeRedirectTo(null, '/')).toBe('/')
    expect(sanitizeRedirectTo('https://evil', '/')).toBe('/')
  })

  it('handles null/undefined/empty', () => {
    expect(sanitizeRedirectTo(null)).toBe('/library')
    expect(sanitizeRedirectTo(undefined)).toBe('/library')
    expect(sanitizeRedirectTo('')).toBe('/library')
  })
})
