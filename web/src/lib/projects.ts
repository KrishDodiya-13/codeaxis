import type { DiscoverResult } from '@/lib/discovery'

/*
 * Browser-only project store.
 *
 * ARCHITECTURE.md puts projects in Postgres via Prisma, which does not exist yet.
 * Until it does, a project lives in this browser's localStorage so a refresh never
 * loses the idea or the interview. Swap these functions for API calls later; the
 * pages only use load/save/create.
 */

export type MessageRole = 'brandos' | 'user' | 'note'

export interface Message {
  id: string
  role: MessageRole
  text: string
  /** For BRANDOS questions: the gap this question closes. */
  why?: string
}

/** The batch of follow-up questions currently being worked through. */
export interface Round {
  questions: string[]
  /** The gap each question closes, when the engine paired one. */
  gaps: (string | undefined)[]
  index: number
  answers: Record<string, string>
}

export interface Project {
  id: string
  name: string
  idea: string
  audience: string
  productType: string
  constraints: string
  discovery: DiscoverResult | null
  messages: Message[]
  round: Round | null
  createdAt: string
  updatedAt: string
}

const KEY = (id: string) => `brandos:project:${id}`

export function newId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function loadProject(id: string): Project | null {
  try {
    const raw = window.localStorage.getItem(KEY(id))
    return raw ? (JSON.parse(raw) as Project) : null
  } catch {
    return null
  }
}

export function saveProject(project: Project): Project {
  const next = { ...project, updatedAt: new Date().toISOString() }
  try {
    window.localStorage.setItem(KEY(project.id), JSON.stringify(next))
  } catch {
    // Storage full or blocked: the in-memory project still works for this session.
  }
  return next
}

export function createProject(input: {
  idea: string
  audience?: string
  productType?: string
  constraints?: string
}): Project {
  const idea = input.idea.trim()
  const words = idea.split(/\s+/).slice(0, 6).join(' ')
  const now = new Date().toISOString()
  return saveProject({
    id: newId(),
    name: words.length < idea.length ? `${words}…` : words,
    idea,
    audience: input.audience?.trim() ?? '',
    productType: input.productType?.trim() ?? '',
    constraints: input.constraints?.trim() ?? '',
    discovery: null,
    messages: [],
    round: null,
    createdAt: now,
    updatedAt: now,
  })
}

/**
 * The idea as the engine sees it. The engine takes a single free-text idea, so the
 * optional /new fields are folded in, labelled, rather than dropped.
 */
export function ideaForEngine(p: Pick<Project, 'idea' | 'audience' | 'productType' | 'constraints'>) {
  const extras = [
    p.audience && `Who it's for: ${p.audience}`,
    p.productType && `Product type: ${p.productType}`,
    p.constraints && `Known constraints: ${p.constraints}`,
  ].filter(Boolean)
  return extras.length ? `${p.idea}\n\n${extras.join('\n')}` : p.idea
}
