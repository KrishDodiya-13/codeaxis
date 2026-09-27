import type { BrandState, Confidence } from 'brandstate'
import { STAGE_LABELS, selectedOption, type StrategyWorkspace, type TabKey } from '@/lib/strategy'
import { FieldLabel, Panel } from '@/components/project/panel'
import { cn } from '@/lib/utils'
import { ConfidenceTag, DotList } from './ui'

interface Reasoning {
  summary: string
  points: string[]
  sources: string[]
  confidence?: Confidence
  flags: string[]
}

/** What the AI based the current tab's recommendation on. Only what the state actually records. */
function reasoningFor(tab: TabKey, state: BrandState | null, ws: StrategyWorkspace | null): Reasoning {
  const option = state ? selectedOption(state) : undefined
  const staleFlags = (ws?.stale ?? []).map((s) => `${STAGE_LABELS[s]} was built on a decision you've since changed.`)

  if (!state) {
    return {
      summary: 'Nothing generated yet. Positioning is the first recommendation, built from your discovery state.',
      points: [],
      sources: ['Discovery state'],
      flags: [],
    }
  }

  const p = state.positioning
  switch (tab) {
    case 'position': {
      if (!p.category) return { summary: 'Positioning has not been generated yet.', points: [], sources: ['Discovery state'], flags: [] }
      const open = state.discovery.openQuestions.length
      return {
        summary: `Positioned in “${p.category}”.`,
        points: p.rationale,
        sources: ['Discovery · problem', 'Discovery · target audience', 'Discovery · user need'],
        ...(p.confidence ? { confidence: p.confidence } : {}),
        flags: [
          ...(p.assumptions.length ? [`Rests on ${p.assumptions.length} assumption${p.assumptions.length === 1 ? '' : 's'} you didn't state — review them on this tab.`] : []),
          ...(open ? [`Discovery left ${open} question${open === 1 ? '' : 's'} open; positioning assumed answers.`] : []),
          ...staleFlags,
        ],
      }
    }
    case 'battle':
      return option
        ? {
            summary: `You chose “${option.name}”.`,
            points: option.rationale,
            sources: ['Discovery state', 'Positioning', `Your choice · ${option.name}`],
            flags: [...option.risks.map((r) => `Risk: ${r}`), ...staleFlags],
          }
        : {
            summary: state.strategyOptions.length
              ? 'Three directions built on deliberately different archetypes. They are not ranked — the choice is yours.'
              : 'Directions have not been generated yet.',
            points: [],
            sources: ['Discovery state', 'Positioning'],
            flags: staleFlags,
          }
    case 'shape':
      return {
        summary: state.personality.traits.length
          ? `Personality built on “${option?.name ?? 'the chosen direction'}”.`
          : 'Shape has not been generated yet.',
        points: state.personality.rationale,
        sources: ['Positioning', `Chosen direction${option ? ` · ${option.name}` : ''}`, 'Personality → naming, voice'],
        flags: staleFlags,
      }
    case 'visual':
      return {
        summary: state.visualDirection.mood ? `Mood: ${state.visualDirection.mood}` : 'Visual direction has not been generated yet.',
        points: state.visualDirection.rationale,
        sources: ['Positioning', `Chosen direction${option ? ` · ${option.name}` : ''}`, 'Personality traits'],
        flags: staleFlags,
      }
    case 'dna': {
      const dna = ws?.dna
      const undecided = dna?.provenance.undecided ?? []
      return {
        summary: undecided.length ? `${undecided.length} decision${undecided.length === 1 ? '' : 's'} still open.` : 'Every strategy decision is made.',
        points: undecided.map((f) => `Open: ${f}`),
        sources: ['Every section of the brand state — nothing on the graph is generated for display.'],
        ...(dna?.provenance.confidence ? { confidence: dna.provenance.confidence } : {}),
        flags: [
          ...(dna?.provenance.positioningStale ? ['Positioning was derived from an older version of discovery.'] : []),
          ...staleFlags,
        ],
      }
    }
  }
}

/** Right panel: why the AI recommended what the active tab shows, and what it used. */
export default function ReasoningPanel({ tab, ws }: { tab: TabKey; ws: StrategyWorkspace | null }) {
  const r = reasoningFor(tab, ws?.state ?? null, ws)
  const history = [...(ws?.history ?? [])].reverse().slice(0, 8)

  return (
    <Panel index="AI" label="AI reasoning" className="flex-1 lg:min-h-0 lg:min-w-[300px]">
      <div key={tab} className="space-y-5 animate-in fade-in-0 slide-in-from-right-2 duration-300">
        <div>
          <FieldLabel>Current recommendation</FieldLabel>
          <p className="mt-2 text-lg font-semibold leading-snug">{r.summary}</p>
          {r.points.length > 0 && (
            <div className="mt-3">
              <DotList items={r.points} />
            </div>
          )}
        </div>

        <div className="border-t-2 border-poster-ink/10 pt-4">
          <FieldLabel>Sources used</FieldLabel>
          <ul className="mt-2 space-y-1 text-sm font-semibold">
            {r.sources.map((s) => (
              <li key={s}>• {s}</li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t-2 border-poster-ink/10 pt-4">
          <FieldLabel>Confidence</FieldLabel>
          {r.confidence ? (
            <ConfidenceTag value={r.confidence} />
          ) : (
            <span className="text-xs font-semibold text-poster-ink/50">Not self-assessed by this stage</span>
          )}
        </div>

        {r.flags.length > 0 && (
          <div className="border-t-2 border-poster-ink/10 pt-4">
            <FieldLabel>Flags</FieldLabel>
            <ul className="mt-2 space-y-2">
              {r.flags.map((f) => (
                <li key={f} className="rounded-2xl border-2 border-[#f2c94c] bg-[#f2c94c]/15 px-3 py-2 text-sm font-semibold leading-snug">
                  ⚠ {f}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="border-t-2 border-poster-ink/10 pt-4">
          <FieldLabel>History</FieldLabel>
          {history.length === 0 ? (
            <p className="mt-2 text-sm font-semibold text-poster-ink/40">No decisions yet.</p>
          ) : (
            <ol className="mt-2 space-y-1.5 text-sm font-semibold">
              {history.map((h, i) => (
                <li
                  key={`${h.at}-${i}`}
                  className={cn('flex gap-2', i === 0 && 'animate-in fade-in-0 slide-in-from-left-2 duration-500', i > 0 && 'text-poster-ink/60')}
                >
                  <span aria-hidden="true">→</span>
                  <span>{h.text}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </Panel>
  )
}
