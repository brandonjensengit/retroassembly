/**
 * Ensures a redirect target is a local, same-origin relative path.
 * Defends against open-redirect phishing post-authentication.
 * Returns the input if safe, or the fallback if not.
 */
export function sanitizeRedirectTo(input: string | null | undefined, fallback = '/library'): string {
  if (!input) {
    return fallback
  }
  if (!input.startsWith('/')) {
    return fallback
  }
  if (input.startsWith('//')) {
    return fallback
  }
  if (input.startsWith('/\\')) {
    return fallback
  }
  return input
}
