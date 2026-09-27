'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { BrandOs } from 'brandstate'
import { loadProject, type Project } from '@/lib/projects'
import { postJson as post } from '@/lib/api/client'
import { loadWorkspace, type StrategyWorkspace } from '@/lib/strategy'
import { SECTIONS, blockingCount, loadBrandOs, readiness, saveBrandOs, toMarkdown, type CompiledBrandOs } from '@/lib/brand-os'
import { PosterRoom } from '@/components/landing/poster-section'
import WorkflowNav from '@/components/project/workflow-nav'
import HoverLetters from '@/components/hover-letters'
import { Arrow, EmptyState, ErrorCard, SPRING, Stamp, Swash, btnPrimary, btnSecondary, linkButton } from '@/components/strategy/ui'
import { cn } from '@/lib/utils'
import BrandOsDocument from './document'

interface ApiError {
  message: string
  detail?: string
}


function Elapsed() {
  const [s, setS] = useState(0)
  useEffect(() => {
    const t0 = Date.now()
    const id = window.setInterval(() => setS(Math.floor((Date.now() - t0) / 1000)), 1000)
    return () => window.clearInterval(id)
  }, [])
  return <span className="tabular-nums">{s}s</span>
}

/** Export: print to PDF, or take the document away as Markdown. */
function ExportMenu({ os, compiledAt, name }: { os: BrandOs; compiledAt: string; name: string }) {
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    if (!done) return
    const t = window.setTimeout(() => setDone(null), 1600)
    return () => window.clearTimeout(t)
  }, [done])

  const md = () => toMarkdown(os, compiledAt)
  const items = [
    {
      label: 'Save as PDF',
      hint: 'Opens the print dialog',
      run: () => {
        setOpen(false)
        window.setTimeout(() => window.print(), 50)
      },
    },
    {
      label: 'Copy as Markdown',
      hint: 'Paste into a doc or a message',
      run: async () => {
        try {
          await navigator.clipboard.writeText(md())
          setDone('✓ Copied')
        } catch {
          setDone('Clipboard blocked')
        }
        setOpen(false)
      },
    },
    {
      label: 'Download .md',
      hint: 'A file you can send',
      run: () => {
        const url = URL.createObjectURL(new Blob([md()], { type: 'text/markdown' }))
        const a = document.createElement('a')
        a.href = url
        a.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'brand'}-brand-os.md`
        a.click()
        URL.revokeObjectURL(url)
        setDone('✓ Downloaded')
        setOpen(false)
      },
    },
  ]

  return (
    <div ref={ref} className="relative print:hidden">
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={cn(btnPrimary, 'h-10')}>
        <span aria-hidden="true" className={cn('inline-block transition-transform duration-300', SPRING, open ? 'rotate-45' : 'group-hover:-translate-y-0.5 group-hover:translate-x-0.5')}>
          ↗
        </span>
        Export / Share
      </button>
      {done && <Stamp className="absolute -bottom-9 right-2 z-30">{done}</Stamp>}
      {open && (
        <ul
          role="menu"
          className="absolute right-0 top-12 z-30 w-64 overflow-hidden rounded-2xl border-2 border-poster-ink bg-white p-1.5 shadow-[6px_6px_0_0_#111] animate-in fade-in-0 slide-in-from-top-2 zoom-in-95 duration-200"
        >
          {items.map((it) => (
            <li key={it.label} role="none">
              <button
                type="button"
                role="menuitem"
                onClick={() => void it.run()}
                className="group/i flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-200 hover:bg-poster-green/20 focus-visible:bg-poster-green/20 focus-visible:outline-none"
              >
                <span>
                  <span className="block text-sm font-extrabold">{it.label}</span>
                  <span className="block text-xs font-semibold text-poster-ink/50">{it.hint}</span>
                </span>
                <span aria-hidden="true" className={cn('transition-transform duration-300 group-hover/i:translate-x-1', SPRING)}>
                  →
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Sticky section nav; the section currently being read is highlighted. */
function SectionNav() {
  const [active, setActive] = useState<string>('overview')
  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter((e): e is HTMLElement => !!e)
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActive(visible[0].target.id)
      },
      { rootMargin: '-25% 0px -60% 0px' },
    )
    els.forEach((e) => io.observe(e))
    return () => io.disconnect()
  }, [])
  const jump = (id: string) => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    document.getElementById(id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }
  return (
    <nav aria-label="Brand OS sections" className="flex w-max gap-2 print:hidden">
      {SECTIONS.map((s, i) => {
        const on = active === s.id
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => jump(s.id)}
            aria-current={on ? 'location' : undefined}
            className={cn(
              'group inline-flex items-center gap-2 whitespace-nowrap rounded-full border-2 py-1 pl-1 pr-3 text-xs font-extrabold uppercase tracking-wide',
              'transition-[transform,box-shadow,background-color,border-color] duration-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-poster-green/40',
              SPRING,
              on
                ? '-translate-y-0.5 border-poster-ink bg-white shadow-[3px_3px_0_0_#111]'
                : 'border-poster-ink/30 bg-poster-paper hover:-translate-y-0.5 hover:border-poster-ink hover:bg-white hover:shadow-[3px_3px_0_0_#5fb57a]',
            )}
          >
            <span className={cn('rounded-full px-2 py-0.5 group-hover:animate-wiggle motion-reduce:group-hover:animate-none', on ? 'bg-poster-green' : 'bg-poster-ink/10')}>
              {String(i).padStart(2, '0')}
            </span>
            {s.label}
          </button>
        )
      })}
    </nav>
  )
}

export default function BrandOsWorkspace({ id }: { id: string }) {
  const [project, setProject] = useState<Project | null>(null)
  const [ws, setWs] = useState<StrategyWorkspace | null>(null)
  const [doc, setDoc] = useState<CompiledBrandOs | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [compiling, setCompiling] = useState(false)
  const [error, setError] = useState<(ApiError & { retry: () => void }) | null>(null)

  useEffect(() => {
    setProject(loadProject(id))
    setWs(loadWorkspace(id))
    setDoc(loadBrandOs(id))
    setLoaded(true)
  }, [id])

  const compile = useCallback(
    async (draft: boolean) => {
      if (!ws) return
      setCompiling(true)
      setError(null)
      try {
        const res = await post<{ brandOS: BrandOs }>('/api/brand-os', { state: ws.state, ...(draft ? { allowUnvalidated: true } : {}) })
        setDoc(saveBrandOs({ projectId: id, brandOS: res.brandOS, compiledAt: new Date().toISOString(), stateUpdatedAt: ws.state.updatedAt, draft }))
        window.scrollTo({ top: 0 })
      } catch (e) {
        setError({ message: e instanceof Error ? e.message : 'Compiling failed.', detail: (e as { detail?: string }).detail, retry: () => void compile(draft) })
      } finally {
        setCompiling(false)
      }
    },
    [id, ws],
  )

  if (!loaded) return <main className="min-h-[100svh] bg-poster-paper" />

  if (!project) {
    return (
      <main className="relative isolate flex min-h-[100svh] items-center justify-center overflow-hidden bg-poster-paper p-6 text-poster-ink">
        <PosterRoom />
        <div className="relative z-10 max-w-md rounded-3xl border-2 border-poster-ink bg-white p-8 text-center">
          <h1 className="font-display text-3xl uppercase tracking-[-0.03em]">
            <HoverLetters text="Project not found" />
          </h1>
          <p className="mt-3 font-semibold text-poster-ink/60">Projects are saved in the browser they were created in. This one isn&apos;t in this browser.</p>
          <Link href="/new" className={cn(btnPrimary, 'mt-6 h-12 px-6 text-base')}>
            Start a new project <Arrow />
          </Link>
        </div>
      </main>
    )
  }

  const state = ws?.state ?? null
  const checklist = state ? readiness(state) : []
  const missing = checklist.filter((c) => !c.done)
  const blockers = state ? blockingCount(state) : 0
  const stale = !!doc && !!state && doc.stateUpdatedAt !== state.updatedAt
  const showDoc = !!doc && !compiling

  return (
    // A document page scrolls like a document, unlike the fixed-height workspaces.
    <main className="relative isolate min-h-[100svh] bg-poster-paper text-poster-ink antialiased print:bg-white">
      <div className="print:hidden">
        <PosterRoom />
      </div>
      <div className="print:hidden">
        <WorkflowNav projectId={id} current="brand-os" />
      </div>

      <div className="sticky top-0 z-20 border-b-2 border-poster-ink/10 bg-poster-paper/90 px-5 py-3 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 lg:flex-nowrap">
          <h1 className="shrink-0 font-display text-[1.9rem] uppercase leading-none tracking-[-0.04em]">
            <span className="relative inline-block">
              <HoverLetters text="Brand OS" />
              <Swash className="top-[0.78em] h-[0.45em]" />
            </span>
            <HoverLetters text="." className="text-poster-green" />
          </h1>
          {showDoc && (
            // One row: the nav scrolls sideways when space runs out, so Export never wraps below.
            <div className="order-last min-w-0 basis-full overflow-x-auto py-1 [scrollbar-width:none] lg:order-none lg:basis-auto lg:flex-1">
              <SectionNav />
            </div>
          )}
          {showDoc && (
            <div className="ml-auto shrink-0">
              <ExportMenu os={doc!.brandOS} compiledAt={doc!.compiledAt} name={doc!.brandOS.identity.name} />
            </div>
          )}
        </div>
      </div>

      <div className="relative z-10 mx-auto max-w-6xl px-5 py-10 print:max-w-none print:p-0">
        {!state?.selectedStrategy ? (
          <div className="rounded-3xl border-2 border-poster-ink bg-white/80 p-5">
            <EmptyState
              title="Strategy comes first"
              stamp="Locked"
              action={
                <Link href={`/project/${id}/strategy`} className={btnPrimary}>
                  Go to Strategy <Arrow />
                </Link>
              }
            >
              The Brand OS compiles the decisions you approved — there aren&apos;t any yet.
            </EmptyState>
          </div>
        ) : compiling ? (
          // One engine call builds the whole document: shown as one honest step.
          <div className="relative overflow-hidden rounded-[2rem] border-2 border-poster-ink bg-white px-8 py-12 text-center shadow-[8px_8px_0_0_#5fb57a] animate-in fade-in-0 zoom-in-95 duration-500">
            <span className="engine-ring" aria-hidden="true" />
            <p className="font-display text-3xl uppercase tracking-[-0.03em]">
              <HoverLetters text="Compiling your Brand OS" />
              <span className="animate-pulse">…</span>
            </p>
            <p className="mt-3 text-sm font-semibold text-poster-ink/55">
              Everything is copied from the decisions you approved; only the purpose, mission, vision and launch copy are written new.
            </p>
            <ul className="mt-8 flex flex-wrap justify-center gap-2">
              {SECTIONS.map((s, i) => (
                <li
                  key={s.id}
                  style={{ animationDelay: `${i * 140}ms` }}
                  className="animate-pulse rounded-full border-2 border-poster-ink/20 px-3 py-1 text-xs font-extrabold uppercase tracking-wide motion-reduce:animate-none"
                >
                  {s.label}
                </li>
              ))}
            </ul>
            <p className="mt-6 inline-flex rounded-full bg-poster-ink px-3 py-1 text-xs font-extrabold text-poster-paper">
              <Elapsed />
            </p>
          </div>
        ) : showDoc ? (
          <div className="space-y-6">
            {error && <ErrorCard message={error.message} detail={error.detail} onRetry={error.retry} onDismiss={() => setError(null)} />}
            {(stale || doc!.draft) && (
              <div className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-poster-ink bg-[#f2c94c] px-4 py-3 shadow-[4px_4px_0_0_#111] animate-in fade-in-0 slide-in-from-top-2 duration-300 print:hidden">
                <p className="text-sm font-extrabold">
                  {stale ? '⚠ Your brand has changed since this was compiled.' : '⚠ This is a draft: open critical or high findings were left in.'}
                </p>
                <button type="button" onClick={() => void compile(blockers > 0)} disabled={missing.length > 0} className={cn(btnSecondary, 'ml-auto h-9')}>
                  ↻ Recompile
                </button>
              </div>
            )}
            <BrandOsDocument os={doc!.brandOS} compiledAt={doc!.compiledAt} projectName={project.name} />
          </div>
        ) : (
          /* Readiness: what the engine needs before it will compile, each linked to its fix. */
          <div className="space-y-6">
            {error && <ErrorCard message={error.message} detail={error.detail} onRetry={error.retry} onDismiss={() => setError(null)} />}
            <div className="relative overflow-hidden rounded-[2rem] border-2 border-dashed border-poster-ink/25 px-6 py-10 animate-in fade-in-0 zoom-in-95 duration-500 md:px-12">
              <Stamp tone="white" className="absolute right-6 top-6">
                Final step
              </Stamp>
              <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-poster-ink/55">The deliverable</p>
              <h2 className="mt-3 font-display text-[clamp(2.2rem,5vw,4rem)] uppercase leading-[0.92] tracking-[-0.045em]">
                <HoverLetters text="Compile your" />{' '}
                <span className="relative inline-block">
                  <HoverLetters text="Brand OS" />
                  <Swash className="top-[0.7em] h-[0.5em]" />
                </span>
              </h2>
              <p className="mt-4 max-w-xl font-semibold text-poster-ink/60">
                Strategy, identity, visual direction, voice, a launch kit and the validation record — in one document you can share
                with a co-founder, an investor or a designer.
              </p>

              <ul className="mt-8 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {checklist.map((c, i) => (
                  <li key={c.label} style={{ animationDelay: `${i * 45}ms` }} className="animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300">
                    {c.done ? (
                      <span className="flex items-center gap-2 rounded-2xl border-2 border-poster-ink/15 bg-white px-4 py-3 text-sm font-bold">
                        <span aria-hidden="true" className="grid h-5 w-5 place-items-center rounded-full bg-poster-green text-[10px] ring-1 ring-poster-ink">
                          ✓
                        </span>
                        {c.label}
                      </span>
                    ) : (
                      <Link
                        href={`/project/${id}/${c.href}`}
                        className={cn(
                          'group flex items-center gap-2 rounded-2xl border-2 border-dashed border-[#e5484d]/60 bg-white px-4 py-3 text-sm font-bold',
                          'transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-solid hover:border-poster-ink hover:shadow-[3px_3px_0_0_#e5484d]',
                          SPRING,
                        )}
                      >
                        <span aria-hidden="true" className="grid h-5 w-5 place-items-center rounded-full border-2 border-[#e5484d] text-[10px] text-[#c4282d]">
                          ○
                        </span>
                        <span className="min-w-0 flex-1">
                          {c.label}
                          <span className="block text-xs font-semibold text-poster-ink/50">{c.hint}</span>
                        </span>
                        <Arrow />
                      </Link>
                    )}
                  </li>
                ))}
              </ul>

              <div className="mt-10 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={() => void compile(false)}
                  disabled={missing.length > 0 || blockers > 0}
                  className={cn(
                    'group inline-flex items-center gap-3 rounded-full border-2 border-poster-ink bg-poster-ink px-8 py-4 font-display text-xl uppercase tracking-[-0.02em] text-poster-paper',
                    'shadow-[8px_8px_0_0_#5fb57a] transition-[transform,box-shadow] duration-300 hover:-translate-x-1 hover:-translate-y-1 hover:shadow-[12px_12px_0_0_#5fb57a]',
                    'active:translate-x-2 active:translate-y-2 active:shadow-none disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-x-0 disabled:hover:translate-y-0',
                    'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-poster-green/40 motion-reduce:transition-none',
                    SPRING,
                  )}
                >
                  Compile Brand OS <Arrow />
                </button>
                {missing.length > 0 ? (
                  <p className="text-sm font-bold text-poster-ink/55">
                    {missing.length} step{missing.length === 1 ? '' : 's'} left — each one above links to where it&apos;s done.
                  </p>
                ) : blockers > 0 ? (
                  <div className="text-sm font-semibold">
                    <p className="font-bold text-[#c4282d]">
                      {blockers} critical or high stress finding{blockers === 1 ? ' is' : 's are'} still open.
                    </p>
                    <p className="text-poster-ink/60">
                      <Link href={`/project/${id}/stress-test`} className={linkButton}>
                        Resolve them
                      </Link>{' '}
                      or{' '}
                      <button type="button" onClick={() => void compile(true)} className={linkButton}>
                        compile a draft marked not-ready
                      </button>
                    </p>
                  </div>
                ) : (
                  <p className="text-sm font-bold text-poster-green">✓ Everything&apos;s in place.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <footer className="relative z-10 border-t-2 border-poster-ink bg-poster-paper px-6 py-4 print:hidden">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4">
          <Link href={`/project/${id}/consistency`} className={cn(btnSecondary, 'h-11')}>
            <span aria-hidden="true" className={cn('inline-block transition-transform duration-300 group-hover:-translate-x-1', SPRING)}>
              ←
            </span>
            Back to Consistency
          </Link>
          {showDoc && (
            <p className="ml-auto text-xs font-bold text-poster-ink/45">
              Compiled {new Date(doc!.compiledAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
          )}
        </div>
      </footer>
    </main>
  )
}
