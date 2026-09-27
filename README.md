# BrandState

A brand strategy pipeline built around a single threaded state object.

One `BrandState` is the source of truth for everything the model knows about the
brand. Each step reads the whole state, writes exactly one section, and hands it
on — so positioning decided in step two still governs the visual direction in
step four, instead of being re-derived and quietly contradicted.

Built from [docs/brandstate-spec.md](docs/brandstate-spec.md).

## Install

```bash
npm install
npm run build
```

Requires Node 22.18 or newer (the test suite runs `.ts` files directly through
Node's type stripping).

Credentials resolve the way the Anthropic SDK resolves them: `ANTHROPIC_API_KEY`,
`ANTHROPIC_AUTH_TOKEN`, or a profile from `ant auth login`. Copy `.env.example`
if you want to keep a key in the project, or export it in your shell.

## Use it from the command line

```bash
# Run the whole pipeline and save the run.
node dist/cli.js run "A tool that turns a service business into a sellable product" \
  --type "B2B SaaS" --md brand.md

# Stop partway, look at it, then continue.
node dist/cli.js run "..." --until positioning
node dist/cli.js show
node dist/cli.js step shape

# Where did it get to?
node dist/cli.js status

# Discard a decision and everything downstream of it, then re-derive.
node dist/cli.js rollback shape
node dist/cli.js step shape

# Check a hand-edited run against the schemas, or compare two runs.
node dist/cli.js validate
node dist/cli.js diff other-run.json
```

Every command reads and writes one run file (`runs/brand.json` by default,
`--run` to change it), so a pipeline can be stopped, inspected, edited by hand,
rolled back and resumed across invocations. `node dist/cli.js help` lists the
full set of options.

## Use it as a library

```ts
import { brandFromIdea, renderMarkdown } from './dist/index.js';

const { state, usage } = await brandFromIdea(
  { idea: 'A tool that turns a service business into a sellable product', productType: 'B2B SaaS' },
  { effort: 'high', onStepFinish: (step) => console.log(`${step.label} done`) },
);

console.log(renderMarkdown(state));
console.log(`${usage.cacheReadTokens} tokens read from cache`);
```

Finer-grained control, when you want to drive the steps yourself:

```ts
import { BrandClient, createInitialState, runStep, rollbackTo, validateState } from './dist/index.js';

const client = new BrandClient({ effort: 'medium' });
let state = createInitialState({ idea: '...' });

state = (await runStep(client, state, 'discovery')).state;
state = (await runStep(client, state, 'positioning')).state;

// Not happy with the positioning? Drop it and everything after it.
state = rollbackTo(state, 'positioning');

validateState(state); // { valid: true } or the offending section and field
```

`runPipeline` takes any object with a `deriveSection` method, so tests and
alternative backends substitute for `BrandClient` without touching the steps.

## How the state is threaded

The pipeline runs in a fixed order, each step depending on the ones before it:

```
project → discovery → positioning → shape → visualDirection
        → selectedStrategy → stressTests → consistency → finalBrand
```

Four rules make the threading trustworthy:

**One section per step.** `applyDelta` is the only way a section changes, and it
writes exactly one. A step cannot reach sideways into another section, so a later
step cannot quietly rewrite an earlier decision.

**Nothing is mutated.** Every step returns a new state and deep-copies what it
writes. The orchestrator keeps a snapshot from before each step, and those
snapshots stay valid because nothing can reach back into them.

**Only derived sections are sent.** `serializeForPrompt` omits sections that have
not been reached yet. Empty scaffolding in a prompt is noise, and it invites the
model to fill in a section it was not asked for.

**Dependencies are declared, not assumed.** Each step names the sections it reads
(`stressTests` needs `selectedStrategy`; `finalBrand` needs
`selectedStrategy`, `visualDirection` and `consistency`), so a single step can be
re-run against a partial state and will refuse if its inputs are missing.

`rollbackTo` resets a section and everything after it while leaving earlier
decisions untouched, which is what makes an unsatisfying step recoverable without
starting over.

## Design notes

**Structured output, not parsed prose.** Each step asks for its section as a
JSON schema (`output_config.format` via `zodOutputFormat`), so a response is
schema-valid before it reaches the state. The `.describe()` text on every schema
field is not documentation — it is carried into the schema the model sees, so it
is the field-level instruction for that step.

One trap worth knowing, since it is invisible when it bites: zod's JSON Schema
emitter deduplicates identical schema *instances* into a shared `$defs` entry and
collapses their descriptions. Reusing one `z.string().min(1)` constant across
fields therefore throws away every per-field description before it reaches the
model. `schemas.ts` uses a `text(description)` factory so each field gets a fresh
instance, and a test asserts that every field of every section still carries its
description.

**Two schemas per section, doing two jobs.** `BrandStateSchema` enforces content
minimums and describes a *finished* brand. `BrandStateFileSchema` checks the same
fields structurally, with the minimums dropped, because a run in progress
legitimately has empty sections it has not reached. Loading a run uses the
structural one; `validateState` then checks content for the sections actually
derived. A test compares the two field-by-field so they cannot drift apart.

**Prompt caching.** Every request is `[METHODOLOGY, <step instructions>]` in the
`system` array, with the cache breakpoint on `METHODOLOGY` — byte-identical on
every call in every run — and everything volatile after it. `stableStringify`
sorts object keys so an unchanged state never serializes two different ways,
which is the usual silent cache invalidator.

The state itself is not cached, and deliberately so: it changes on every step by
design, so caching it would never hit. The win is the shared prefix. Whether it
actually caches depends on the model's minimum cacheable prefix length, so the
run reports `cacheReadTokens` and the CLI says so explicitly when nothing was
served from cache, rather than letting you assume it worked.

**Model configuration.** `claude-opus-5` with adaptive thinking and `high`
effort, overridable per run (`--model`, `--effort`, `--max-tokens`). Refusals and
`max_tokens` truncation are detected and raised as typed errors rather than
surfacing as a half-parsed section.

## Where the implementation refines the spec

The spec types the exploratory fields as `unknown` — `namingTerritories`,
`taglineDirections`, `messagingHierarchy`, `selectedStrategy`, `stressTests`,
`consistency`, `finalBrand`. Structured output needs something concrete to
validate against, so [src/types.ts](src/types.ts) gives each of them a real
shape. Every one is assignable to `unknown`, so this narrows the spec rather than
departing from it; the field names and section structure are unchanged.

## Tests

```bash
npm test        # 78 tests, no API key and no network
npm run typecheck
```

The suite covers the state operations (merge isolation, population detection,
diffing, rollback, deterministic serialization), the pipeline (ordering,
dependency enforcement, resume, snapshots, error handling), persistence, the
Markdown report, and the schemas.

`test/client.test.ts` runs `BrandClient` against a fake transport, so the request
body is checked without credentials: the model and thinking configuration, the
cache breakpoint sitting ahead of the volatile content, the generated JSON
schema, and the handling of refusals, truncation and unparseable responses.

**Not verified:** no live API call has been made against this code — there were
no credentials available in the environment it was built in. The request shape is
checked against the SDK's own types and asserted at the transport boundary, but
the first real run is still the first real run.
