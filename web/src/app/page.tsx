import MascotPortfolioHero from '@/components/ui/mascot-portfolio-hero'
import SiteHeader, { SITE_HEADER_HEIGHT } from '@/components/landing/site-header'
import OverviewSection from '@/components/landing/overview-section'
import WorkflowSection from '@/components/landing/workflow-section'
import StressTestSection from '@/components/landing/stress-test-section'
import BrandOsSection from '@/components/landing/brand-os-section'
import ClosingSection from '@/components/landing/closing-section'

export default function Home() {
  return (
    <main>
      <SiteHeader />
      <MascotPortfolioHero
        height={`calc(100svh - ${SITE_HEADER_HEIGHT})`}
        /* top rule */
        index="BRANDOS"
        discipline="AI brand engine"
        tagline="Branding as a decision system"
        collection={['Idea', 'Brand OS']}
        reel={['Stress-tested strategy', 'Launch-ready brand']}
        /* headline: IDEA ↘ OS / BUILD / CHALLENGE / LAUNCH [Brand OS] (IT)* */
        year="Idea"
        initials="OS"
        badge="Try to break it"
        line2="Build"
        line3="Challenge"
        word="Launch"
        verticalTag="Brand OS"
        bracketed="It"
        /* call to action */
        seekingLabel="Got a rough idea?"
        seeking="Start building"
        href="/new"
        services={['Discovery', 'Positioning', 'Brand Battle', 'Stress Test', 'Consistency']}
        greetings={[
          'Hi! Got a rough idea?',
          "I'll ask a few sharp questions first.",
          'Then we try to break your brand.',
          'Okay, you can stop poking me :)',
        ]}
      />
      <OverviewSection />
      <WorkflowSection />
      <StressTestSection />
      <BrandOsSection />
      <ClosingSection />
    </main>
  )
}
