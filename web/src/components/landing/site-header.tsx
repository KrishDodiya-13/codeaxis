import Link from 'next/link'
import { Button } from '@/components/ui/button'

export const SITE_HEADER_HEIGHT = '4rem'

export default function SiteHeader() {
  return (
    <header
      className="flex items-center justify-between border-b border-poster-ink/15 bg-poster-paper px-6 text-poster-ink md:px-10"
      style={{ height: SITE_HEADER_HEIGHT }}
    >
      <Link
        href="/"
        className="font-display text-xl uppercase tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-poster-ink"
      >
        Brandos
      </Link>

      <nav aria-label="Account" className="flex items-center gap-2">
        <Button
          asChild
          variant="ghost"
          className="rounded-full font-semibold text-poster-ink hover:bg-poster-ink/5 hover:text-poster-ink focus-visible:ring-poster-ink"
        >
          <Link href="/login">Log in</Link>
        </Button>
        <Button
          asChild
          className="rounded-full border border-poster-ink bg-poster-ink font-semibold text-poster-paper shadow-none hover:bg-poster-green hover:text-poster-ink focus-visible:ring-poster-ink"
        >
          <Link href="/signup">Sign up</Link>
        </Button>
      </nav>
    </header>
  )
}
