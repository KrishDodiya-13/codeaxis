# POSITION — `POST /api/position`

Implementation notes for Phase 3. Records how the spec maps onto the code, and the
decisions it left open.

Depends on [discover-endpoint.md](discover-endpoint.md) (Phase 2). Feeds
`BrandState.positioning` — see [brandstate-spec.md](brandstate-spec.md).

## Where it lives

| Concern | File |
|---|---|
| Guard, specificity loop, mapping, provenance | [../src/position.ts](../src/position.ts) |
| Optional web-search competitor lookup | [../src/competitors.ts](../src/competitors.ts) |
| `PositionResponseSchema`, `PositionResultSchema` | [../src/schemas.ts](../src/schemas.ts) |
| `POSITION_INSTRUCTIONS` and the user prompts | [../src/prompts.ts](../src/prompts.ts) |
| Routing and status codes | [../src/server.ts](../src/server.ts) |
| Tests | [../test/position.test.ts](../test/position.test.ts), [../test/server.test.ts](../test/server.test.ts) |

## Request

```
POST /api/position
Content-Type: application/json
```

```json
{ "discovery": { "problem": "...", "targetAudience": "...", "...": "..." } }
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `discovery` | object | yes | The completed `BrandState.discovery`. Also accepted **bare** at the top level, since Phase 2's response body is exactly that shape and forwarding it unwrapped is the obvious move. |
| `knownCompetitors` | `string[]` | no | Alternatives the user already knows of. Blank entries are dropped. |
| `forceProceed` | `boolean` | no, default `false` | Position despite unresolved discovery questions. See the guard below. |
| `includeAlternatives` | `boolean` | no, default `false` | Return the angles considered and passed over. |

## Response

`200` with the positioning object:

```json
{
  "category": "...",
  "audience": "...",
  "problem": "...",
  "valueProposition": "...",
  "differentiator": "...",
  "competitiveAngle": "...",
  "rationale": ["..."],
  "alternativePositions": [{ "category": "...", "whyNotChosen": "..." }],
  "assumptionsUsed": ["..."]
}
```

The last two are conditional: `alternativePositions` only with
`includeAlternatives`, `assumptionsUsed` only when `forceProceed` was needed.

### Status codes

| Code | When |
|---|---|
| `200` | The positioning object. |
| `400` | Malformed request: not an object, an invalid discovery object (the error names the offending field), or a flag of the wrong type. |
| `404` / `405` | Unknown path / wrong method. |
| `413` | Body over 1 MB. |
| `422` | Discovery still has open questions and `forceProceed` was not set. The body carries `openQuestions` so the caller can put them to the user. |
| `502` | The model call produced nothing usable: a refusal, a schema failure, or a category that stayed too vague after a retry (the body carries `category` and `couldAlsoDescribe`). |

## The guard

Phase 2's discipline carries forward: don't build on ground you know is shaky.

If `discovery.openQuestions` is non-empty and `forceProceed` is not `true`, the
request is refused with a `422` listing the unresolved questions — and **the model
is never called**, so a premature request costs nothing.

With `forceProceed: true` it proceeds, but the unresolved questions are named in
the prompt and the model is required to record an entry in `assumptionsUsed` for
each one it assumed an answer to, plus a matching note in `rationale`. Proceeding
is allowed; proceeding *silently* is not.

## Forcing specificity

The spec's rule 1 asks that vague categories be rejected and regenerated, with the
test being "could this category name describe five unrelated products?". That is a
semantic judgement, so it is made where semantic judgement lives — the model is
required to answer it about its own category in a `categoryCheck` field, and the
code acts on the answer:

1. If the model reports its category could describe unrelated products, the call is
   retried with the rejected category and those products quoted back. Quoting them
   matters: "be more specific" alone tends to produce a *longer* vague phrase, so
   the retry prompt says outright that length is not specificity.
2. Two attempts by default (`maxCategoryAttempts`). If it still fails, the request
   fails with a `502` rather than persisting a category the model itself said
   describes unrelated products.
3. `categoryCheck` is stripped before the response goes out — it is a working
   field, following DISCOVER's `missingInformation` precedent.

A narrow deterministic backstop (`isCategoryAllFiller`) catches a category built
*entirely* from marketing filler — "Modern all-in-one collaborative platform" —
which is the case a self-report is most likely to wave through. It is deliberately
conservative, since a false positive there rejects good work: "Payroll software for
restaurants" passes, because `restaurants` and `payroll` are real domain words.

## Decisions the spec left open

**`audience` and `problem` are echoed in the response but never persisted.** The
spec is explicit that `discovery` stays the single source of truth for both, so
`toPositioningSection` drops them. They exist in the response for traceability — a
reviewer can audit the positioning object without a second lookup.

**Audience narrowing is detected and reported, not enforced.**
`detectsAudienceNarrowing` flags that the sharpened audience differs from
discovery's (ignoring whitespace and case). The prompt requires the reason to appear
in `rationale`. The code reports the narrowing — in the request log and on the CLI —
rather than rejecting the response, because narrowing is usually correct and a hard
failure would fight good strategy.

**`alternativePositions` is off by default.** Rule 5 says one position, not a menu,
"unless asked" — and points at this feature as the asking. So it is opt-in. There is
still exactly one chosen position either way; alternatives are the road not taken,
recorded so the later `selectedStrategy` decision stays auditable.

**`assumptionsUsed` stays out of `BrandState`.** It is a response field, kept
separate from `rationale` so reasoning and known gaps don't blend. The state carries
the same information as the rationale notes the model was told to write, so nothing
is lost and there is no second copy to drift.

**Provenance lives on `positioning` as `sourceDiscoveryHash`.** An additive optional
field — a truncated SHA-256 of the deterministically serialized discovery. It is the
one field of `positioning` that is not strategy, and it is what
`isPositioningStale()` uses to tell "generated from the current discovery" from
"stale, because discovery was edited underneath it". An absent hash reads as *not*
stale: unknown provenance is not evidence of staleness, and treating it as such
would make the signal useless on hand-written states.

## The competitor lookup is optional and pluggable

`CompetitorLookup` is a one-function interface consulted **only** when
`knownCompetitors` is empty:

```ts
import { createDiscoverServer, createWebSearchCompetitorLookup } from './dist/index.js';

const server = createDiscoverServer({
  position: { competitorLookup: createWebSearchCompetitorLookup() },
});
```

Three properties make it safe to leave out, which is the default:

- The core works with zero lookups. The prompt already asks for the realistic
  informal alternative when no competitors are supplied.
- A lookup that throws is swallowed and treated as "none found", so an optional
  feature can never become load-bearing.
- The interface takes a `Discovery` and returns names, so an internal catalogue or a
  static list satisfies it as well as web search does.

The bundled implementation uses Claude's server-side `web_search` tool and parses a
JSON array out of the reply, tolerantly — any parse failure yields an empty list.
Its parsing is unit-tested; the live search call is not (see below).

## Mapping into `BrandState`

| POSITION response | `BrandState.positioning` |
|---|---|
| `category`, `valueProposition`, `differentiator`, `competitiveAngle`, `rationale` | carried across |
| `audience`, `problem` | dropped — `discovery` owns them |
| `assumptionsUsed` | dropped — carried as rationale notes |
| `alternativePositions` | dropped — a decision aid, not brand state |
| — | `sourceDiscoveryHash` added |

## The pipeline uses this too

`runStep(…, 'positioning')` goes through `position()` and `toPositioningSection()`,
so the pipeline and the endpoint share one prompt and one schema.

It passes `forceProceed: true`, and that is a deliberate trade. An end-to-end
`brandstate run` has nobody to answer discovery's questions, and DISCOVER almost
always leaves some — the guard would halt every run. The discipline is kept rather
than dropped: each assumed answer comes back named, so a pipeline run states what it
assumed. Callers who want the guard enforced use the endpoint, which is where the
conversation with the user actually happens.

## One conflict this phase resolved

`PositioningSchema` is no longer the schema sent to the model — `PositionResultSchema`
is. That matters for the test asserting every model-facing field carries its
description: it now checks the schemas actually sent, which for `discovery` and
`positioning` are the endpoint result schemas rather than the section schemas.

While fixing that, the same zod description-loss bug from Phase 1 reappeared in a new
form: `.optional()` applied *after* `.describe()` discards the description, so
`alternativePositions`, `assumptionsUsed` and `sourceDiscoveryHash` were reaching the
model undescribed. The order is now `.describe().optional()` throughout, and the test
covers it.
