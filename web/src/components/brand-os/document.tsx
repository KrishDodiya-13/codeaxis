'use client'

import { useEffect, useRef, useState } from 'react'
import type { BrandOs, StressTest } from 'brandstate'
import { FieldLabel } from '@/components/project/panel'
import HoverLetters from '@/components/hover-letters'
import { SPRING, Stamp, Swash } from '@/components/strategy/ui'
import { TEST_META } from '@/lib/stress'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------------------------ */
/* Small pieces                                                                         */

/** Rises in the first time it scrolls into view. Printing shows everything at once. */
function Reveal({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setShown(true)
          io.disconnect()
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn(
        'transition-[opacity,transform] duration-700 motion-reduce:transition-none print:!translate-y-0 print:!opacity-100',
        SPRING,
        shown ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** A piece of copy you can take away: click to copy, with a stamp to confirm. */
function CopyBlock({ label, text, big = false }: { label: string; text: string; big?: boolean }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = window.setTimeout(() => setCopied(false), 1400)
    return () => window.clearTimeout(t)
  }, [copied])
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
        } catch {
          // Clipboard blocked: the text is right there to select.
        }
      }}
      className={cn(
        'group/copy relative block w-full rounded-2xl border-2 border-poster-ink/15 bg-white px-5 py-4 text-left',
        'transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-poster-ink hover:shadow-[5px_5px_0_0_#5fb57a]',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-poster-green/40 motion-reduce:hover:translate-y-0 print:border-poster-ink/30 print:shadow-none',
        SPRING,
      )}
    >
      <span className="flex items-center justify-between gap-3">
        <FieldLabel>{label}</FieldLabel>
        <span className="text-[11px] font-extrabold uppercase tracking-wide text-poster-ink/35 opacity-0 transition-opacity duration-200 group-hover/copy:opacity-100 group-focus-visible/copy:opacity-100 print:hidden">
          Click to copy
        </span>
      </span>
      <span className={cn('mt-1.5 block whitespace-pre-line font-semibold leading-snug', big ? 'font-display text-2xl uppercase leading-[0.95] tracking-[-0.03em]' : 'text-base')}>
        {text}
      </span>
      {copied && <Stamp className="absolute -top-3 right-4">✓ Copied</Stamp>}
    </button>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="group/field border-t-2 border-poster-ink/10 pt-4 first:border-t-0 first:pt-0">
      <FieldLabel className="transition-colors duration-200 group-hover/field:text-poster-green">{label}</FieldLabel>
      <div className="mt-1.5 text-lg font-semibold leading-snug">{children}</div>
    </div>
  )
}

function Chips({ items, tone = 'plain' }: { items: string[]; tone?: 'plain' | 'avoid' | 'dark' }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((x, i) => (
        <li
          key={`${i}-${x}`}
          className={cn(
            'rounded-full border-2 px-3 py-1 text-sm font-bold transition-[transform,background-color] duration-300',
            SPRING,
            tone === 'plain' && 'border-poster-ink bg-white hover:-rotate-2 hover:bg-poster-green',
            tone === 'dark' && 'border-poster-ink bg-poster-ink text-poster-paper hover:-rotate-2',
            tone === 'avoid' && 'border-[#e5484d]/50 bg-[#e5484d]/5 text-poster-ink/70 line-through decoration-[#e5484d]',
          )}
        >
          {x}
        </li>
      ))}
    </ul>
  )
}

const HEX = /#(?:[0-9a-f]{3}){1,2}\b/i

function Swatches({ lines }: { lines: string[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {lines.map((line, i) => {
        const hex = line.match(HEX)?.[0]
        const name = hex ? line.split(hex)[0].replace(/[\s—\-–:·,(]+$/, '').trim() || hex : line
        return (
          <li
            key={`${i}-${line}`}
            className={cn(
              'group/sw overflow-hidden rounded-2xl border-2 border-poster-ink bg-white',
              'transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:rotate-[-1deg] hover:shadow-[5px_5px_0_0_#111] motion-reduce:hover:translate-y-0 motion-reduce:hover:rotate-0',
              SPRING,
            )}
          >
            <span className="block h-20 border-b-2 border-poster-ink transition-[height] duration-300 group-hover/sw:h-24 print:h-16" style={hex ? { backgroundColor: hex } : undefined} />
            <span className="block px-3 py-2">
              <span className="block text-sm font-extrabold leading-tight">{name}</span>
              {hex && <span className="font-mono text-[11px] font-bold text-poster-ink/55">{hex.toUpperCase()}</span>}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/** Counts up to the score once, when it comes into view. */
function Score({ value }: { value: number }) {
  const [n, setN] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const io = new IntersectionObserver(([e]) => {
      if (!e?.isIntersecting) return
      io.disconnect()
      if (reduce) return setN(value)
      const t0 = performance.now()
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / 900)
        setN(Math.round(value * (1 - (1 - p) ** 3)))
        if (p < 1) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    io.observe(el)
    return () => io.disconnect()
  }, [value])
  return (
    <span ref={ref} className="tabular-nums">
      {n}
    </span>
  )
}

/** A numbered poster section header, with the section's own id for the nav. */
function Section({ id, index, title, note, children }: { id: string; index: string; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-28 border-t-2 border-poster-ink pt-10 print:break-before-page print:border-t-0 print:pt-0">
      <Reveal>
        <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
          <span aria-hidden="true" className="font-display text-6xl leading-none text-poster-ink/10 print:text-poster-ink/20">
            {index}
          </span>
          <h2 id={`${id}-h`} className="font-display text-4xl uppercase leading-none tracking-[-0.04em]">
            <HoverLetters text={title} />
          </h2>
          {note && <p className="basis-full text-sm font-semibold italic text-poster-ink/55">{note}</p>}
        </div>
      </Reveal>
      <div className="mt-8">{children}</div>
    </section>
  )
}

const READINESS: Record<BrandOs['validation']['readiness']['label'], { text: string; tone: 'green' | 'white' | 'red' }> = {
  ready: { text: '✓ Ready to launch', tone: 'green' },
  'ready-with-caveats': { text: '~ Ready, with caveats', tone: 'white' },
  'not-ready': { text: '✗ Draft — not ready', tone: 'red' },
}

const FINDING_STATUS: Record<NonNullable<StressTest['status']> | 'open', { label: string; className: string }> = {
  open: { label: 'Open', className: 'bg-[#e5484d]/15 text-[#c4282d] border-[#e5484d]' },
  acknowledged: { label: 'Kept', className: 'bg-white border-poster-ink/30' },
  resolved: { label: 'Fixed', className: 'bg-poster-green border-poster-ink' },
}

/* ------------------------------------------------------------------------------------ */
/* The document                                                                         */

export default function BrandOsDocument({ os, compiledAt, projectName }: { os: BrandOs; compiledAt: string; projectName: string }) {
  const { strategy: s, identity: id, visual: v, voice: vo, launch: l, validation: val } = os
  const date = new Date(compiledAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
  const ready = READINESS[val.readiness.label]
  const fixed = val.stressTestFindings.filter((f) => f.status === 'resolved').length

  return (
    <article className="space-y-16 print:space-y-0">
      {/* ---------------- Cover / Overview ---------------- */}
      <section id="overview" aria-label="Overview" className="scroll-mt-28">
        <div className="relative overflow-hidden rounded-[2rem] border-2 border-poster-ink bg-poster-ink px-8 py-12 text-poster-paper shadow-[8px_8px_0_0_#5fb57a] animate-in fade-in-0 zoom-in-95 duration-700 print:shadow-none md:px-14 md:py-16">
          <span aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 animate-bob rounded-full bg-poster-green motion-reduce:animate-none print:hidden" />
          <span aria-hidden="true" className="pointer-events-none absolute bottom-10 right-24 h-14 w-14 animate-spin-slow rounded-[30%] border-2 border-poster-paper/30 motion-reduce:animate-none print:hidden" />
          <div className="relative">
            <p className="flex flex-wrap items-center gap-3 text-xs font-extrabold uppercase tracking-[0.2em] text-poster-paper/60">
              <span className="rounded-full bg-poster-green px-3 py-1 text-poster-ink">Brandos</span>
              Brand OS · {projectName}
            </p>
            <h1 className="mt-8 font-display text-[clamp(3rem,8vw,6.5rem)] uppercase leading-[0.86] tracking-[-0.05em]">
              <span className="relative inline-block">
                <HoverLetters text={id.name} />
                <Swash className="top-[0.72em] h-[0.4em] print:hidden" />
              </span>
            </h1>
            <p className="mt-6 max-w-2xl text-2xl font-semibold leading-snug">“{id.taglineDirection.selected}”</p>
            <p className="mt-6 text-sm font-bold text-poster-paper/55">Prepared by BRANDOS · {date}</p>
            <div className="mt-8">
              <Stamp tone={ready.tone} className={cn('px-5 py-2 text-sm', ready.tone === 'white' && 'text-poster-ink')}>
                {ready.text}
              </Stamp>
            </div>
          </div>
        </div>

        <Reveal className="mt-8">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="rounded-3xl border-2 border-poster-ink bg-white px-6 py-6">
              <FieldLabel>Brand in one line</FieldLabel>
              <p className="mt-2 text-2xl font-semibold leading-snug">{l.onelinePitch}</p>
            </div>
            <dl className="grid grid-cols-2 gap-3">
              {[
                ['Category', s.category],
                ['Archetype', id.archetype || '—'],
                ['Stress test', `${val.stressTestFindings.length} finding${val.stressTestFindings.length === 1 ? '' : 's'} · ${fixed} fixed`],
                ['Readiness', `${val.readiness.score}/100`],
              ].map(([k, value]) => (
                <div key={k} className="rounded-2xl border-2 border-poster-ink/15 bg-white px-4 py-3 transition-[border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-poster-ink">
                  <dt className="text-[11px] font-extrabold uppercase tracking-wide text-poster-ink/55">{k}</dt>
                  <dd className="mt-1 text-sm font-bold leading-snug">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Reveal>
      </section>

      {/* ---------------- Strategy ---------------- */}
      <Section id="strategy" index="01" title="Strategy">
        <div className="grid gap-8 lg:grid-cols-2">
          <Reveal className="space-y-5 rounded-3xl border-2 border-poster-ink/15 bg-white px-6 py-6">
            <Field label="Problem">{s.problem}</Field>
            <Field label="Target audience">{s.targetAudience}</Field>
            <Field label="Category">{s.category}</Field>
          </Reveal>
          <Reveal delay={120} className="space-y-5 rounded-3xl border-2 border-poster-ink/15 bg-white px-6 py-6">
            <Field label="Positioning">{s.positioning}</Field>
            <Field label="Value proposition">{s.valueProposition}</Field>
            <Field label="Differentiator">{s.differentiator}</Field>
          </Reveal>
        </div>
        <Reveal className="mt-8">
          <div className="grid gap-3 md:grid-cols-3">
            {[
              ['Purpose', s.purpose],
              ['Mission', s.mission],
              ['Vision', s.vision],
            ].map(([k, value], i) => (
              <div
                key={k}
                style={{ transitionDelay: `${i * 80}ms` }}
                className={cn(
                  'rounded-3xl border-2 border-poster-ink bg-poster-green/10 px-5 py-5 transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[5px_5px_0_0_#111]',
                  SPRING,
                )}
              >
                <p className="font-display text-xl uppercase tracking-[-0.02em]">{k}</p>
                <p className="mt-2 font-semibold leading-snug">{value}</p>
              </div>
            ))}
          </div>
        </Reveal>
        <Reveal className="mt-6">
          <blockquote className="rounded-3xl border-l-8 border-poster-green bg-white px-6 py-5 text-lg font-semibold leading-relaxed">
            {s.positioningStatement}
          </blockquote>
        </Reveal>
      </Section>

      {/* ---------------- Identity ---------------- */}
      <Section id="identity" index="02" title="Identity">
        <div className="grid gap-8 lg:grid-cols-2">
          <Reveal className="space-y-6">
            <div>
              <FieldLabel>Personality</FieldLabel>
              <div className="mt-2">
                <Chips items={id.personality} tone="dark" />
              </div>
            </div>
            <div>
              <FieldLabel>Principles</FieldLabel>
              <ol className="mt-2 space-y-2">
                {id.principles.map((p, i) => (
                  <li key={p} className="group/p flex gap-3 rounded-2xl border-2 border-poster-ink/10 bg-white px-4 py-3 transition-[border-color] duration-300 hover:border-poster-ink">
                    <span className="font-display text-2xl leading-none text-poster-ink/20 transition-colors group-hover/p:text-poster-green">{String(i + 1).padStart(2, '0')}</span>
                    <span className="font-semibold leading-snug">{p}</span>
                  </li>
                ))}
              </ol>
            </div>
          </Reveal>
          <Reveal delay={120} className="space-y-6">
            <div className="rounded-3xl border-2 border-poster-ink bg-white px-6 py-6">
              <FieldLabel>Name</FieldLabel>
              <p className="mt-2 font-display text-4xl uppercase leading-none tracking-[-0.04em]">
                <HoverLetters text={id.name} />
              </p>
              <p className="mt-3 font-semibold leading-snug text-poster-ink/70">{id.nameRationale}</p>
              {id.namingDirection.territories.length > 0 && (
                <p className="mt-3 text-sm font-bold text-poster-ink/50">Naming territories: {id.namingDirection.territories.join(' · ')}</p>
              )}
            </div>
            <CopyBlock label="Tagline" text={`“${id.taglineDirection.selected}”`} big />
            {id.taglineDirection.alternatives.length > 0 && (
              <p className="text-sm font-semibold text-poster-ink/50">Considered: {id.taglineDirection.alternatives.map((t) => `“${t}”`).join(' · ')}</p>
            )}
          </Reveal>
        </div>
      </Section>

      {/* ---------------- Visual ---------------- */}
      <Section id="visual" index="03" title="Visual direction" note="A strategic visual brief. Final execution belongs to a designer.">
        <Reveal>
          <Swatches lines={v.colorPalette.length ? v.colorPalette : v.colorDirection} />
        </Reveal>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {[
            ['Aa', 'Typography', v.typographySystem || v.typography],
            ['◐', 'Imagery', v.imagery],
            ['◆', 'Shape language', v.shapeLanguage],
            ['▦', 'Composition', v.composition],
            ['✦', 'Logo direction', v.logoDirection],
          ].map(([glyph, k, value], i) => (
            <Reveal key={k} delay={i * 70}>
              <div className="group/v flex h-full gap-4 rounded-3xl border-2 border-poster-ink/15 bg-white px-5 py-5 transition-[border-color,box-shadow] duration-300 hover:border-poster-ink hover:shadow-[4px_4px_0_0_#5fb57a]">
                <span
                  aria-hidden="true"
                  className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-xl border-2 border-poster-ink bg-poster-green/15 font-display text-lg transition-transform duration-300 group-hover/v:rotate-12', SPRING)}
                >
                  {glyph}
                </span>
                <div>
                  <FieldLabel>{k}</FieldLabel>
                  <p className="mt-1 font-semibold leading-snug">{value}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
        {v.avoid.length > 0 && (
          <Reveal className="mt-6">
            <FieldLabel>Avoid</FieldLabel>
            <div className="mt-2">
              <Chips items={v.avoid} tone="avoid" />
            </div>
          </Reveal>
        )}
      </Section>

      {/* ---------------- Voice ---------------- */}
      <Section id="voice" index="04" title="Voice">
        <Reveal>
          <FieldLabel>Tone</FieldLabel>
          <div className="mt-2">
            <Chips items={vo.tone} />
          </div>
        </Reveal>
        <Reveal className="mt-8">
          <div className="space-y-2">
            <div className="rounded-3xl border-2 border-poster-ink bg-poster-ink px-6 py-5 text-poster-paper shadow-[5px_5px_0_0_#5fb57a] print:shadow-none">
              <p className="text-[11px] font-extrabold uppercase tracking-widest text-poster-green">Primary message</p>
              <p className="mt-1 text-2xl font-semibold leading-snug">{vo.messagingHierarchy.primaryMessage}</p>
            </div>
            {vo.messagingHierarchy.supportingMessages.map((m) => (
              <div key={m} className="relative ml-8 rounded-2xl border-2 border-poster-ink/15 bg-white px-5 py-3 font-semibold transition-[transform,border-color] duration-300 hover:translate-x-1 hover:border-poster-ink">
                <span aria-hidden="true" className="absolute -left-6 top-1/2 h-0.5 w-5 bg-poster-ink/25" />
                {m}
              </div>
            ))}
          </div>
        </Reveal>
        {vo.toneGuidelines.length > 0 && (
          <Reveal className="mt-8">
            <FieldLabel>Tone guidelines</FieldLabel>
            <ul className="mt-2 grid gap-2 md:grid-cols-2">
              {vo.toneGuidelines.map((g) => (
                <li key={g} className="flex gap-2 rounded-2xl bg-white px-4 py-3 font-semibold leading-snug">
                  <span aria-hidden="true" className="font-extrabold text-poster-green">→</span>
                  {g}
                </li>
              ))}
            </ul>
          </Reveal>
        )}
        <Reveal className="mt-8">
          <FieldLabel>Sample copy</FieldLabel>
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            <CopyBlock label="Headline" text={vo.sampleCopy.headline} big />
            <CopyBlock label="Boilerplate" text={vo.sampleCopy.boilerplate} />
          </div>
        </Reveal>
      </Section>

      {/* ---------------- Launch ---------------- */}
      <Section id="launch" index="05" title="Launch kit">
        <Reveal>
          <div className="grid gap-3 md:grid-cols-2">
            <CopyBlock label="Landing page headline" text={l.landingHeadline} big />
            <CopyBlock label="One-line pitch" text={l.onelinePitch} />
          </div>
        </Reveal>
        <Reveal className="mt-3">
          <CopyBlock label="Launch message" text={l.launchMessage} />
        </Reveal>
        <Reveal className="mt-8">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <div>
              <FieldLabel>Go-to-market</FieldLabel>
              <p className="mt-2 font-semibold leading-snug">{l.goToMarketSummary}</p>
              <div className="mt-4">
                <FieldLabel>Channels</FieldLabel>
                <div className="mt-2">
                  <Chips items={l.keyChannels} />
                </div>
              </div>
            </div>
            <div>
              <FieldLabel>Rollout</FieldLabel>
              {/* A timeline: each milestone hangs off one line, and its dot fills on hover. */}
              <ol className="relative mt-3 space-y-4 border-l-2 border-poster-ink/20 pl-6">
                {l.rolloutSequence.map((m) => (
                  <li key={m.milestone} className="group/m relative">
                    <span aria-hidden="true" className="absolute -left-[33px] top-1 h-4 w-4 rounded-full border-2 border-poster-ink bg-white transition-colors duration-300 group-hover/m:bg-poster-green" />
                    <p className="text-xs font-extrabold uppercase tracking-wide text-poster-ink/50">{m.timing}</p>
                    <p className="font-extrabold">{m.milestone}</p>
                    <p className="text-sm font-semibold leading-snug text-poster-ink/70">{m.detail}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </Reveal>
      </Section>

      {/* ---------------- Validation ---------------- */}
      <Section id="validation" index="06" title="Validation">
        <Reveal>
          <div className="grid gap-4 md:grid-cols-[auto_minmax(0,1fr)]">
            <div className="grid place-items-center rounded-3xl border-2 border-poster-ink bg-white px-8 py-6 text-center">
              <p className="font-display text-6xl leading-none">
                <Score value={val.readiness.score} />
                <span className="text-2xl text-poster-ink/40">/100</span>
              </p>
              <Stamp tone={ready.tone} className="mt-3">
                {ready.text}
              </Stamp>
            </div>
            <ul className="grid gap-2 sm:grid-cols-2">
              {val.readiness.checklist.map((c) => (
                <li key={c.item} title={c.detail} className="flex gap-2 rounded-2xl border-2 border-poster-ink/10 bg-white px-4 py-3 text-sm font-semibold transition-[border-color] duration-300 hover:border-poster-ink">
                  <span aria-hidden="true" className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-extrabold', c.passed ? 'bg-poster-green ring-1 ring-poster-ink' : 'bg-[#e5484d] text-white')}>
                    {c.passed ? '✓' : '✗'}
                  </span>
                  <span>
                    <span className="font-extrabold">{c.item}</span>
                    <span className="block text-xs text-poster-ink/55">{c.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>

        <Reveal className="mt-10">
          <FieldLabel>Stress test</FieldLabel>
          {val.stressTestFindings.length === 0 ? (
            <p className="mt-2 font-semibold">No findings — every test passed.</p>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-3xl border-2 border-poster-ink bg-white">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b-2 border-poster-ink text-[11px] font-extrabold uppercase tracking-wide">
                    <th className="px-4 py-3">Test</th>
                    <th className="px-4 py-3">Severity</th>
                    <th className="px-4 py-3">Issue</th>
                    <th className="px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {val.stressTestFindings.map((f, i) => {
                    const st = FINDING_STATUS[f.status ?? 'open']
                    return (
                      <tr key={i} className="border-b border-poster-ink/10 align-top transition-colors duration-200 last:border-0 hover:bg-poster-green/5">
                        <td className="px-4 py-3 font-extrabold whitespace-nowrap">
                          {TEST_META[f.type].glyph} {TEST_META[f.type].label}
                        </td>
                        <td className="px-4 py-3 font-bold capitalize">{f.severity}</td>
                        <td className="px-4 py-3 font-semibold leading-snug">{f.issue}</td>
                        <td className="px-4 py-3">
                          <span className={cn('rounded-full border-2 px-2.5 py-0.5 text-[11px] font-extrabold uppercase', st.className)}>{st.label}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Reveal>

        <Reveal className="mt-8">
          <FieldLabel>Consistency</FieldLabel>
          <p className="mt-2 font-semibold">
            {val.consistencyFindings.length === 0
              ? '✓ Every part of the brand agrees with the rest.'
              : `${val.consistencyFindings.filter((f) => (f.status ?? 'open') === 'open').length} open of ${val.consistencyFindings.length} conflict${val.consistencyFindings.length === 1 ? '' : 's'} found between parts of the brand.`}
          </p>
        </Reveal>

        {(val.remainingRisks.length > 0 || val.recommendations.length > 0) && (
          <Reveal className="mt-8">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-3xl border-2 border-[#d4a72c] bg-[#f2c94c]/15 px-5 py-5">
                <p className="text-xs font-extrabold uppercase tracking-wide">⚠ Remaining risks</p>
                <ul className="mt-3 space-y-2">
                  {(val.remainingRisks.length ? val.remainingRisks : ['None recorded.']).map((r) => (
                    <li key={r} className="text-sm font-semibold leading-snug">{r}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-3xl border-2 border-poster-green bg-poster-green/10 px-5 py-5">
                <p className="text-xs font-extrabold uppercase tracking-wide">→ Recommendations</p>
                <ul className="mt-3 space-y-2">
                  {(val.recommendations.length ? val.recommendations : ['None recorded.']).map((r) => (
                    <li key={r} className="text-sm font-semibold leading-snug">{r}</li>
                  ))}
                </ul>
              </div>
            </div>
          </Reveal>
        )}
      </Section>
    </article>
  )
}
