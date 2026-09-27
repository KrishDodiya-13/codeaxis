import Link from 'next/link'
import PaperCrumple from './lazy-paper-crumple'
import HoverLetters from '@/components/hover-letters'
import { PosterRoom } from '@/components/landing/poster-section'

function Wordmark() {
  return (
    <Link
      href="/"
      className="group inline-flex items-center gap-3 self-start rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-poster-green"
    >
      <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-lg border-2 border-poster-ink bg-white">
        <span className="h-3 w-3 rotate-45 rounded-[3px] bg-poster-green" />
      </span>
      <span className="font-display text-lg uppercase tracking-tight transition-colors group-hover:text-poster-green">
        Brandos
      </span>
    </Link>
  )
}

/**
 * Auth layout on one continuous poster: the landing grid behind everything, the
 * form on the right, and a crumplable BRANDOS print that can be dragged anywhere.
 */
export default function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative isolate min-h-[100svh] overflow-hidden bg-poster-paper text-poster-ink antialiased">
      <PosterRoom />

      <div className="relative z-10 flex min-h-[100svh] flex-col p-6 md:p-10">
        <Wordmark />

        <div className="flex flex-1 items-center justify-center py-12 xl:justify-end xl:pr-[5%]">{children}</div>

        <div>
          <p className="font-display text-4xl uppercase leading-[0.95] tracking-[-0.03em]">
            <HoverLetters text="Build it." />
            <br />
            <HoverLetters text="Challenge it." />
            <br />
            <HoverLetters text="Launch it." />
          </p>
          <p className="mt-4 hidden text-sm font-semibold text-poster-ink/60 transition-colors hover:text-poster-green xl:block">
            Press and hold the print to crumple it. Drag it anywhere on the page.
          </p>
        </div>
      </div>

      {/* The print floats above the page and can be dragged anywhere in the viewport.
          Only the paper itself takes pointer events, so the form underneath stays usable.
          It starts at the centre, which is empty space at xl widths and up. */}
      <div className="pointer-events-none fixed inset-0 z-20 hidden xl:block">
        <PaperCrumple
          src="/brandos-print.webp"
          alt="BRANDOS print: Build, break, launch"
          width={380}
          height={475}
          sceneHeight={560}
          releaseBehavior="restore"
          crumpleAmount={0.85}
          crumpleDuration={0.55}
          releaseDuration={0.4}
          foldCount={6}
          foldSharpness={0.6}
          wrinkleDepth={0.65}
          creaseStrength={0.18}
          paperColor="#ffffff"
          paperTexture={0.08}
          draggable
          dragRadius={5000}
          returnToOrigin={false}
          seed={8}
          className="[&_.paper-crumple-hit]:pointer-events-auto"
          style={{ height: '100%', pointerEvents: 'none' }}
        />
      </div>
    </main>
  )
}
