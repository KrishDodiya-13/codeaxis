'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { createProject } from '@/lib/projects'

const SOFT_LIMIT = 500

const inputClass =
  'h-12 w-full rounded-full border-2 border-poster-ink bg-white px-5 text-sm font-semibold placeholder:font-medium placeholder:text-poster-ink/35 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-poster-green/40'

export default function NewProjectForm() {
  const router = useRouter()
  const [idea, setIdea] = useState('')
  const [audience, setAudience] = useState('')
  const [productType, setProductType] = useState('')
  const [constraints, setConstraints] = useState('')
  const [starting, setStarting] = useState(false)

  const ready = idea.trim().length > 0

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!ready || starting) return
    setStarting(true)
    const project = createProject({ idea, audience, productType, constraints })
    router.push(`/project/${project.id}/discover`)
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-3xl">
      <label htmlFor="idea" className="block font-display text-[clamp(2.5rem,6vw,5rem)] uppercase leading-[0.93] tracking-[-0.045em]">
        What&apos;s your idea<span className="text-poster-green">?</span>
      </label>
      <p className="mt-4 text-lg font-semibold text-poster-ink/60">
        Describe it in your own words. It doesn&apos;t have to be perfect.
      </p>

      <div className="mt-8 rounded-3xl border-2 border-poster-ink bg-white focus-within:ring-4 focus-within:ring-poster-green/40">
        <textarea
          id="idea"
          name="idea"
          required
          rows={5}
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          placeholder="An app that helps students find hackathon teammates…"
          className="block w-full resize-y rounded-3xl bg-transparent px-6 pt-5 text-lg font-semibold placeholder:font-medium placeholder:text-poster-ink/35 focus:outline-none"
        />
        <p
          className={`px-6 pb-4 text-right text-xs font-bold ${idea.length > SOFT_LIMIT ? 'text-[#b7791f]' : 'text-poster-ink/40'}`}
          aria-live="polite"
        >
          {idea.length} / {SOFT_LIMIT}
          {idea.length > SOFT_LIMIT && ' · shorter usually works better'}
        </p>
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
        <button
          type="submit"
          disabled={!ready || starting}
          className="inline-flex h-14 items-center gap-2 rounded-full border-2 border-poster-ink bg-poster-green px-8 text-lg font-extrabold hover:bg-poster-ink hover:text-poster-paper focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-poster-green/40 disabled:cursor-not-allowed disabled:border-poster-ink/30 disabled:bg-poster-ink/10 disabled:text-poster-ink/40"
        >
          {starting ? 'Starting discovery…' : 'Start Discovery →'}
        </button>
        <p className="text-sm font-semibold text-poster-ink/60">
          No account needed. Your project is saved in this browser.
        </p>
      </div>
    </form>
  )
}
