import { z } from 'zod'
import { CONTENT_DIMENSIONS } from '@/lib/consistency'

/*
 * The content check's Zod schemas — server-only.
 *
 * Kept apart from lib/consistency.ts, which the browser imports: the page only needs the
 * inferred types, and importing the schemas there bundled Zod into the client for nothing.
 */

const text = () => z.string().trim().min(1)

/**
 * What the model returns for a content check. `overall` is deliberately absent: it is
 * computed from the dimension verdicts, so the headline can never disagree with them.
 */
export const ContentCheckSchema = z
  .object({
    summary: text().describe('One sentence: how well this content fits the brand, and the main reason.'),
    dimensions: z
      .array(
        z
          .object({
            dimension: z.enum(CONTENT_DIMENSIONS),
            status: z
              .enum(['pass', 'warning', 'fail', 'not-applicable'])
              .describe(
                'pass = fits. warning = drifts but usable. fail = contradicts the brand. not-applicable = the content gives nothing to judge this on (e.g. visual for plain text).',
              ),
            finding: text().describe('What in the content led to this verdict. Quote the words you mean.'),
            evidence: text().describe('The Brand DNA field this was judged against, as a path, e.g. voice.toneAttributes.'),
            recommendation: z.string().trim().optional().describe('A concrete change, for warning or fail only.'),
          })
          .strict(),
      )
      .describe('Exactly one entry per dimension: voice, positioning, audience, personality, visual.'),
    repair: z
      .object({
        original: text().describe('The exact words from the content to replace, copied verbatim.'),
        suggestion: text().describe('The replacement words, in the brand voice.'),
        rationale: text().describe('Why this brings the content back in line, naming the Brand DNA fields.'),
      })
      .strict()
      .nullable()
      .describe('The single most valuable fix, or null when everything passes.'),
  })
  .strict()

/** The request body for a content check. */
export const ContentCheckRequestSchema = z
  .object({
    action: z.literal('content'),
    state: z.unknown(),
    content: z.string().trim().min(1, 'Paste some content to check.').max(4000, 'Keep it under 4,000 characters.'),
  })
  .strict()

