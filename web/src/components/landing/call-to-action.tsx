import Link from 'next/link'

export default function CallToAction() {
  return (
    <section className="container py-24 text-center">
      <h2 className="text-4xl font-semibold tracking-tight">Your brand is ready. Try to break it.</h2>
      <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
        Most AI branding tools generate. BRANDOS builds, challenges and validates.
      </p>
      <Link
        href="/new"
        className="mt-8 inline-flex h-11 items-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Start Building
      </Link>
    </section>
  )
}
