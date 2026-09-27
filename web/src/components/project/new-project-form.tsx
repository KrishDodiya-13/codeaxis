'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, type FormEvent } from 'react'
import { createProject } from '@/lib/projects'
import { cn } from '@/lib/utils'
import { Mic } from 'lucide-react'
import HoverLetters from '@/components/hover-letters'
import IdeaStickers from './idea-stickers'
import { useSpeechToText } from '@/hooks/use-speech-to-text'

const SOFT_LIMIT = 500

// The hero's springy ease, for the stamp.
const SPRING = 'ease-[cubic-bezier(.3,1.6,.5,1)]'

const EXAMPLES = [
  {
    label: 'Hackathon teammate finder',
    idea: 'An app that helps university students find hackathon teammates with complementary skills.',
  },
  {
    label: 'Plant-care app',
    idea: 'A mobile app that reminds busy renters when and how to water their houseplants.',
  },
  {
    label: 'Local bakery rebrand',
    idea: 'A neighbourhood bakery that wants to rebrand to attract younger customers and start selling online.',
  },
]

const inputClass =
  'h-12 w-full rounded-full border-2 border-poster-ink bg-white px-5 text-sm font-semibold placeholder:font-medium placeholder:text-poster-ink/35 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-poster-green/40'

/** The hero's looping swash, drawn once on load around "IDEA". */
function Swash() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 255 72"
      preserveAspectRatio="none"
      className="pointer-events-none absolute -left-[4%] top-[0.42em] h-[0.62em] w-[108%] overflow-visible"
    >
      <path
        pathLength={1}
        d="M6 44 C40 18 150 4 222 14 C262 20 258 48 214 58 C150 72 60 70 30 60 C10 53 20 40 60 34"
        className="animate-draw fill-none stroke-poster-ink [stroke-dasharray:1] [stroke-linecap:round] [stroke-width:3px] [vector-effect:non-scaling-stroke] motion-reduce:animate-none"
      />
    </svg>
  )
}

export default function NewProjectForm() {
  const router = useRouter()
  const ideaRef = useRef<HTMLTextAreaElement>(null)
  const [idea, setIdea] = useState('')
  const [audience, setAudience] = useState('')
  const [productType, setProductType] = useState('')
  const [constraints, setConstraints] = useState('')
  const [starting, setStarting] = useState(false)

  // Each finished spoken phrase is appended to whatever is already typed.
  const speech = useSpeechToText((text) => {
    setIdea((prev) => (prev.trim() ? `${prev.trimEnd()} ${text}` : text))
  })

  const ready = idea.trim().length > 0

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!ready || starting) return
    speech.stop()
    setStarting(true)
    const project = createProject({ idea, audience, productType, constraints })
    router.push(`/project/${project.id}/discover`)
  }

  const pickExample = (text: string) => {
    setIdea(text)
    ideaRef.current?.focus()
  }

  return (
    <form onSubmit={onSubmit} className="relative w-full max-w-3xl">
      <IdeaStickers />
      {/* Ringed stamp, like the hero's "Try to break it". Straightens and fills green on hover. */}
      <span
        aria-hidden="true"
        className={cn(
          'absolute right-2 top-4 hidden cursor-default rounded-[50%] border-2 border-poster-ink px-5 py-2.5 text-sm font-extrabold md:block',
          'rotate-[-9deg] transition-[transform,background-color] duration-[400ms] hover:rotate-[6deg] hover:scale-[1.08] hover:bg-poster-green',
          SPRING,
          'motion-reduce:transition-none'
        )}
      >
        Rough is fine<sup className="ml-0.5 text-[0.7em]">*</sup>
      </span>

      <label
        htmlFor="idea"
        className="block font-display text-[clamp(2.5rem,6vw,5rem)] uppercase leading-[0.93] tracking-[-0.045em]"
      >
        {/* Letters lift and tilt on hover, like the hero headline. */}
        <HoverLetters text="What's your" />{' '}
        <span className="relative inline-block">
          <HoverLetters text="idea" />
          <Swash />
        </span>
        <HoverLetters text="?" className="text-poster-green" />
      </label>
      <p className="mt-4 text-lg font-semibold text-poster-ink/60">
        Describe it in your own words. It doesn&apos;t have to be perfect.
      </p>

      {/* Focus lifts the box onto a hard green shadow, like the landing's stress-test card. */}
      <div
        className={cn(
          'mt-8 rounded-3xl border-2 border-poster-ink bg-white transition-[box-shadow,transform] duration-200',
          'focus-within:-translate-x-1 focus-within:-translate-y-1 focus-within:shadow-[8px_8px_0_#5fb57a]',
          'motion-reduce:transition-none motion-reduce:focus-within:translate-x-0 motion-reduce:focus-within:translate-y-0'
        )}
      >
        <textarea
          ref={ideaRef}
          id="idea"
          name="idea"
          required
          rows={5}
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          placeholder="Start typing, speak it, or pick an example below…"
          className="block w-full resize-y rounded-3xl bg-transparent px-6 pt-5 text-lg font-semibold placeholder:font-medium placeholder:text-poster-ink/35 focus:outline-none"
        />
        {speech.listening && (
          <p className="px-6 pt-1 text-base font-semibold italic text-poster-ink/45" aria-live="polite">
            {speech.interim || 'Listening…'}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3 px-6 pb-4 pt-2">
          {speech.supported && (
            <button
              type="button"
              onClick={speech.listening ? speech.stop : speech.start}
              aria-pressed={speech.listening}
              aria-label={speech.listening ? 'Stop voice input' : 'Speak your idea'}
              className={cn(
                'inline-flex h-9 items-center gap-2 rounded-full border-2 border-poster-ink px-3.5 text-xs font-extrabold uppercase tracking-wide',
                'transition-colors duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-poster-green/40 motion-reduce:transition-none',
                speech.listening ? 'bg-poster-green hover:bg-poster-ink hover:text-poster-paper' : 'bg-white hover:bg-poster-green'
              )}
            >
              {speech.listening ? (
                <>
                  <span aria-hidden="true" className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#e5484d] ring-1 ring-poster-ink motion-reduce:animate-none" />
                  Stop
                </>
              ) : (
                <>
                  <Mic aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />
                  Speak
                </>
              )}
            </button>
          )}
          {speech.error && (
            <p role="alert" className="text-xs font-bold text-[#c4282d]">
              {speech.error}
            </p>
          )}
          <p
            className={`ml-auto text-xs font-bold ${idea.length > SOFT_LIMIT ? 'text-[#b7791f]' : 'text-poster-ink/40'}`}
            aria-live="polite"
          >
            {idea.length} / {SOFT_LIMIT}
            {idea.length > SOFT_LIMIT && ' · shorter usually works better'}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-extrabold uppercase tracking-wide text-poster-ink/50">Try an example</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex.label}
            type="button"
            onClick={() => pickExample(ex.idea)}
            className="rounded-full border-2 border-poster-ink bg-white px-4 py-1.5 text-sm font-bold transition-colors duration-200 hover:bg-poster-green focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-poster-green/40 motion-reduce:transition-none"
          >
            {ex.label}
          </button>
        ))}
      </div>

      <details className="mt-6 rounded-3xl border-2 border-poster-ink/30 bg-white/50 px-6 py-4">
        <summary className="cursor-pointer text-sm font-extrabold uppercase tracking-wide hover:text-poster-green">
          Optional details
        </summary>
        <div className="mt-5 grid gap-5 md:grid-cols-3">
          {[
            { id: 'audience', label: "Who's it for?", value: audience, set: setAudience, placeholder: 'e.g. university students' },
            { id: 'productType', label: 'Product type', value: productType, set: setProductType, placeholder: 'e.g. mobile app' },
            { id: 'constraints', label: 'Known constraints', value: constraints, set: setConstraints, placeholder: 'e.g. no budget, web only' },
          ].map((f) => (
            <div key={f.id} className="space-y-2">
              <label htmlFor={f.id} className="text-xs font-extrabold uppercase tracking-wide hover:text-poster-green">
                {f.label}
              </label>
              <input
                id={f.id}
                value={f.value}
                onChange={(e) => f.set(e.target.value)}
                placeholder={f.placeholder}
                className={inputClass}
              />
            </div>
          ))}
        </div>
      </details>

      <div className="mt-8 flex flex-wrap items-center gap-6">
        {/* Grey until there is an idea, then wakes up green; on hover it inverts and the arrow slides in. */}
        <button
          type="submit"
          disabled={!ready || starting}
          className={cn(
            'group inline-flex h-14 items-center rounded-full border-2 px-8 text-lg font-extrabold',
            'transition-[background-color,color,border-color,transform] duration-300 motion-reduce:transition-none',
            'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-poster-green/40',
            ready
              ? 'border-poster-ink bg-poster-green hover:-translate-y-0.5 hover:bg-poster-ink hover:text-poster-paper motion-reduce:hover:translate-y-0'
              : 'cursor-not-allowed border-poster-ink/30 bg-poster-ink/10 text-poster-ink/40'
          )}
        >
          {starting ? 'Starting discovery…' : 'Start Discovery'}
          {!starting && (
            <span
              aria-hidden="true"
              className={cn(
                'inline-block overflow-hidden transition-[width,opacity,margin] duration-300 motion-reduce:transition-none',
                ready ? 'ml-0 w-0 opacity-0 group-hover:ml-2 group-hover:w-[1em] group-hover:opacity-100' : 'ml-2 w-[1em]'
              )}
            >
              →
            </span>
          )}
        </button>
        <p className="text-sm font-semibold text-poster-ink/60">
          No account needed. Your project is saved in this browser.
        </p>
      </div>
    </form>
  )
}
