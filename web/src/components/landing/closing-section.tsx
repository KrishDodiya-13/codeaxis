import Link from 'next/link'
import { PosterSection, SectionTag } from './poster-section'
import TechHeading from './tech-heading'

export default function ClosingSection() {
  return (
    <PosterSection id="start" className="flex min-h-[100svh] flex-col justify-between gap-16">
      <div className="flex flex-1 flex-col justify-center">
        <SectionTag index="05" label="Start" />
        <TechHeading
          className="mt-8"
          label="Most AI branding tools generate. BRANDOS builds, challenges and validates."
          lines={[
              { text: 'MOST AI BRANDING', color: 'rgba(17, 17, 17, 0.35)' },
              { text: 'TOOLS GENERATE.', color: 'rgba(17, 17, 17, 0.35)' },
              { text: 'BRANDOS BUILDS,', sweep: true },
              { text: 'CHALLENGES' },
              { text: 'AND VALIDATES*' },
          ]}
        />

        {/* Same split pill as the hero. */}
        <div className="mt-12 flex items-stretch text-lg font-extrabold leading-none md:text-2xl">
          <span className="relative z-10 rounded-full border-2 border-poster-ink bg-white px-6 py-4">
            Got a rough idea?
          </span>
          <Link
            href="/new"
            className="group -ml-6 inline-flex items-center gap-2 rounded-r-full border-2 border-poster-ink bg-poster-green py-4 pl-12 pr-10 transition-colors duration-200 hover:bg-poster-ink hover:text-poster-paper focus-visible:bg-poster-ink focus-visible:text-poster-paper focus-visible:outline-none"
          >
            Start building
            <span aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-1">
              →
            </span>
          </Link>
        </div>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-4 border-t-2 border-poster-ink pt-6 text-sm font-extrabold uppercase">
        <span className="font-display text-lg tracking-tight">Brandos</span>
        <span>Build it. Challenge it. Launch it.</span>
        <span className="text-poster-ink/60">© 2026</span>
      </footer>
    </PosterSection>
  )
}
