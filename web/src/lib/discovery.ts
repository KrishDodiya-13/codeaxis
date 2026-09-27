import { z } from 'zod'

/*
 * Mirror of `DiscoverResultSchema` in the engine (../src/schemas.ts). The engine
 * already validates what the model returns; the web app validates again at its own
 * boundary so it never renders malformed data. Keep the two in step.
 */
const text = () => z.string().min(1)

export const DiscoverResultSchema = z.object({
  problem: text(),
  targetAudience: text(),
  userNeed: text(),
  goals: z.array(text()),
  constraints: z.array(text()),
  assumptions: z.array(text()),
  missingInformation: z.array(text()),
  followUpQuestions: z.array(text()),
})

export type DiscoverResult = z.infer<typeof DiscoverResultSchema>

/** What the web app sends to POST /api/discover. Answers are always a question→answer map. */
export const DiscoverRequestSchema = z.object({
  idea: z.string().trim().min(1).max(5000),
  discovery: DiscoverResultSchema.optional(),
  answers: z.record(z.string(), z.string().max(2000)).optional(),
})

export type DiscoverRequest = z.infer<typeof DiscoverRequestSchema>

/** The engine's rule: discovery is complete when nothing is missing. */
export function isDiscoveryComplete(d: DiscoverResult) {
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
