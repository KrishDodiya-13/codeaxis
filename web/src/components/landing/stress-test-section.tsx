import { PosterSection, SectionTag } from './poster-section'
import TechHeading from './tech-heading'

type Status = 'pass' | 'warning' | 'fail'

// Illustrative only: shows the shape of a report, not results from a real run.
const EXAMPLE_TESTS: { name: string; status: Status; note: string }[] = [
  { name: 'Cliché', status: 'warning', note: '"Innovative" and "seamless" appear in three messages.' },
  { name: 'Audience fit', status: 'pass', note: 'Tone matches the audience you described.' },
  { name: 'Differentiation', status: 'fail', note: 'The core claim could describe any product in the category.' },
  { name: 'Contradiction', status: 'pass', note: 'Personality and visual direction agree.' },
  { name: 'Message clarity', status: 'warning', note: 'The one-line pitch needs two reads to land.' },
  { name: 'Defensibility', status: 'warning', note: 'The angle rests on an assumption we could not verify.' },
]

const STATUS_STYLE: Record<Status, { mark: string; label: string; className: string }> = {
  pass: { mark: '✓', label: 'Pass', className: 'bg-poster-green text-poster-ink' },
  warning: { mark: '!', label: 'Warning', className: 'bg-[#f2c94c] text-poster-ink' },
  fail: { mark: '✕', label: 'Fail', className: 'bg-[#e5484d] text-white' },
}

export default function StressTestSection() {
  return (
    <PosterSection id="stress-test">
      <div className="grid items-center gap-14 lg:grid-cols-[1fr_1.1fr]">
        <div className="min-w-0">
          <SectionTag index="03" label="Signature feature" />
          <TechHeading
            className="mt-8"
            label="Try to break this brand."
            lines={[{ text: 'TRY TO' }, { text: 'BREAK', sweep: true }, { text: 'THIS BRAND*' }]}
          />
          <p className="mt-8 max-w-md text-lg font-semibold leading-snug">
            Before you launch, BRANDOS attacks your chosen direction: clichés, weak differentiation,
            contradictions, unclear messages. Every finding comes with evidence and a suggested fix.
          </p>
          <div className="mt-8 flex flex-wrap gap-3 text-sm font-extrabold uppercase">
            {['Accept', 'Keep original', 'Edit'].map((action) => (
              <span key={action} className="rounded-full border-2 border-poster-ink bg-white px-4 py-2">
                {action}
              </span>
            ))}
          </div>
        </div>

        <figure className="rounded-3xl border-2 border-poster-ink bg-poster-ink p-6 text-poster-paper shadow-[8px_8px_0_#5fb57a] md:p-8">
          <figcaption className="flex items-center justify-between text-xs font-extrabold uppercase tracking-wide">
            <span>Stress test report</span>
            <span className="rounded-full border border-poster-paper/40 px-3 py-1 text-poster-paper/70">Example</span>
          </figcaption>
          <ul className="mt-6 divide-y divide-poster-paper/15">
            {EXAMPLE_TESTS.map((test) => {
              const s = STATUS_STYLE[test.status]
              return (
                <li key={test.name} className="flex items-start gap-4 py-4">
                  <span
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-extrabold ${s.className}`}
                    aria-label={s.label}
                    role="img"
                  >
                    {s.mark}
                  </span>
                  <div>
                    <p className="font-extrabold uppercase">{test.name}</p>
                    <p className="mt-1 text-sm text-poster-paper/70">{test.note}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        </figure>
      </div>
    </PosterSection>
  )
}
