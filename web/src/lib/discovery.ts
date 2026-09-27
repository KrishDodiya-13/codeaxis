/*
 * Discovery types for the web app — client-safe.
 *
 * This file is imported by client components, so it must not pull in the engine at
 * runtime: the engine uses `node:crypto`, which cannot be bundled for the browser.
 * The Zod schema below is therefore a local one.
 *
 * It used to be a hand-mirror with a comment asking someone to remember to keep the
 * two in step. The `Exact` assertion at the bottom does that mechanically instead: the
 * engine's type is imported with `import type`, which is erased at build time and adds
 * nothing to the bundle, and the assertion fails the type check if the two shapes ever
 * differ. Drift is now a compile error rather than a demo-day surprise.
 */
import { z } from 'zod'
import type { DiscoverResult as EngineDiscoverResult } from 'brandstate'

const text = () => z.string().min(1)

export const DiscoverResultSchema = z
  .object({
    problem: text(),
    targetAudience: text(),
    userNeed: text(),
    goals: z.array(text()),
    constraints: z.array(text()),
    assumptions: z.array(text()),
    missingInformation: z.array(text()),
    followUpQuestions: z.array(text()),
  })
  .strict()

export type DiscoverResult = z.infer<typeof DiscoverResultSchema>

/** True only when the two types are mutually assignable. */
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false

/**
 * Drift guard. If the engine's `DiscoverResult` gains, loses or retypes a field, this
 * stops being `true` and the build fails here with a clear place to look.
 */
const _schemaMatchesEngine: Exact<DiscoverResult, EngineDiscoverResult> = true
void _schemaMatchesEngine

/** What the web app sends to POST /api/discover. Answers are always a question→answer map. */
export const DiscoverRequestSchema = z
  .object({
    idea: z.string().trim().min(1).max(5000),
    discovery: DiscoverResultSchema.optional(),
    answers: z.record(z.string(), z.string().max(2000)).optional(),
  })
  .strict()

export type DiscoverRequest = z.infer<typeof DiscoverRequestSchema>

/** The engine's rule: discovery is complete when nothing is missing. */
export function isDiscoveryComplete(d: DiscoverResult): boolean {
  return d.missingInformation.length === 0
}

/** Everything the user has told us or the engine has pinned down, as label/value pairs. */
export function knownFacts(d: DiscoverResult): { label: string; value: string }[] {
  return [
    { label: 'Problem', value: d.problem },
    { label: 'Audience', value: d.targetAudience },
    { label: 'User need', value: d.userNeed },
    ...d.goals.map((value) => ({ label: 'Goal', value })),
    ...d.constraints.map((value) => ({ label: 'Constraint', value })),
  ]
}
