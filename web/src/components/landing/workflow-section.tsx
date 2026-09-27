import { PosterSection, SectionTag } from './poster-section'
import TechHeading from './tech-heading'

const STAGES = [
  { name: 'Discover', body: 'A short interview that only asks questions that could change your strategy.' },
  { name: 'Position', body: 'Category, audience, value and differentiator, each tied to what you told us.' },
  { name: 'Shape', body: 'Personality, principles, naming territories and message hierarchy.' },
  { name: 'Visualize', body: 'Colour, type and imagery direction, explained against your audience.' },
  { name: 'Brand Battle', body: 'Two or three genuinely different directions, with their trade-offs.' },
  { name: 'Stress Test', body: 'We attack the direction you picked and show you where it is weak.' },
  { name: 'Consistency', body: 'Paste real copy and check it against your approved Brand DNA.' },
  { name: 'Brand OS', body: 'The finished system: strategy, identity, visual, voice and launch kit.' },
] as const

export default function WorkflowSection() {
  return (
    <PosterSection id="how-it-works">
      <div className="flex flex-wrap items-end justify-between gap-8">
        <div className="min-w-0 flex-1 basis-[34rem]">
          <SectionTag index="02" label="How it works" />
          <TechHeading
            className="mt-8"
            label="Eight stages. One brand state."
            lines={[{ text: 'EIGHT STAGES.', sweep: true }, { text: 'ONE BRAND STATE*' }]}
          />
        </div>
        <p className="max-w-sm text-base font-semibold leading-snug">
          <span className="text-poster-green">*</span> Every stage reads the decisions before it. Change one,
          and only the parts that depend on it are recalculated.
        </p>
      </div>

      <ol className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STAGES.map((stage, i) => (
          <li
            key={stage.name}
            className="group rounded-3xl border-2 border-poster-ink bg-white/70 p-6 transition-[transform,background-color,box-shadow] duration-300 hover:-translate-y-1 hover:bg-poster-green hover:shadow-[6px_6px_0_#111111] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
          >
            <span className="font-display text-4xl leading-none tracking-tight">
              {String(i + 1).padStart(2, '0')}
            </span>
            <h3 className="mt-6 text-lg font-extrabold uppercase">{stage.name}</h3>
            <p className="mt-2 text-sm font-medium text-poster-ink/70 group-hover:text-poster-ink">{stage.body}</p>
          </li>
        ))}
      </ol>
    </PosterSection>
  )
}
