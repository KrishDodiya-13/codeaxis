'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DiscoverResultSchema,
  isDiscoveryComplete,
  knownFacts,
  type DiscoverRequest,
  type DiscoverResult,
} from '@/lib/discovery'
import { ideaForEngine, loadProject, newId, saveProject, type Message, type Project, type Round } from '@/lib/projects'
import { PosterRoom } from '@/components/landing/poster-section'
import WorkflowNav from '@/components/project/workflow-nav'
import Interview from './interview'
import UnderstandingPanel from './understanding-panel'
import ContextPanel from './context-panel'

type Thinking = 'idea' | 'answers'

const msg = (role: Message['role'], text: string, why?: string): Message => ({ id: newId(), role, text, why })

/** Turns a discovery result into the next batch of questions. */
function roundFrom(d: DiscoverResult): Round | null {
  if (isDiscoveryComplete(d)) return null
  // The engine pairs questions with gaps by index, roughly. Fall back to asking
  // about a gap directly when it wrote no question for it.
  const questions = d.followUpQuestions.length
    ? d.followUpQuestions
    : d.missingInformation.map((gap) => `Can you tell me more about this: ${gap}`)
  const gaps = questions.map((_, i) => d.missingInformation[i])
  return { questions, gaps, index: 0, answers: {} }
}

function questionMessage(round: Round): Message | null {
  const q = round.questions[round.index]
  return q ? msg('brandos', q, round.gaps[round.index] ? `Closes the gap: ${round.gaps[round.index]}` : undefined) : null
}

export default function DiscoveryWorkspace({ id }: { id: string }) {
  const [project, setProject] = useState<Project | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [thinking, setThinking] = useState<Thinking | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Async calls read the latest project from here, not from a stale closure.
  const projectRef = useRef<Project | null>(null)
  const lastCall = useRef<{ request: DiscoverRequest; kind: Thinking } | null>(null)
  const started = useRef(false)

  const commit = useCallback((next: Project) => {
    const saved = saveProject(next)
    projectRef.current = saved
    setProject(saved)
    return saved
  }, [])

  useEffect(() => {
    const p = loadProject(id)
    projectRef.current = p
    setProject(p)
    setLoaded(true)
  }, [id])

  const applyResult = useCallback(
    (d: DiscoverResult, kind: Thinking) => {
      const p = projectRef.current
      if (!p) return
      const messages = [...p.messages]
      const round = roundFrom(d)
      if (!round) {
        messages.push(msg('brandos', 'I have enough to build your discovery state. Review it, then continue to Strategy.'))
      } else {
        if (kind === 'answers') {
          messages.push(
            msg('note', `Understanding updated · ${d.missingInformation.length} gap${d.missingInformation.length === 1 ? '' : 's'} left`)
          )
        }
        const first = questionMessage(round)
        if (first) messages.push(first)
      }
      commit({ ...p, discovery: d, round, messages })
    },
    [commit]
  )

  const call = useCallback(
    async (request: DiscoverRequest, kind: Thinking) => {
      lastCall.current = { request, kind }
      setThinking(kind)
      setError(null)
      try {
        const res = await fetch('/api/discover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
        })
        const data: unknown = await res.json().catch(() => null)
        if (!res.ok) {
          const message =
            data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
              ? data.error
              : 'Discovery failed.'
          throw new Error(message)
        }
        const parsed = DiscoverResultSchema.safeParse(data)
        if (!parsed.success) throw new Error('The response was not a valid discovery state.')
        applyResult(parsed.data, kind)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Discovery failed.')
      } finally {
        setThinking(null)
      }
    },
    [applyResult]
  )

  // First visit: read the idea once. Also resumes a first read that failed last time.
  useEffect(() => {
    const p = projectRef.current
    if (!loaded || !p || p.discovery || started.current) return
    started.current = true
    const next = p.messages.length ? p : commit({ ...p, messages: [msg('user', p.idea)] })
    void call({ idea: ideaForEngine(next) }, 'idea')
  }, [loaded, call, commit])

  const submitAnswers = (answers: Record<string, string>) => {
    const p = projectRef.current
    if (!p?.discovery) return
    void call({ idea: ideaForEngine(p), discovery: p.discovery, answers }, 'answers')
  }

  /** Moves the round on by one question, then submits if the round is finished. */
  const advance = (p: Project, messages: Message[], answers: Record<string, string>) => {
    const round = p.round!
    const nextRound: Round = { ...round, index: round.index + 1, answers }
    const next = questionMessage(nextRound)
    if (next) {
      commit({ ...p, round: nextRound, messages: [...messages, next] })
      return
    }
    if (Object.keys(answers).length === 0) {
      // Everything skipped: nothing to send, so go round again.
      const again: Round = { ...round, index: 0, answers: {} }
      const first = questionMessage(again)
      commit({
        ...p,
        round: again,
        messages: [
          ...messages,
          msg('brandos', 'You skipped every question in this round. Answer any you can, or continue with what we have.'),
          ...(first ? [first] : []),
        ],
      })
      return
    }
    commit({ ...p, round: nextRound, messages })
    submitAnswers(answers)
  }

  const onAnswer = (text: string) => {
    const p = projectRef.current
    const round = p?.round
    const q = round?.questions[round.index]
    if (!p || !round || !q) return
    advance(p, [...p.messages, msg('user', text)], { ...round.answers, [q]: text })
  }

  const onSkip = () => {
    const p = projectRef.current
    if (!p?.round) return
    advance(p, [...p.messages, msg('note', 'Skipped')], p.round.answers)
  }

  const onUpdateNow = () => {
    const p = projectRef.current
    if (!p?.round) return
    const answers = p.round.answers
    const count = Object.keys(answers).length
    if (count === 0) return
    commit({
      ...p,
      round: { ...p.round, index: p.round.questions.length },
      messages: [...p.messages, msg('note', `Sending ${count} answer${count === 1 ? '' : 's'} now`)],
    })
    submitAnswers(answers)
  }

  /** "Ask me to confirm": puts the assumption in front of the user as the next question. */
  const onConfirm = (assumption: string) => {
    const p = projectRef.current
    if (!p?.discovery) return
    const question = `Is this right? "${assumption}"`
    const base: Round = p.round && p.round.index < p.round.questions.length ? p.round : { questions: [], gaps: [], index: 0, answers: p.round?.answers ?? {} }
    const questions = [...base.questions]
    const gaps = [...base.gaps]
    questions.splice(base.index, 0, question)
    gaps.splice(base.index, 0, undefined)
    const round: Round = { ...base, questions, gaps }
    commit({
      ...p,
      round,
      messages: [...p.messages, msg('brandos', question, 'This was inferred, not something you said. Confirm it or correct it.')],
    })
  }

  const onRetry = () => {
    if (lastCall.current) void call(lastCall.current.request, lastCall.current.kind)
  }

  if (!loaded) {
    return <main className="min-h-[100svh] bg-poster-paper" />
  }

  if (!project) {
    return (
      <main className="relative isolate flex min-h-[100svh] items-center justify-center overflow-hidden bg-poster-paper p-6 text-poster-ink">
        <PosterRoom />
        <div className="relative z-10 max-w-md rounded-3xl border-2 border-poster-ink bg-white p-8 text-center">
          <h1 className="font-display text-3xl uppercase tracking-[-0.03em]">Project not found</h1>
          <p className="mt-3 font-semibold text-poster-ink/60">
            Projects are saved in the browser they were created in. This one isn&apos;t in this browser.
          </p>
          <Link
            href="/new"
            className="mt-6 inline-flex h-12 items-center rounded-full border-2 border-poster-ink bg-poster-green px-6 font-extrabold hover:bg-poster-ink hover:text-poster-paper"
          >
            Start a new project →
          </Link>
        </div>
      </main>
    )
  }

  const d = project.discovery
  const round = project.round
  const canAnswer = !thinking && !error && !!round && round.index < round.questions.length
  const answered = round ? Object.keys(round.answers).length : 0
  const questionsLeft = round ? Math.max(0, round.questions.length - round.index) : 0
  const complete = !!d && isDiscoveryComplete(d)
  const status = thinking ? 'Working…' : 'Saved in this browser'

  return (
    <main className="relative isolate flex min-h-[100svh] flex-col overflow-hidden bg-poster-paper text-poster-ink antialiased lg:h-[100svh]">
      <PosterRoom />
      <WorkflowNav projectId={project.id} current="discover" projectName={project.name} status={status} />

      <div className="relative z-10 grid flex-1 gap-5 p-5 lg:min-h-0 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,0.85fr)]">
        <Interview
          messages={project.messages}
          thinking={thinking}
          error={error}
          onRetry={onRetry}
          canAnswer={canAnswer}
          answeredThisRound={answered}
          questionsLeft={questionsLeft}
          onAnswer={onAnswer}
          onSkip={onSkip}
          onUpdateNow={onUpdateNow}
        />
        <UnderstandingPanel idea={project.idea} discovery={d} gathering={thinking === 'idea'} />
        <ContextPanel discovery={d} canConfirm={!thinking} onConfirm={onConfirm} />
      </div>

      <footer className="relative z-10 flex flex-wrap items-center gap-4 border-t-2 border-poster-ink bg-poster-paper px-6 py-4">
        <p className="text-sm font-extrabold">
          {!d
            ? 'Discovery starts with a first read of your idea.'
            : complete
              ? `✓ Discovery complete — ${knownFacts(d).length} facts found, ${d.assumptions.length} assumption${d.assumptions.length === 1 ? '' : 's'} flagged`
              : `${d.missingInformation.length} gap${d.missingInformation.length === 1 ? '' : 's'} left · ${d.assumptions.length} assumption${d.assumptions.length === 1 ? '' : 's'} flagged`}
        </p>
        {d && !thinking && (
          <Link
            href={`/project/${project.id}/strategy`}
            className={
              complete
                ? 'ml-auto inline-flex h-11 items-center rounded-full border-2 border-poster-ink bg-poster-green px-6 font-extrabold hover:bg-poster-ink hover:text-poster-paper focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-poster-green/40'
                : 'ml-auto inline-flex h-11 items-center rounded-full border-2 border-poster-ink bg-white px-5 text-sm font-extrabold hover:text-poster-green focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-poster-green/40'
            }
          >
            {complete ? 'Go to Strategy →' : 'Continue with what we have →'}
          </Link>
        )}
      </footer>
    </main>
  )
}
