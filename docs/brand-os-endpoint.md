# FINAL BRAND OS — `POST /api/brand-os`

Implementation notes for Phase 7, the last phase. Records how the spec maps onto the
code, answers its two open questions, and notes where its request example is out of
date.

Depends on everything. Reads the whole `BrandState` — see
[brand-dna-contract.md](brand-dna-contract.md).

## Where it lives

| Concern | File |
|---|---|
| Validation, compilation, readiness, completeness | [../src/brandos.ts](../src/brandos.ts) |
| `BrandOsDraftSchema`, `BrandOsSchema` | [../src/schemas.ts](../src/schemas.ts) |
| `BRAND_OS_INSTRUCTIONS` and the prompt | [../src/prompts.ts](../src/prompts.ts) |
| Tests | [../test/brandos.test.ts](../test/brandos.test.ts), [../test/server.test.ts](../test/server.test.ts) |

## Request

```json
{
  "brandId": "11111111-2222-3333-4444-555555555555",
  "brandState": { "id": "...", "schemaVersion": "1.0.0", "...": "..." },
  "allowUnvalidated": false
}
```

| Field | Required | Notes |
|---|---|---|
| `brandState` | yes | The full state. Must satisfy the Phase 6 contract; an older stored object needs `migrate` first. |
| `brandId` | no | Defaults to `brandState.id`. If supplied and it disagrees with the state, the request is **rejected** rather than resolved in either field's favour — silently picking one is how the wrong brand gets shipped. |
| `allowUnvalidated` | no, default `false` | Compile despite open blocking findings. The result is marked `not-ready` and the findings appear in `openFlags`. |

### The spec's request example is out of date

It shows `brandState.shape` and `brandState.stressTest`. Phase 6 retired `shape`
(split into `personality`, `naming`, `voice`) and the section is `stressTests`. The
spec says to align with what actually exists, so this endpoint reads the Phase 6
contract. A stored state on the old shape is migrated automatically on load.

## Response

```json
{
  "brandId": "...",
  "brandOS": {
    "strategy": { "purpose": "...", "mission": "...", "vision": "...", "targetAudience": "...",
                  "coreSegments": ["..."], "positioningStatement": "...", "competitiveDifferentiation": "..." },
    "identity": { "name": "...", "nameRationale": "...", "coreValues": ["..."],
                  "personalityTraits": ["..."], "archetype": "..." },
    "visual":   { "logoDirection": "...", "colorPalette": ["..."], "typographySystem": "...", "imageryStyle": "..." },
    "voice":    { "toneGuidelines": ["..."], "messagingPillars": ["..."], "taglines": ["..."],
                  "sampleCopy": { "headline": "...", "boilerplate": "..." } },
    "launch":   { "goToMarketSummary": "...", "keyChannels": ["..."],
                  "rolloutSequence": [{ "milestone": "...", "timing": "...", "detail": "..." }] },
    "validation": { "stressTestSummary": {}, "risks": ["..."], "openFlags": ["..."],
                    "readiness": { "score": 67, "label": "ready-with-caveats", "checklist": [] } }
  }
}
```

| Code | When |
|---|---|
| `200` | The deliverable. |
| `400` | Invalid `brandState`, a `brandId` that disagrees with it, or a non-boolean flag. |
| `422` | The state is not finished enough to compile (body carries `missing`), or blocking stress-test findings are open (body carries `blocking`). |
| `502` | Compiling produced an empty required field after a retry (body carries `emptyFields`). |

## Compiled, not regenerated

Most of the deliverable is a projection of decisions already made and already
stress-tested, so those fields are assembled in code and the model never sees them as
its own to write. It is asked only for what nothing earlier produced:

| Generated | Compiled from state |
|---|---|
| `purpose`, `mission`, `vision` | `targetAudience` ← `discovery` |
| `coreSegments` | `positioningStatement` ← `finalBrand`, else the chosen strategy |
| `nameRationale` | `competitiveDifferentiation` ← `positioning` |
| `archetype` *(only if absent)* | `name`, `taglines` ← `naming` |
| `logoDirection` | `coreValues`, `personalityTraits`, `archetype` ← `personality` |
| `sampleCopy` | `colorPalette`, `typographySystem`, `imageryStyle` ← `visualDirection` |
| `launch` (all of it) | `toneGuidelines`, `messagingPillars` ← `voice` |
| | `validation` (all of it) ← `stressTests` + `consistency` |

Two things follow. A signed-off decision cannot be rewritten on the way out — the
archetype in the state wins over the draft's, and the locked positioning statement wins
over the strategy's. And the validation section is arithmetic, so the readiness it
reports cannot flatter the brand it describes.

The unchosen taglines are kept alongside the selected one, with the selected first.
A deliverable that hides the alternatives makes the choice unauditable later — the same
reason Phase 4 keeps the rejected strategies.

## Readiness is computed, never asserted

A confidence score a model writes about its own work is worth nothing, so
`assessReadiness` is a six-item checklist over the state:

- every section derived, and the name and tagline chosen
- no blocking stress-test findings open
- a stress test has actually been run
- the consistency check passed
- medium and low findings addressed
- the brand locked (`finalBrand` populated)

The score is the proportion that passed. The label is **not** derived from the score
alone: a blocking finding forces `not-ready` regardless of how the rest scores, because
the point of a gate is that unrelated checks passing cannot outvote it. `ready` requires
every check; anything else with no blocker is `ready-with-caveats`.

`risks` lists findings still open. `openFlags` is separate and lists things a reader
must know about even though they are not open — blocking findings when compiling a
draft, accepted trade-offs, and a consistency check that reported issues.

## Done criteria, as met

- **All six sections populated, no nulls or empty stubs.** `findEmptyFields` walks the
  compiled object and reports any blank string or empty array by path; compiling throws
  `IncompleteBrandOsError` rather than returning a stub. `risks` and `openFlags` are
  exempt, since empty is the correct value for a clean brand.
- **Works end-to-end against real earlier-phase output.** Verified by driving the
  actual pipeline from `createInitialState` through all eleven sections — standing in
  for the two human decisions — and compiling from the result. Six sections, schema
  valid, zero empty fields. See the caveat below on what "real" means here.
- **Response shape matches the contract**, so a frontend can consume it unchanged.
  `BrandOsSchema` is the machine-readable version of the table above.

## The two open questions, answered

**Field-level schema for each section** — aligned to the `BrandState` sub-objects that
exist after Phase 6, as the spec asks. The mapping table above is the answer; where the
spec named a concept with no home in the state (logo direction, sample copy, the whole
launch section) it is generated.

**Persist `brandOS`, or return it only?** — **Return only.** The Brand OS is a
*projection* of the state: every field is either copied from a branch or freshly
generated. Persisting it would create a second source of truth that goes stale the
moment any branch is edited, which is the exact failure the Phase 3 provenance hash
exists to catch. `finalBrand` is already the locked snapshot for "what did we ship";
the Brand OS is how it is presented.

Adding a `brandOS` field to `BrandState` would also be a contract change, and Phase 6 is
explicit that those are a conversation before a commit — so this is a recommendation,
not something added silently. `brandstate brand-os --out path.json` writes the
deliverable to its own file, which covers the export case without a second copy inside
the state.

## Using it

```bash
brandstate brand-os                       # print the deliverable, with the readiness checklist
brandstate brand-os --out brand-os.json   # write it to a file
brandstate brand-os --draft               # compile despite open blocking findings
```

The readiness checklist prints to stderr so the JSON on stdout stays pipeable.

## Non-goals, as implemented

- **Re-runs nothing.** No discovery, positioning or strategy logic executes; the
  instructions state that the decided fields are fixed and copied across without the
  model.
- **Does not gate-dodge.** The same rule `finalBrand` enforces applies here, because
  this is the artefact that actually leaves the building. `allowUnvalidated` makes the
  override explicit and the result says `not-ready`.
- **Does not edit the state.** `assembleBrandOs` is verified not to mutate the state it
  compiled from.
