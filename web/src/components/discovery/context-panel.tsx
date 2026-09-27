import { knownFacts, type DiscoverResult } from '@/lib/discovery'
import { Panel } from '@/components/project/panel'

function Group({
  marker,
  markerClass,
  title,
  count,
  children,
}: {
  marker: string
  markerClass: string
  title: string
  count: number
  children: React.ReactNode
}) {
  return (
    <details open className="border-t-2 border-poster-ink/10 pt-4 first:border-t-0 first:pt-0">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-extrabold uppercase tracking-wide hover:text-poster-green">
        <span aria-hidden="true" className={`grid h-6 w-6 place-items-center rounded-full border-2 border-poster-ink text-xs ${markerClass}`}>
          {marker}
        </span>
        {title}
        <span className="text-poster-ink/45">({count})</span>
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  )
}

function None({ children }: { children: React.ReactNode }) {
  return <p className="text-sm font-semibold text-poster-ink/40">{children}</p>
}

/** Right panel: read-only view of what is known, still unknown, and assumed. */
export default function ContextPanel({
  discovery,
  canConfirm,
  onConfirm,
}: {
  discovery: DiscoverResult | null
  canConfirm: boolean
  onConfirm: (assumption: string) => void
}) {
  if (!discovery) {
    return (
      <Panel index="03" label="Known / Unknown / Assumed">
        <None>Waiting for the first read of your idea.</None>
      </Panel>
    )
  }

  const known = knownFacts(discovery)

  return (
    <Panel index="03" label="Known / Unknown / Assumed">
      <div className="space-y-5">
        <Group marker="●" markerClass="bg-poster-green" title="Known" count={known.length}>
          <ul className="space-y-2 text-sm">
            {known.map((f, i) => (
              <li key={i} className="leading-snug">
                <span className="font-extrabold">{f.label}:</span> <span className="font-semibold">{f.value}</span>
              </li>
            ))}
          </ul>
        </Group>

        <Group marker="○" markerClass="bg-white" title="Unknown" count={discovery.missingInformation.length}>
          {discovery.missingInformation.length === 0 ? (
            <None>Nothing missing.</None>
          ) : (
            <ul className="list-disc space-y-2 pl-5 text-sm font-semibold leading-snug">
              {discovery.missingInformation.map((gap) => (
                <li key={gap}>{gap}</li>
              ))}
            </ul>
          )}
        </Group>

        <Group marker="~" markerClass="bg-[#f2c94c]" title="Assumptions" count={discovery.assumptions.length}>
          {discovery.assumptions.length === 0 ? (
            <None>No assumptions — everything above came from you.</None>
          ) : (
            <ul className="space-y-3 text-sm">
              {discovery.assumptions.map((a) => (
                <li key={a} className="rounded-2xl border-2 border-[#f2c94c] bg-[#f2c94c]/15 px-3 py-2">
                  <p className="font-semibold leading-snug">{a}</p>
                  <button
                    type="button"
                    disabled={!canConfirm}
                    onClick={() => onConfirm(a)}
                    className="mt-2 text-xs font-extrabold uppercase tracking-wide underline decoration-poster-green decoration-2 underline-offset-4 hover:text-poster-green disabled:cursor-not-allowed disabled:text-poster-ink/35 disabled:no-underline"
                  >
                    Ask me to confirm
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Group>
      </div>
    </Panel>
  )
}
