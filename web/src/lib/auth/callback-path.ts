/**
 * Validation for a post-login redirect target.
 *
 * Its own module, with no framework imports, so it is testable in isolation — the thing it
 * prevents is worth being able to test directly.
 */

/**
 * Whether a redirect target is safe to send a browser to after login.
 *
 * Only a path on this origin. Without this check, `?callbackUrl=https://evil.example`
 * would turn the login page into an open redirect — a phishing primitive, because the link
 * genuinely starts on a domain the user trusts.
 *
 * Protocol-relative URLs (`//evil.example`) and the backslash variant are rejected too:
 * browsers treat both as absolute despite looking relative.
 */
export function safeCallbackPath(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string' || raw === '') return null
  if (!raw.startsWith('/')) return null
  if (raw.startsWith('//') || raw.startsWith('/\\')) return null
  // A control character could smuggle a second header or confuse a parser downstream.
  if (/[\u0000-\u001f\u007f]/.test(raw)) return null
  return raw
}
