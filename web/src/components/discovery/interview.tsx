'use client'

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { Message } from '@/lib/projects'
import { Panel } from '@/components/project/panel'
import { Arrow, ErrorCard, SPRING, btnPrimary, btnSecondary } from '@/components/strategy/ui'
import { cn } from '@/lib/utils'

function Bubble({ message }: { message: Message }) {
  if (message.role === 'note') {
    return (
      <p className="flex items-center gap-3 text-center text-xs font-bold uppercase tracking-wide text-poster-ink/45 animate-in fade-in-0 zoom-in-95 duration-300">
        <span aria-hidden="true" className="h-px flex-1 bg-poster-ink/15" />
        {message.text}
        <span aria-hidden="true" className="h-px flex-1 bg-poster-ink/15" />
      </p>
    )
  }
  if (message.role === 'user') {
    return (
      <div
        className={cn(
          'ml-auto max-w-[85%] rounded-2xl rounded-br-md border-2 border-poster-ink bg-poster-green px-4 py-3',
          'animate-in fade-in-0 slide-in-from-right-4 duration-300',
          'transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_#111] motion-reduce:hover:translate-y-0',
          SPRING,
        )}
      >
        <p className="whitespace-pre-wrap text-sm font-semibold">{message.text}</p>
      </div>
    )
  }
  return (
    <div
      className={cn(
        'max-w-[92%] rounded-2xl rounded-bl-md border-2 border-poster-ink bg-white px-4 py-3',
        'animate-in fade-in-0 slide-in-from-left-4 duration-300',
        'transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_#5fb57a] motion-reduce:hover:translate-y-0',
        SPRING,
      )}
    >
      <p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-widest">
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-poster-green ring-1 ring-poster-ink" />
        Brandos
      </p>
      <p className="mt-2 whitespace-pre-wrap font-semibold leading-snug">{message.text}</p>
      {message.why && (
        <p className="mt-2 rounded-xl bg-poster-green/10 px-3 py-2 text-xs font-semibold text-poster-ink/65">
          <span className="font-extrabold uppercase tracking-wide">Why this matters · </span>
          {message.why}
        </p>
      )}
    </div>
  )
}

/** Seconds since the model call started, so a slow answer reads as working, not stuck. */
function Elapsed() {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const started = Date.now()
    const id = window.setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => window.clearInterval(id)
  }, [])
  return <span className="tabular-nums text-xs font-bold text-poster-ink/45">{seconds}s</span>
}

/** BRANDOS is thinking: typing dots, the real elapsed time, and the sweep bar from Strategy. */
function Thinking({ kind }: { kind: 'idea' | 'answers' }) {
  return (
    <div className="relative max-w-[92%] overflow-hidden rounded-2xl rounded-bl-md border-2 border-poster-ink bg-white px-4 py-3 shadow-[4px_4px_0_0_#5fb57a] animate-in fade-in-0 slide-in-from-left-4 duration-300">
      <p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-widest">
        <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-poster-green ring-1 ring-poster-ink motion-reduce:animate-none" />
        Brandos
        <span className="ml-auto">
          <Elapsed />
        </span>
      </p>
      <p className="mt-2 flex items-center gap-2 font-semibold text-poster-ink/70">
        {kind === 'idea' ? 'Understanding your idea' : 'Analysing your answers'}
        <span aria-hidden="true" className="inline-flex gap-1">
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              style={{ animationDelay: `${delay}ms` }}
              className="h-1.5 w-1.5 animate-bounce rounded-full bg-poster-ink motion-reduce:animate-none"
            />
          ))}
        </span>
      </p>
      <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1 overflow-hidden bg-poster-green/15">
        <span className="block h-full w-1/3 animate-sweep rounded-full bg-poster-green motion-reduce:animate-none" />
      </span>
    </div>
  )
}

export default function Interview({
  messages,
  thinking,
  error,
  onRetry,
  canAnswer,
  questionNumber,
  questionTotal,
  answeredThisRound,
  questionsLeft,
  onAnswer,
  onSkip,
  onUpdateNow,
}: {
  messages: Message[]
  thinking: 'idea' | 'answers' | null
  error: { message: string; detail?: string } | null
  onRetry: () => void
  canAnswer: boolean
  /** 1-based position of the current question in this round, or 0 when none is open. */
  questionNumber: number
  questionTotal: number
  answeredThisRound: number
  questionsLeft: number
  onAnswer: (text: string) => void
  onSkip: () => void
  onUpdateNow: () => void
}) {
  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  // Keep the latest question in view. Instant jump, no smooth scrolling.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, thinking, error])

  const send = () => {
    const text = draft.trim()
    if (!text || !canAnswer) return
    onAnswer(text)
    setDraft('')
  }

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    send()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const composer = (
    <form onSubmit={onSubmit}>
      {canAnswer && questionTotal > 0 && (
        // Where you are in this round: one pip per question, filled as you go.
        <div className="mb-3 flex items-center gap-3 animate-in fade-in-0 duration-300">
          <span className="text-xs font-extrabold uppercase tracking-wide">
            Question {questionNumber} of {questionTotal}
          </span>
          <span aria-hidden="true" className="flex flex-1 gap-1">
            {Array.from({ length: questionTotal }, (_, i) => (
              <span
                key={i}
                className={cn(
                  'h-1.5 flex-1 rounded-full transition-colors duration-500',
                  i < questionNumber - 1 ? 'bg-poster-ink' : i === questionNumber - 1 ? 'bg-poster-green' : 'bg-poster-ink/15',
                )}
              />
            ))}
          </span>
        </div>
      )}
      <label htmlFor="answer" className="sr-only">
        Your answer
      </label>
      {/* Focus lifts the box onto a hard green shadow, like the idea box on /new. */}
      <div
        className={cn(
          'rounded-2xl border-2 bg-white transition-[box-shadow,transform,border-color] duration-200',
          canAnswer
            ? 'border-poster-ink focus-within:-translate-x-1 focus-within:-translate-y-1 focus-within:shadow-[6px_6px_0_#5fb57a] motion-reduce:focus-within:translate-x-0 motion-reduce:focus-within:translate-y-0'
            : 'border-poster-ink/20 bg-poster-ink/5',
        )}
      >
        <textarea
          id="answer"
          rows={3}
          value={draft}
          disabled={!canAnswer}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={canAnswer ? 'Your answer…' : 'Waiting for the next question…'}
          className="block w-full resize-none rounded-2xl bg-transparent px-4 py-3 text-sm font-semibold placeholder:font-medium placeholder:text-poster-ink/35 focus:outline-none disabled:cursor-not-allowed"
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="submit" disabled={!canAnswer || !draft.trim()} className={btnPrimary}>
          Send <Arrow />
        </button>
        <button type="button" onClick={onSkip} disabled={!canAnswer} className={btnSecondary}>
          Skip
        </button>
        <span className="ml-auto text-xs font-bold text-poster-ink/45">Enter to send · Shift+Enter for a new line</span>
      </div>
      {canAnswer && answeredThisRound > 0 && questionsLeft > 0 && (
        <button
          type="button"
          onClick={onUpdateNow}
          className="mt-3 text-xs font-extrabold uppercase tracking-wide underline decoration-poster-green decoration-2 underline-offset-4 transition-[text-underline-offset] duration-200 hover:text-poster-green hover:underline-offset-[6px] animate-in fade-in-0 duration-300"
        >
          Update understanding now ({answeredThisRound} answered, {questionsLeft} left)
        </button>
      )}
    </form>
  )

  return (
    <Panel index="01" label="Conversation" footer={composer} className="lg:min-h-0">
      <ol className="space-y-4" aria-live="polite">
        {messages.map((m) => (
          <li key={m.id}>
            <Bubble message={m} />
          </li>
        ))}
        {thinking && (
          <li>
            <Thinking kind={thinking} />
          </li>
        )}
        {error && (
          <li>
            <ErrorCard
              message={error.message}
              detail={error.detail}
              savedNote="Nothing is lost — your idea and answers are saved."
              onRetry={onRetry}
            />
          </li>
        )}
      </ol>
      <div ref={endRef} />
    </Panel>
  )
}
