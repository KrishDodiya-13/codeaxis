import { PosterSection, SectionTag } from './poster-section'
import TechHeading from './tech-heading'

const CHAPTERS = [
  { name: 'Strategy', items: ['Problem', 'Audience', 'Category', 'Positioning', 'Differentiator'] },
  { name: 'Identity', items: ['Personality', 'Principles', 'Name', 'Tagline', 'One-line pitch'] },
  { name: 'Visual', items: ['Colour direction', 'Typography', 'Shape language', 'Imagery'] },
  { name: 'Voice', items: ['Tone', 'Message hierarchy', 'Sample copy'] },
  { name: 'Launch', items: ['Landing headline', 'Pitch', 'Social launch copy'] },
  { name: 'Validation', items: ['Stress-test findings', 'Consistency checks', 'Remaining risks'] },
] as const

export default function BrandOsSection() {
  return (
    <PosterSection id="brand-os">
      <SectionTag index="04" label="The deliverable" />
      <TechHeading
        className="mt-8"
        label="You leave with a Brand OS."
        lines={[{ text: 'YOU LEAVE WITH' }, { text: 'A BRAND OS.', sweep: true }]}
      />
      <p className="mt-8 max-w-2xl text-lg font-semibold leading-snug md:text-xl">
        Not a chat transcript. A structured, shareable brand system, with every decision traceable
        back to why it was made.
      </p>

      <div className="mt-14 grid gap-px overflow-hidden rounded-3xl border-2 border-poster-ink bg-poster-ink sm:grid-cols-2 lg:grid-cols-3">
        {CHAPTERS.map((chapter, i) => (
          <section key={chapter.name} className="bg-poster-paper p-7">
            <div className="flex items-baseline justify-between">
              <h3 className="font-display text-2xl uppercase tracking-tight">{chapter.name}</h3>
              <span className="text-xs font-extrabold text-poster-ink/50">{String(i + 1).padStart(2, '0')}</span>
            </div>
            <ul className="mt-5 space-y-2">
              {chapter.items.map((item) => (
                <li key={item} className="flex items-center gap-3 font-semibold">
                  <span aria-hidden="true" className="h-2 w-2 rounded-full bg-poster-green ring-1 ring-poster-ink" />
                  {item}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </PosterSection>
  )
}
