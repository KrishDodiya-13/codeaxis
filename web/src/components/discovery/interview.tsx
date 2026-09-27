'use client'

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { Message } from '@/lib/projects'
import { Panel } from '@/components/project/panel'

function Bubble({ message }: { message: Message }) {
  if (message.role === 'note') {
    return <p className="text-center text-xs font-bold uppercase tracking-wide text-poster-ink/45">{message.text}</p>
  }
  if (message.role === 'user') {
    return (
      <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md border-2 border-poster-ink bg-poster-green px-4 py-3">
        <p className="whitespace-pre-wrap text-sm font-semibold">{message.text}</p>
      </div>
    )
  }
  return (
    <div className="max-w-[92%] rounded-2xl rounded-bl-md border-2 border-poster-ink bg-white px-4 py-3">
      <p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-widest">
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-poster-green ring-1 ring-poster-ink" />
        Brandos
      </p>
      <p className="mt-2 whitespace-pre-wrap font-semibold leading-snug">{message.text}</p>
      {message.why && (
        <p className="mt-2 text-xs font-semibold text-poster-ink/55">
          <span className="font-extrabold uppercase tracking-wide">Why this matters · </span>
          {message.why}
        </p>
      )}
    </div>
  )
}

export default function Interview({
  messages,
  thinking,
  error,
  onRetry,
  canAnswer,
  answeredThisRound,
  questionsLeft,
  onAnswer,
  onSkip,
  onUpdateNow,
}: {
  messages: Message[]
  thinking: 'idea' | 'answers' | null
  error: string | null
  onRetry: () => void
  canAnswer: boolean
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
      <label htmlFor="answer" className="sr-only">
        Your answer
      </label>
      <textarea
        id="answer"
        rows={3}
        value={draft}
        disabled={!canAnswer}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={canAnswer ? 'Your answer…' : 'Waiting for the next question…'}
        className="block w-full resize-none rounded-2xl border-2 border-poster-ink bg-white px-4 py-3 text-sm font-semibold placeholder:font-medium placeholder:text-poster-ink/35 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-poster-green/40 disabled:cursor-not-allowed disabled:border-poster-ink/20 disabled:bg-poster-ink/5"
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={!canAnswer || !draft.trim()}
          className="inline-flex h-10 items-center rounded-full border-2 border-poster-ink bg-poster-green px-5 text-sm font-extrabold hover:bg-poster-ink hover:text-poster-paper focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-poster-green/40 disabled:cursor-not-allowed disabled:border-poster-ink/20 disabled:bg-poster-ink/10 disabled:text-poster-ink/40"
        >
          Send →
        </button>
        <button
          type="button"
          onClick={onSkip}
          disabled={!canAnswer}
          className="inline-flex h-10 items-center rounded-full border-2 border-poster-ink bg-white px-4 text-sm font-extrabold hover:text-poster-green focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-poster-green/40 disabled:cursor-not-allowed disabled:border-poster-ink/20 disabled:text-poster-ink/40"
        >
          Skip
        </button>
        <span className="ml-auto text-xs font-bold text-poster-ink/45">Enter to send · Shift+Enter for a new line</span>
      </div>
      {canAnswer && answeredThisRound > 0 && questionsLeft > 0 && (
        <button
          type="button"
          onClick={onUpdateNow}
          className="mt-3 text-xs font-extrabold uppercase tracking-wide underline decoration-poster-green decoration-2 underline-offset-4 hover:text-poster-green"
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
          <li className="max-w-[92%] rounded-2xl rounded-bl-md border-2 border-dashed border-poster-ink/40 bg-white/60 px-4 py-3">
            <p className="text-[11px] font-extrabold uppercase tracking-widest">Brandos</p>
            <p className="mt-2 font-semibold text-poster-ink/60">
              {thinking === 'idea' ? 'Understanding your idea…' : 'Analysing your answers…'}
            </p>
          </li>
        )}
        {error && (
          <li className="rounded-2xl border-2 border-[#e5484d] bg-white px-4 py-3" role="alert">
            <p className="text-sm font-extrabold text-[#c4282d]">That didn&apos;t go through.</p>
            <p className="mt-1 text-sm font-semibold">{error}</p>
            <p className="mt-1 text-xs font-semibold text-poster-ink/55">Nothing is lost — your idea and answers are saved.</p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 inline-flex h-9 items-center rounded-full border-2 border-poster-ink bg-white px-4 text-sm font-extrabold hover:text-poster-green focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-poster-green/40"
            >
              Try again
            </button>
          </li>
        )}
      </ol>
      <div ref={endRef} />
    </Panel>
  )
}
