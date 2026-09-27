/**
 * The browser-side POST helper.
 *
 * One copy, because four workspaces had their own near-identical version and a 401 needs
 * handling in exactly one place — duplicating that decision is how they drift apart.
 *
 * ## A 401 means the session went away
 *
 * The page guards stop a logged-out visitor arriving at all, so a 401 here means the
 * session expired or was revoked (a password reset does that deliberately) while the page
 * was open. Sending them to login with a way back is more useful than an error card they
 * can do nothing about — and the local project data is untouched, so returning lands them
 * where they were.
 *
 * The redirect is a full navigation rather than a router push, because the session is gone
 * and every server component on the current tree needs re-rendering against that fact.
 */

/** Thrown for a failed request. `detail` carries the dev-only extra the routes append. */
export class ApiRequestError extends Error {
  readonly detail: string | undefined;
  readonly status: number;

  constructor(message: string, status: number, detail?: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.detail = detail;
  }
}

/** Sends the browser to login, returning here afterwards. */
export function redirectToLogin(): void {
  if (typeof window === 'undefined') return;
  const back = window.location.pathname + window.location.search;
  window.location.assign(`/login?callbackUrl=${encodeURIComponent(back)}`);
}

/**
 * POSTs JSON and returns the parsed body.
 *
 * On 401 it navigates to login and never resolves, so a caller does not have to handle a
 * signed-out state on every call site. Every other failure throws `ApiRequestError`.
 */
export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data: unknown = await res.json().catch(() => null);

  if (res.status === 401) {
    redirectToLogin();
    // Never settles: the page is navigating away, and resolving would let a caller render
    // an error for a moment first.
    return new Promise<never>(() => {});
  }

  if (!res.ok) {
    const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
    const message = typeof record.error === 'string' ? record.error : 'The request failed.';
    const detail =
      record.detail === undefined
        ? undefined
        : typeof record.detail === 'string'
          ? record.detail
          : JSON.stringify(record.detail);
    // In development the routes append ` — <detail>` and also send it separately; strip
    // the suffix so a card leads with the plain sentence.
    const headline =
      detail !== undefined && message.endsWith(` — ${detail}`)
        ? message.slice(0, -(detail.length + 3))
        : message;
    throw new ApiRequestError(headline, res.status, detail);
  }

  return data as T;
}
