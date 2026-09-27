/**
 * Email address normalization.
 *
 * One address must not be able to become two accounts. Casing is the common way that
 * happens — `Ada@Example.com` and `ada@example.com` are the same mailbox — so addresses
 * are lowercased and trimmed before they are stored or looked up.
 *
 * Deliberately does *not* strip dots or `+tags`: those are Gmail conventions, not rules,
 * and applying them to other providers would merge addresses that belong to different
 * people.
 */

/** A loose shape check. Real validation is whether the code arrives. */
const SHAPE = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;

/** The canonical form, or null when it is not a plausible address. */
export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (email === '' || email.length > 320) return null;
  return SHAPE.test(email) ? email : null;
}
