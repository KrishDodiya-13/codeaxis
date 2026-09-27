/**
 * Whether a usable model credential is configured.
 *
 * One definition, used by every route that calls the model, so they cannot disagree
 * about what counts as configured. It exists because the two realistic mistakes both
 * produce a non-empty value and so would otherwise sail through to the API and come
 * back as an opaque 401 several layers from the cause:
 *
 *   - the key is absent entirely
 *   - `.env.example` was copied and the placeholder left in place
 *
 * It deliberately checks shape only, never validity. Whether a well-formed key is
 * accepted is the API's business, and guessing here would just add a second opinion.
 */

/** The placeholder shipped in `.env.example`. */
const PLACEHOLDER = 'your-groq-api-key';

/**
 * The shortest plausible real key.
 *
 * Groq keys are `gsk_` followed by a long random tail. Anything under this is a truncated
 * paste or a stand-in, not a key — and treating it as one costs a round trip and hands
 * back a message that points at the wrong thing.
 */
const MIN_KEY_LENGTH = 20;

/** A message naming what is wrong, or null when a usable credential is configured. */
export function credentialProblem(): string | null {
  const key = (process.env.GROQ_API_KEY ?? '').trim();

  if (key === '') {
    return (
      'No model API key is configured on the server. Add GROQ_API_KEY to ' +
      'web/.env.local and restart the dev server.'
    );
  }

  if (key === PLACEHOLDER) {
    return (
      'GROQ_API_KEY in web/.env.local is still the placeholder from .env.example. ' +
      'Replace it with a real key from console.groq.com/keys, then restart the dev server.'
    );
  }

  if (key.length < MIN_KEY_LENGTH) {
    return (
      `GROQ_API_KEY in web/.env.local is only ${key.length} characters, which is too ` +
      'short to be a real key — it looks like a placeholder or a truncated paste. Copy the ' +
      'whole key from console.groq.com/keys, then restart the dev server.'
    );
  }

  return null;
}

/** Convenience for the common `if` at the top of a route. */
export function hasModelCredential(): boolean {
  return credentialProblem() === null;
}
