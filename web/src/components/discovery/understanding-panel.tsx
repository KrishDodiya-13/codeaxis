import type { DiscoverResult } from '@/lib/discovery'
import { FieldLabel, Panel } from '@/components/project/panel'
import { DotList, SPRING, Stamp } from '@/components/strategy/ui'
import { cn } from '@/lib/utils'

/** While the first read runs: skeleton lines that pulse, so the gap reads as "filling in". */
function Gathering({ lines = 2 }: { lines?: number }) {
  return (
    <div className="space-y-2" aria-label="Still gathering">
      {Array.from({ length: lines }, (_, i) => (
        <span
          key={i}
          style={{ animationDelay: `${i * 150}ms` }}
          className={cn('block h-3.5 animate-pulse rounded-full bg-poster-ink/10 motion-reduce:animate-none', i === lines - 1 ? 'w-2/3' : 'w-full')}
        />
      ))}
    </div>
  )
}

function Empty({ gathering }: { gathering: boolean }) {
  if (gathering) return <Gathering />
  return <p className="text-sm font-semibold text-poster-ink/40">○ Not yet identified</p>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="group/field border-t-2 border-poster-ink/10 pt-4 first:border-t-0 first:pt-0">
      <FieldLabel className="transition-colors duration-200 group-hover/field:text-poster-green">{label}</FieldLabel>
      <div className="mt-2">{children}</div>
    </div>
  )
}

/** A filled value. Keyed on its text, so each update slides in rather than swapping silently. */
function Value({ text }: { text: string }) {
  return (
    <p key={text} className="text-lg font-semibold leading-snug animate-in fade-in-0 slide-in-from-left-2 duration-500">
      {text}
    </p>
  )
}

function List({ items, gathering }: { items: string[] | undefined; gathering: boolean }) {
  if (!items || items.length === 0) return <Empty gathering={gathering} />
  return (
    <div key={items.join('|')} className="animate-in fade-in-0 slide-in-from-left-2 duration-500">
      <DotList items={items} />
    </div>
  )
}

/** Center panel: the discovery state as labelled fields, never raw JSON. */
export default function UnderstandingPanel({
  idea,
  discovery,
  gathering,
}: {
  idea: string
  discovery: DiscoverResult | null
  gathering: boolean
}) {
  const d = discovery
  return (
    <Panel index="02" label="Current understanding" title="Discovery state" delay={90}>
      <div className="space-y-5">
        {/* The idea as a pinned note: tilts a touch and lifts on hover, like the /new stickers. */}
        <div
          className={cn(
            'relative rounded-2xl border-2 border-dashed border-poster-ink/30 bg-white px-4 py-3',
            'transition-[transform,box-shadow,border-color] duration-300 hover:-rotate-[0.6deg] hover:border-poster-ink hover:shadow-[4px_4px_0_0_#111]',
            'motion-reduce:transition-none motion-reduce:hover:rotate-0',
            SPRING,
          )}
        >
          <Stamp tone="white" className="absolute -top-3 right-3 bg-poster-paper">
            Your words
          </Stamp>
          <FieldLabel>Your idea</FieldLabel>
          <p className="mt-1 whitespace-pre-wrap text-sm font-semibold text-poster-ink/70">{idea}</p>
        </div>

        <Field label="Problem">{d ? <Value text={d.problem} /> : <Empty gathering={gathering} />}</Field>
        <Field label="Target audience">{d ? <Value text={d.targetAudience} /> : <Empty gathering={gathering} />}</Field>
        <Field label="User need">{d ? <Value text={d.userNeed} /> : <Empty gathering={gathering} />}</Field>
        <Field label="Goals">
          <List items={d?.goals} gathering={gathering && !d} />
        </Field>
        <Field label="Constraints">
          <List items={d?.constraints} gathering={gathering && !d} />
        </Field>

        {d && d.assumptions.length > 0 && (
          <p className="rounded-2xl border-2 border-[#f2c94c] bg-[#f2c94c]/25 px-4 py-3 text-xs font-semibold leading-snug animate-in fade-in-0 duration-500">
            Some of this is inferred rather than something you said. Those inferences are listed under
            <span className="font-extrabold"> Assumptions</span> — confirm or correct them there.
          </p>
        )}
      </div>
    </Panel>
  )
}
