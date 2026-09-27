import { NextResponse } from 'next/server'
import { DiscoverRequestSchema, DiscoverResultSchema } from '@/lib/discovery'

/*
 * Server-side proxy to the BRANDOS engine's POST /api/discover (the `brandstate
 * serve` process in the repo root). The engine holds the model API key; the browser
 * only ever talks to this route. Input and output are both validated here.
 */

const ENGINE_URL = process.env.BRANDSTATE_API_URL ?? 'http://127.0.0.1:8787'
// Model calls at high effort can take a while; give up well before a user would.
const TIMEOUT_MS = 180_000

function error(status: number, message: string) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return error(400, 'The request body must be JSON.')
  }

  const input = DiscoverRequestSchema.safeParse(body)
  if (!input.success) return error(400, 'That request is missing the idea or has a malformed field.')

  let response: Response
  try {
    response = await fetch(`${ENGINE_URL}/api/discover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input.data),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    })
  } catch (e) {
    if (e instanceof Error && e.name === 'TimeoutError') {
      return error(504, 'The engine took too long to answer. Your answers are kept — try again.')
    }
    return error(503, "The BRANDOS engine isn't reachable. Start it, then try again.")
  }

  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? data.error
        : 'Discovery failed.'
    return error(response.status >= 500 ? 502 : response.status, message)
  }

  const result = DiscoverResultSchema.safeParse(data)
  if (!result.success) return error(502, 'The engine returned something unexpected. Try again.')

  return NextResponse.json(result.data)
}
