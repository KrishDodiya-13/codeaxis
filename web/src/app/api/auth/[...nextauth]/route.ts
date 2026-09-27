/**
 * The Auth.js route: sign-in, the OAuth callback, sign-out, session.
 *
 * All of it server-side. The OAuth `state` and PKCE values are set and checked here, so
 * a callback that did not originate from this server's own redirect is rejected.
 */
import { handlers } from '@/lib/auth/config'

export const runtime = 'nodejs'

export const { GET, POST } = handlers
