# DISCOVER — `POST /api/discover`

Implementation notes for Phase 2. The spec this was built from is the Phase 2
document; this records how it maps onto the code, and the three places the
implementation makes a decision the spec left open.

Feeds into `BrandState.discovery` — see [brandstate-spec.md](brandstate-spec.md).

## Where it lives

| Concern | File |
|---|---|
| Request validation, the call, the mapping | [../src/discover.ts](../src/discover.ts) |
| Response schema (`DiscoverResultSchema`) | [../src/schemas.ts](../src/schemas.ts) |
| System prompt (`DISCOVER_INSTRUCTIONS`) and user prompts | [../src/prompts.ts](../src/prompts.ts) |
| HTTP server, routing, status codes | [../src/server.ts](../src/server.ts) |
| Tests | [../test/discover.test.ts](../test/discover.test.ts), [../test/server.test.ts](../test/server.test.ts) |

## Request

```
POST /api/discover
Content-Type: application/json
```

```json
{ "idea": "I want to build an app for students to find hackathon teammates" }
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `idea` | `string` | yes | Free text. A sentence, a paragraph, or a rough brain dump. Trimmed; must not be blank. |
| `discovery` | object | no | The discovery object from a previous call. Makes this a refinement of that object rather than a fresh start. Also accepted as `priorDiscovery`. |
| `answers` | see below | no | What the user said in reply to the previous call's `followUpQuestions`. Requires `discovery`. |

`answers` takes three shapes, because three are natural:

```json
"answers": "It's for any student, web only, no budget yet"
"answers": ["any student", "web only"]
"answers": { "Is this for a specific university?": "any student" }
```

The object form is the least ambiguous and the best choice for a UI layer. The
array form is matched positionally against the questions from the prior object,
and each answer is labelled with the question it answers before the model sees
it, so ordering is never guessed at.

## Response

`200` with the discovery object, and nothing wrapped around it:

```json
{
  "problem": "...",
  "targetAudience": "...",
  "userNeed": "...",
  "goals": [],
  "constraints": [],
  "assumptions": [],
  "missingInformation": [],
  "followUpQuestions": []
}
```

A caller decides sufficiency with `missingInformation.length === 0`. That is not
returned as a separate field, so the body stays exactly the contract shape;
`isDiscoverySufficient()` is exported for callers using the library.

### Status codes

| Code | When |
|---|---|
| `200` | The discovery object. |
| `400` | Bad request: no `idea`, unparseable JSON, a malformed prior object (the error names the offending field), or `answers` with no `discovery` beside them. |
| `404` | Unknown path. The error names the real endpoint. |
| `405` | Wrong method. Carries an `Allow` header. |
| `413` | Body over 1 MB. |
| `500` | Unexpected failure. Generic message — internals are logged, not returned. |
| `502` | The request was fine but the model call did not produce a usable answer (a refusal, or a response that failed the schema). |

`GET /health` returns `{"status":"ok"}`. CORS is permissive so a separate UI dev
server can call the endpoint without a proxy; narrow it before exposing the
service beyond localhost.

## Three decisions the spec left open

**`assumptions` is an eighth field.** The spec's output table lists seven, and
notes on the `BrandState` mapping that `assumptions` should be populated "from
anything the AI inferred rather than was told, if you want to track that
distinction". Tracking it is worth doing — it is what lets a later phase see
which parts of discovery rest on a guess — and the only reliable way to know what
was inferred is to ask the model as it writes. So `assumptions` is requested
directly rather than reconstructed afterwards. The addition is additive: the
seven documented fields are unchanged, so a consumer reading only those is
unaffected.

**`openQuestions` prefers the question over the gap.** The spec pairs
`missingInformation` and `followUpQuestions` "roughly", so they are parallel by
convention rather than guarantee. The mapping takes the question at the matching
index, falls back to the gap itself where no question was written, and appends any
question with no gap beside it. Nothing outstanding is dropped under any pairing.

**A prior object with no answers is treated as a fresh call.** There is nothing to
merge, so re-sending the idea alone is the honest behaviour rather than asking the
model to "merge" an empty set of answers into what it already said.

## Re-invocation

The loop the spec describes:

1. First call, `idea` only → an initial object with a non-empty
   `missingInformation` and `followUpQuestions`.
2. The user answers some of the questions.
3. Later call with `idea`, `discovery` and `answers` → the answers are merged in,
   resolved gaps and their questions drop out, and only what is still unresolved
   is asked about.

Repeat until `missingInformation` is empty, or the user chooses to proceed with
what they have. Only then is `discovery` handed to Phase 3.

The re-invocation prompt is explicit that this is a refinement and not a fresh
start: established content survives unless an answer contradicts it, an answer
that supersedes an inference drops the matching assumption, new gaps that answers
raise are added, and an unanswered question is kept rather than quietly dropped.

## Mapping into `BrandState`

`toDiscoverySection()` drops the two working fields, which belong to the
discovery conversation rather than to `BrandState`:

| DISCOVER | `BrandState.discovery` |
|---|---|
| `problem`, `targetAudience`, `userNeed`, `goals`, `constraints`, `assumptions` | carried across unchanged |
| `missingInformation` + `followUpQuestions` | merged into `openQuestions` |

## One conflict this phase resolved

`DiscoverySchema.goals` previously required at least one entry. Phase 2 states
that empty arrays are valid output and that an honest, sparse result is correct
behaviour, not a bug — so the minimum was removed from `goals`, `constraints`,
`assumptions` and `openQuestions`. The fields still reject empty strings inside
them, so a padded array is still a failure; an empty one is not.

## The pipeline uses this too

`runStep(deriver, state, 'discovery')` goes through `discover()` and
`toDiscoverySection()` rather than asking for the `BrandState` section directly,
so the pipeline and the endpoint share one prompt and one schema and cannot drift
apart. The pipeline takes the first pass only — answering follow-up questions is a
conversation the endpoint drives, and whatever is still unresolved arrives in the
state as `openQuestions`.
