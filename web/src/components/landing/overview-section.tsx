import { PosterSection, SectionTag } from './poster-section'
import TechHeading from './tech-heading'

const BRANDOS_FLOW = ['Discover', 'Position', 'Shape', 'Visualize', 'Stress-test', 'Validate', 'Brand OS']

const PRINCIPLES = [
  { title: 'AI recommends. You decide.', body: 'Every meaningful decision can be accepted, rejected or edited.' },
  { title: 'No invented facts.', body: 'What you told us, what we inferred and what we assumed are kept apart.' },
  { title: 'Every decision has a reason.', body: 'Click any part of your brand to see why it is there.' },
]

export default function OverviewSection() {
  return (
    <PosterSection id="overview">
      <SectionTag index="01" label="Overview" />
      <TechHeading
        className="mt-8"
        label="A rough idea is not a brand."
        lines={[{ text: 'A ROUGH IDEA', sweep: true }, { text: 'IS NOT A BRAND.' }]}
      />
      <p className="mt-8 max-w-2xl text-lg font-semibold leading-snug md:text-xl">
        BRANDOS treats branding as a decision system. Each stage builds on the decisions you have
        already approved, explains its reasoning, and challenges weak assumptions before you launch.
      </p>

      <div className="mt-14 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <div className="rounded-3xl border-2 border-poster-ink/30 bg-white/40 p-7">
          <p className="text-xs font-extrabold uppercase tracking-wide text-poster-ink/50">The usual way</p>
          <p className="mt-4 font-display text-2xl uppercase leading-tight tracking-tight text-poster-ink/40 line-through decoration-2">
            Rough idea → one giant prompt → generic brand
          </p>
        </div>
        <div className="rounded-3xl border-2 border-poster-ink bg-poster-green p-7 shadow-[6px_6px_0_#111111]">
          <p className="text-xs font-extrabold uppercase tracking-wide">The BRANDOS way</p>
          <ol className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-3">
            {BRANDOS_FLOW.map((step, i) => (
              <li key={step} className="flex items-center gap-2">
                <span className="rounded-full border-2 border-poster-ink bg-white px-3 py-1 text-sm font-extrabold uppercase">
                  {step}
                </span>
                {i < BRANDOS_FLOW.length - 1 && <span aria-hidden="true" className="font-extrabold">→</span>}
              </li>
            ))}
          </ol>
        </div>
      </div>

      <ul className="mt-14 grid gap-8 border-t-2 border-poster-ink pt-8 md:grid-cols-3">
        {PRINCIPLES.map((p) => (
          <li key={p.title}>
            <h3 className="text-lg font-extrabold uppercase">{p.title}</h3>
            <p className="mt-2 font-medium text-poster-ink/70">{p.body}</p>
          </li>
        ))}
      </ul>
    </PosterSection>
  )
}
