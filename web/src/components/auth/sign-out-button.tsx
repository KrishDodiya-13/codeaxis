/**
 * The sign-out control.
 *
 * A form posting to a server action, not a link. Sign-out has to be a POST: a GET that
 * ends a session can be triggered by any page that embeds the URL — an `<img src>` is
 * enough — which is a cross-site request forgery. Next's server actions carry their own
 * CSRF protection, so this is safe without a hand-rolled token.
 *
 * No client JavaScript: it works with JS disabled, and there is no session state held in
 * the browser to go stale.
 */
import { signOut } from '@/lib/auth/config'
import { Button } from '@/components/ui/button'

export default function SignOutButton() {
  return (
    <form
      action={async () => {
        'use server'
        // Clears the session cookie server-side and returns to the public landing page.
        await signOut({ redirectTo: '/' })
      }}
    >
      <Button
        type="submit"
        variant="ghost"
        className="rounded-full font-semibold text-poster-ink hover:bg-poster-ink/5 hover:text-poster-ink focus-visible:ring-poster-ink"
      >
        Sign out
      </Button>
    </form>
  )
}
