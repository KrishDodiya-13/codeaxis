import type { DiscoverResult } from '@/lib/discovery'
import { FieldLabel, Panel } from '@/components/project/panel'

function Empty({ gathering }: { gathering: boolean }) {
  return (
    <p className="text-sm font-semibold text-poster-ink/40">
      {gathering ? '◌ Still gathering…' : '○ Not yet identified'}
    </p>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t-2 border-poster-ink/10 pt-4 first:border-t-0 first:pt-0">
      <FieldLabel>{label}</FieldLabel>
      <div className="mt-2">{children}</div>
    </div>
  )
}

function List({ items, gathering }: { items: string[] | undefined; gathering: boolean }) {
  if (!items || items.length === 0) return <Empty gathering={gathering} />
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item} className="flex gap-3 font-semibold leading-snug">
          <span aria-hidden="true" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-poster-green ring-1 ring-poster-ink" />
          {item}
        </li>
      ))}
    </ul>
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
    <Panel index="02" label="Current understanding" title="Discovery state">
      <div className="space-y-5">
        <div className="rounded-2xl border-2 border-dashed border-poster-ink/30 px-4 py-3">
          <FieldLabel>Your idea</FieldLabel>
          <p className="mt-1 whitespace-pre-wrap text-sm font-semibold text-poster-ink/70">{idea}</p>
        </div>

        <Field label="Problem">
          {d ? <p className="text-lg font-semibold leading-snug">{d.problem}</p> : <Empty gathering={gathering} />}
        </Field>
        <Field label="Target audience">
          {d ? <p className="text-lg font-semibold leading-snug">{d.targetAudience}</p> : <Empty gathering={gathering} />}
        </Field>
        <Field label="User need">
          {d ? <p className="text-lg font-semibold leading-snug">{d.userNeed}</p> : <Empty gathering={gathering} />}
        </Field>
        <Field label="Goals">
          <List items={d?.goals} gathering={gathering && !d} />
        </Field>
        <Field label="Constraints">
          <List items={d?.constraints} gathering={gathering && !d} />
        </Field>

        {d && d.assumptions.length > 0 && (
          <p className="rounded-2xl bg-[#f2c94c]/25 px-4 py-3 text-xs font-semibold leading-snug">
            Some of this is inferred rather than something you said. Those inferences are listed under
            <span className="font-extrabold"> Assumptions</span> — confirm or correct them there.
          </p>
        )}
      </div>
    </Panel>
  )
}
