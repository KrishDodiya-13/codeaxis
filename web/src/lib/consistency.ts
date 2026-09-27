import type { z } from 'zod'
import type { ConsistencyDimension } from 'brandstate'
// Type-only: the schemas live server-side (lib/ai/content-check-schema.ts), so Zod stays out of the browser bundle.
import type { ContentCheckSchema } from '@/lib/ai/content-check-schema'

/*
 * Consistency — client-safe definitions.
 *
 * Two checks live on the Consistency page, as ARCHITECTURE.md plans them:
 *
 *   - the content check (Page 6): paste a real piece of copy and see how it measures up
 *     against the approved Brand DNA — Voice, Positioning, Audience, Personality, Visual
 *   - the brand self-check (§16): the engine's `checkConsistency`, which asks whether the
 *     brand's own decisions agree with each other. Its result lives in BrandState.consistency.
 *
 * Only `import type` from the engine here; it must never be bundled for the browser.
 */

/** The five things a piece of content is checked against, per the plan. */
export const CONTENT_DIMENSIONS = ['voice', 'positioning', 'audience', 'personality', 'visual'] as const
export type ContentDimension = (typeof CONTENT_DIMENSIONS)[number]

export const CONTENT_DIMENSION_META: Record<ContentDimension, { label: string; glyph: string }> = {
  voice: { label: 'Voice', glyph: '❝' },
  positioning: { label: 'Positioning', glyph: '◆' },
  audience: { label: 'Audience fit', glyph: '◎' },
  personality: { label: 'Personality', glyph: '✺' },
  visual: { label: 'Visual language', glyph: '◐' },
}

export type ContentCheckModel = z.infer<typeof ContentCheckSchema>
export type DimensionVerdict = ContentCheckModel['dimensions'][number]
export type Overall = 'pass' | 'warning' | 'fail'

export interface ContentCheckResult {
  overall: Overall
  summary: string
  dimensions: DimensionVerdict[]
  repair: ContentCheckModel['repair']
}

/** Stored per project, newest first: every check the user ran, and what they did with the repair. */
export interface ContentCheck {
  id: string
  at: string
  content: string
  result: ContentCheckResult
  repair?: 'applied' | 'kept' | 'edited'
  /** The text after an applied or edited repair. */
  repaired?: string
}

export interface ConsistencyHistory {
  projectId: string
  checks: ContentCheck[]
}

const KEY = (id: string) => `brandos:consistency:${id}`

export function loadConsistency(id: string): ConsistencyHistory {
  try {
    const raw = window.localStorage.getItem(KEY(id))
    if (raw) return JSON.parse(raw) as ConsistencyHistory
  } catch {
    // Unreadable storage: start clean.
  }
  return { projectId: id, checks: [] }
}

export function saveConsistency(history: ConsistencyHistory): ConsistencyHistory {
  try {
    window.localStorage.setItem(KEY(history.projectId), JSON.stringify({ ...history, checks: history.checks.slice(0, 12) }))
  } catch {
    // Storage full or blocked: the in-memory history still works for this session.
  }
  return history
}

/** Labels for the engine's eight self-check dimensions. */
export const BRAND_DIMENSION_LABELS: Record<ConsistencyDimension, string> = {
  audience: 'Audience',
  positioning: 'Positioning',
  personality: 'Personality',
  voice: 'Voice',
  visualDirection: 'Visual',
  messaging: 'Messaging',
  valueProposition: 'Value prop',
  differentiator: 'Differentiator',
}
