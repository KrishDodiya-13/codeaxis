'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import DecryptedText from '@/components/DecryptedText'

// ssr: false is only allowed in client components; Three.js needs window.
const BrandosLanyardControls = dynamic(
  () => import('@/components/landing/brandos-lanyard-controls'),
  { ssr: false }
)
const Dither = dynamic(() => import('@/components/Dither'), { ssr: false })

export default function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 z-0" aria-hidden="true">
        <Dither
          waveColor={[0.35, 0.35, 0.35]}
          disableAnimation={false}
          enableMouseInteraction={true}
          mouseRadius={0.1}
          colorNum={5.3}
          waveAmplitude={0.14}
          waveFrequency={3.9}
          waveSpeed={0.06}
        />
        {/* Fade the dither towards the left so the headline stays readable. */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-background via-background/70 to-transparent" />
      </div>
      {/* pointer-events-none lets the mouse reach the dither; interactive children opt back in. */}
      <div className="pointer-events-none relative z-10 container grid items-center gap-12 py-24 lg:grid-cols-2">
        <div className="space-y-6">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
            AI Brand Decision Engine
          </p>
          <h1 className="text-5xl font-semibold tracking-tight md:text-6xl">
            <DecryptedText text="Build it. Challenge it. Launch it." animateOn="view" sequential />
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground">
            BRANDOS turns an incomplete idea into a coherent brand system, stress-tests the
            strategy, and delivers a launch-ready Brand OS.
          </p>
          <Link
            href="/new"
            className="pointer-events-auto inline-flex h-11 items-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Start Building
          </Link>
        </div>
        <div className="pointer-events-auto">
          <BrandosLanyardControls />
        </div>
      </div>
    </section>
  )
}
