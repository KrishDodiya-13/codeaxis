# STRESS TEST — `POST /api/stress-test`

Implementation notes for Phase 5. Records how the spec maps onto the code, the
decisions it left open, and what it replaced.

Depends on [battle-endpoint.md](battle-endpoint.md). Feeds `BrandState.stressTests`
and gates `BrandState.finalBrand`.

## Where it lives

| Concern | File |
|---|---|
| Validation, summary, gate, evidence checks, re-run triggers | [../src/stress.ts](../src/stress.ts) |
| `StressTestSchema`, `StressTestResultSchema`, `TypeEvaluationSchema` | [../src/schemas.ts](../src/schemas.ts) |
| `STRESS_INSTRUCTIONS` and the retry prompt | [../src/prompts.ts](../src/prompts.ts) |
| The `finalBrand` gate | [../src/steps.ts](../src/steps.ts) |
| Tests | [../test/stress.test.ts](../test/stress.test.ts), [../test/server.test.ts](../test/server.test.ts) |

## Request

```json
{
  "selectedStrategy": { "direction": "COMPETITION", "...": "..." },
  "brandState": { "project": {}, "discovery": {}, "...": "..." },
  "scope": ["cliché", "messaging"]
}
```

| Field | Required | Notes |
|---|---|---|
| `brandState` | yes | The whole state as it stands. Sections may be empty. |
| `selectedStrategy` | effectively no | The strategy to test. Omitted, it is resolved from `brandState.selectedStrategy` — a caller holding a complete state should not have to send the same object twice. Errors if neither is available. |
| `scope` | no | Restrict to specific test types, for a cheap re-check after a small edit. De-duplicated; an empty array is rejected rather than treated as "all". |

## Response

```json
{
  "tests": [ { "type": "...", "severity": "...", "issue": "...", "evidence": "...", "impact": "...", "recommendation": "..." } ],
  "summary": { "critical": 0, "high": 1, "medium": 2, "low": 1, "blocksFinalization": true },
  "evaluatedTypes": { "cliché": "evaluated", "contradiction": "partial — shape/visualDirection incomplete" }
}
```

| Code | When |
|---|---|
| `200` | The findings. An empty `tests` array is a success, not a failure. |
| `400` | Invalid `brandState`, no strategy to test, or an unknown/empty `scope`. |
| `502` | Findings came back that cannot be audited, after a retry. The body carries `problems`. |

## What is computed rather than asked for

**The summary.** The model is never asked for its own severity counts, because a
model that reports its own totals can disagree with the findings it just wrote.
`summarize()` derives them, and `blocksFinalization` with them.

**The gate.** `blocksFinalization` is true while any **open** finding sits at
`critical` or `high`. Counts cover every finding regardless of status, because they
describe what the test found; the gate looks only at open ones, because an accepted
trade-off is not a blocker.

**Missing evaluations.** A test type the model failed to report on is recorded as
`not-testable` with the reason stated, never left absent — a missing entry would read
as a pass, which is the false sense of security `evaluatedTypes` exists to prevent.

## The evidence bar is enforced, not just requested

Two of the five prompt-design rules can be checked deterministically, so they are:

- **Evidence must cite field paths.** `citesFieldPath` requires something like
  `shape.personality` or `discovery.targetAudience`, including indexed forms such as
  `strategyOptions[2].positioning`. A bare section name or "the tone feels off" does
  not pass. A finding that cannot be traced to fields cannot be verified or fixed.
- **Impact must not restate the issue.** Measured as lexical overlap between the two
  (the same measure Phase 4 uses for claim collisions), with a loose threshold of 0.7
  so sharing subject matter is fine but saying the same thing twice is not.

Failing either triggers one retry with the offending findings quoted back
individually — a general "cite your evidence" reliably produces findings that name a
section without naming fields, which is the same unauditable output one step removed.
The retry also says not to drop a finding to avoid fixing it. Still failing is a
`502`: returning unauditable findings would make the phase decorative.

Severity consistency and whether a finding was manufactured are judgements no code
here can make. Those live in the instructions, and they are the part that needs a real
model run to validate.

## The finalization gate

`finalBrand` will not populate while a blocking finding is open. In the pipeline the
step throws `FinalizationBlockedError` **before calling the model**, so a blocked run
costs nothing.

Two ways past it, and both are human acts:

```bash
brandstate findings                              # what is open, and what blocks
brandstate acknowledge contradiction             # accept the trade-off knowingly
brandstate acknowledge cliché --resolved         # or record it as fixed
brandstate stress-test --scope contradiction     # re-test after an actual fix
```

`acknowledge` matches findings on type and issue text rather than by index, so a
re-run that reorders findings cannot reassign somebody's decision to a different
finding.

A full `brandstate run` now has **two** human checkpoints: choosing a direction
(Phase 4) and dealing with blocking findings (this phase). That is the intent —
the gate exists so nothing gets locked in unexamined.

## Scoped re-runs preserve decisions

A scoped run replaces only the findings for the types it covered. Findings of other
types — including ones already acknowledged — survive untouched. Findings the model
returns outside the requested scope are dropped, so a scoped re-run cannot quietly
overwrite a decision about a type it was told to leave alone.

`shouldRerunStressTests(before, after)` maps a change to the narrowest scope that
covers it, so a re-check after a small edit does not cost the full suite:

| Changed | Re-run |
|---|---|
| `selectedStrategy` / `strategyOptions` | all five |
| `discovery` | audienceMismatch, differentiation, contradiction, messaging |
| `positioning` | cliché, differentiation, contradiction, messaging |
| `shape` | cliché, contradiction, messaging |
| `visualDirection` | contradiction |

## Decisions the spec left open

**`selectedStrategy` is optional in practice.** The spec lists it as required, but the
state already records which direction was chosen, and making a caller extract and
re-send it invites the two copies to disagree. It is resolved from the state when
omitted, and an explicit value still wins.

**`evaluatedTypes` on the wire is the spec's flat string map.** Internally it is
structured (`{type, status, note}`), which is what a caller wanting to branch on
`partial` actually needs — so the library exposes `evaluations` alongside, and the HTTP
body carries only the documented strings.

**Findings outside the requested scope are dropped, not returned.** Returning them
would silently overwrite decisions recorded against types the caller excluded.

**No provenance hash is stored.** Phase 3 put `sourceDiscoveryHash` on `positioning`
because the section is an object with room for it; `stressTests` is a bare array with
nowhere to put one without deviating from the documented schema. Re-run detection is
therefore a function of two states rather than a stored marker. A caller that wants
automatic staleness detection across sessions can persist the comparison itself; the
trade-off is noted rather than hidden.

**The gate is open when no test has run.** `canFinalize` only knows about findings, so
a state with no stress test does not block. The pipeline makes this moot by depending
on `stressTests` before `finalBrand`, but a library caller assembling a state by hand
should know the gate is not a substitute for running the test.

## What this replaced

Phase 1's `stressTests` had a different shape entirely — `dimension`, `scenario`,
`finding`, `passed`, and severity without `critical`. Phase 5 redefines the section,
so the type, both schemas, the fixtures and the Markdown rendering were all rewritten.
The report no longer renders findings as a table: severity ordering, the gate line and
the status marker matter more than compactness, and a finding's `impact` and
`recommendation` are too long for a table cell.

`finalBrand` also gained `shape` and `stressTests` as declared dependencies, since it
now reads the findings and picks the name from the territories `shape` explored.

## Non-goals, as implemented

- **Does not fix anything.** The instructions forbid rewriting the positioning,
  strategy or personality; the step returns findings only.
- **Does not judge aesthetics.** Color contrast and layout are ruled out in the
  prompt as a design-review concern.
- **Does not decide what is worth fixing.** That is `status`, set by a person through
  `acknowledgeFinding` — never by the model, which is told to leave the field out.
