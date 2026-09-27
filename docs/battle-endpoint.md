# BRAND BATTLE — `POST /api/battle`

Implementation notes for Phase 4. Records how the spec maps onto the code, the
decisions it left open, and the one place it contradicts Phase 1.

Depends on [discover-endpoint.md](discover-endpoint.md) and, optionally,
[position-endpoint.md](position-endpoint.md). Feeds `BrandState.strategyOptions` and
`BrandState.selectedStrategy` — see [brandstate-spec.md](brandstate-spec.md).

## Where it lives

| Concern | File |
|---|---|
| Archetype vocabulary, distance, spread, overlap | [../src/archetypes.ts](../src/archetypes.ts) |
| Generation, distinctness check, targeted rebuild, selection | [../src/battle.ts](../src/battle.ts) |
| `StrategyOptionSchema`, `BattleResultSchema`, `SelectedStrategySchema` | [../src/schemas.ts](../src/schemas.ts) |
| `BATTLE_INSTRUCTIONS`, batch and rebuild prompts | [../src/prompts.ts](../src/prompts.ts) |
| `resolveSelectedStrategy`, prompt serialization | [../src/state.ts](../src/state.ts) |
| Tests | [../test/battle.test.ts](../test/battle.test.ts), [../test/server.test.ts](../test/server.test.ts) |

## Request

```json
{
  "discovery": { "problem": "...", "targetAudience": "...", "...": "..." },
  "positioning": { "category": "...", "...": "..." },
  "directions": ["CONNECTION", "OUTCOMES", "COMPETITION"],
  "count": 3
}
```

| Field | Required | Notes |
|---|---|---|
| `discovery` | yes | The grounding facts. Every strategy must trace back to it. |
| `positioning` | no | An anchor. With it, each strategy is a variant of one value proposition; without it, each derives its own straight from discovery — useful for exploring before committing to Phase 3's single answer at all. |
| `directions` | no | Force the archetypes. Case-insensitive; duplicates rejected. |
| `count` | no, default 3 | Between 2 and 7. Rejected if it disagrees with an explicit `directions` list. |

## Response

A bare JSON array, one strategy per direction, in the order the directions were
assigned:

```json
[
  {
    "direction": "CONNECTION",
    "positioning": "...",
    "strengths": ["..."],
    "risks": ["..."],
    "audienceFit": "...",
    "differentiation": "...",
    "rationale": ["..."]
  }
]
```

Nothing in the response ranks, scores or recommends — there is no `score`, `rank` or
`recommended` field, and a test asserts their absence. Choosing is a separate,
explicit act.

| Code | When |
|---|---|
| `200` | The array of strategies. |
| `400` | Missing or invalid `discovery`, an invalid `positioning`, an unknown or duplicated direction, a bad `count`, or a `count` that disagrees with `directions`. |
| `502` | The strategies were still not meaningfully different after rebuilding. The body carries `collisions` naming which collided with what. |

## The seven directions

| Direction | Core appeal |
|---|---|
| `CONNECTION` | Belonging, community, relationships |
| `OUTCOMES` | Efficiency, results, getting it done |
| `COMPETITION` | Status, ambition, winning |
| `TRUST` | Safety, reliability, reduced risk |
| `ACCESSIBILITY` | Ease, inclusion, a low barrier to entry |
| `CRAFT` | Quality, expertise, mastery |
| `REBELLION` | Against the status quo and the incumbents |

Each carries a position on four axes — individual/collective,
functional/emotional, with-the-grain/oppositional, safety/ambition. The axes are a
deliberate simplification whose only job is to let directions be picked far apart;
nothing downstream treats them as a theory of branding.

`chooseDirections(count)` maximises the **minimum** pairwise distance across the
chosen set. Maximising the average would happily pair two neighbours with one
outlier; the minimum is what "maximally distant" has to mean for a set. The
vocabulary is small enough to check every combination exactly (35 of them for the
default of 3), so the result is exact and deterministic rather than approximated.

The default trio is `CONNECTION, COMPETITION, TRUST`, with a spread of 0.990 — wider
than the spec's worked example of `CONNECTION, OUTCOMES, COMPETITION` at 0.776. That
is the spec's own instruction being followed ("maximally distant… not just the first
3"), and `directions` forces the example's trio when you want it.

## Enforcing "meaningfully different"

This is the hard part, and it is enforced in three places rather than asked for once.

**Before generation.** Archetypes are chosen to be far apart, so divergence is
structural rather than something the model has to remember.

**During generation.** The batch is produced in one call, so the model differentiates
as it writes rather than generating three strategies in ignorance of each other.

**After generation.** All four of the spec's checks run against the result:

| Check | How |
|---|---|
| 1. Direction uniqueness | String comparison. Structurally prevented upstream, verified anyway. |
| 2. Audience divergence | Overlap of `primarySegment` above 0.6. |
| 3. Risk divergence | Overlap of the `risks` lists above 0.5. |
| 4. No shared unique selling point | Overlap of `uniqueClaim` above 0.5. |

Plus two rules from the prompt-design section that would otherwise go unenforced: a
`risks` list that is present but empty of content, and a `positioning` longer than
four sentences.

Comparison happens over **short canonical fields the model is asked to write for the
purpose** — `uniqueClaim`, the underlying bet in one plain line, and
`primarySegment`, a few words naming who it is for. Both are stripped before the
response goes out, following DISCOVER's `missingInformation` precedent. This matters:
comparing whole paragraphs lexically would miss the same idea in different words,
which is exactly the failure mode. Two strategies making the same bet tend to reach
for the same few words when forced to state it plainly in one line.

Overlap is Jaccard similarity over content words, stopword-filtered and stemmed.
Stemming is load-bearing — without it "we verify members" and "verifying the members"
read as different claims, and a model rewording a claim naturally changes
inflections. The stemmer is shallow on purpose so it cannot collapse genuinely
different short words.

**Rebuild is targeted.** When a check fails, only the offending strategy is
regenerated, and it is told exactly what it collided with and on which axis — quoting
the other strategy's claim back at it. Regenerating the whole batch would discard
work that passed, and "make them more different" produces cosmetic edits. When two
strategies collide, only the **later** one is blamed, so the earlier is a fixed thing
to differ from. The rebuild prompt also forbids resolving the overlap by going
vaguer, which is the easy way out.

If strategies still collide after their rebuild, the request fails with a `502`
rather than returning options the check says are the same idea twice.

## `BrandState` integration

Two schema additions, both as the spec recommends:

```ts
strategyOptions: StrategyOption[];        // every candidate, including the ones not picked
selectedStrategy?: {
  direction: Direction;                   // a pointer into strategyOptions
  chosenAt: string;                       // ISO 8601
  reasonChosen?: string;
};
```

`selectedStrategy` **references** rather than copies, so there is exactly one copy of
the chosen strategy's detail and no way for the two to drift.
`resolveSelectedStrategy(state)` does the lookup and returns `undefined` when nothing
has been chosen — deliberately, rather than falling back to `strategyOptions[0]`.
Quietly defaulting to the first option would turn "nobody has decided" into "the
first candidate wins", which is the rubber-stamping this phase exists to prevent.
`hasDanglingSelection` reports a pointer to a direction no longer in the options.

Downstream steps are held to this structurally: once a direction is chosen,
`serializeForPrompt` sends the resolved strategy in full and **omits the rejected
candidates entirely**. A later step cannot develop one that was not picked, because it
never sees them.

The full battle stays on record, so `brandstate show` prints every option with the
chosen one marked — the road not taken does not disappear behind the decision.

## Selection is never the model's

`selectStrategy(options, direction, reason?)` is the only way a choice is recorded,
and it needs a caller. In the pipeline, the `selectedStrategy` step has no model call
at all: it throws `StrategySelectionRequiredError` with the available directions.

That makes `brandstate run` a two-part flow, which is a real change to how it
behaves:

```bash
brandstate run "an idea"              # stops at the checkpoint, saves the work so far
brandstate show                       # read the three strategies
brandstate select TRUST --reason "…"  # a person decides
brandstate run "an idea"              # resumes and finishes
```

`run` now loads an existing run file and resumes from it, and the work done before the
checkpoint is saved rather than lost with the error.

## Decisions the spec left open

**Where naming selection went.** Phase 1's `selectedStrategy` held a chosen name,
tagline and naming territory. Phase 4 redefines the field as a direction pointer, so
that decision needed a home: it moved into `finalBrand`, which already outputs `name`
and `tagline` and is defined as the locked package. `finalBrand` now chooses from the
naming territories and tagline directions that `shape` explored. `stressTests`
correspondingly now tests the leading candidates in `shape` rather than a
single already-chosen name.

**The count bounds.** Below 2 there is nothing to compare, and above 7 the vocabulary
runs out. Both are rejected with an explanation rather than clamped.

**A `count` that disagrees with `directions`** is an error, not something to resolve
silently in either field's favour.

**Thresholds are configurable** (`battle: { thresholds: … }` on the server) because
they are tuned judgements, not facts. The defaults are deliberately loose enough that
two strategies may share a word.

## The conflict with Phase 1

Phase 1's suggested flow was: derive `shape` and `visualDirection` from positioning,
*then* narrow into `selectedStrategy`. Phase 4 reverses that — a direction is chosen
first, and only then developed ("Depth comes later, once one direction is chosen and
moves into Phase 5").

`SECTION_ORDER` now follows Phase 4:

```
discovery → positioning → strategyOptions → selectedStrategy
          → shape → visualDirection → stressTests → consistency → finalBrand
```

Phase 4 is the later and more specific spec, and the reversal is the point:
developing three directions in full and then picking one wastes most of the work, and
picking after the fact tends to rubber-stamp whatever was already built. `shape`,
`visualDirection`, `stressTests` and `consistency` all now depend on
`selectedStrategy`, and their instructions were rewritten to develop the chosen
direction rather than a direction-agnostic average of all of them.
