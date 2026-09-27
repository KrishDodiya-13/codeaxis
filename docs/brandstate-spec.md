# BrandState — Central Brand Object

> The original specification this implementation was built from, kept for reference.
> Where the implementation refines it, [../README.md](../README.md) says so under
> "Where the implementation refines the spec".

The `BrandState` is the single source of truth for the AI's understanding of the brand. Every subsequent AI call reads from and writes back to this object, so decisions made early (positioning, tone, visual direction) persist and inform every later step instead of being re-derived or forgotten.

## Schema

```ts
type BrandState = {
  project: {
    idea: string;
    productType?: string;
    goal?: string;
  };

  discovery: {
    problem: string;
    targetAudience: string;
    userNeed: string;
    goals: string[];
    constraints: string[];
    assumptions: string[];
    openQuestions: string[];
  };

  positioning: {
    category: string;
    valueProposition: string;
    differentiator: string;
    competitiveAngle: string;
    rationale: string[];
  };

  shape: {
    personality: string[];
    principles: string[];
    namingTerritories: unknown[];
    taglineDirections: unknown[];
    messagingHierarchy: unknown[];
  };

  visualDirection: {
    colors: string[];
    typography: string;
    imagery: string;
    shapes: string;
    mood: string;
    avoid: string[];
  };

  selectedStrategy?: unknown;

  stressTests: unknown[];

  consistency: unknown;

  finalBrand?: unknown;
};
```

## Why this exists

Without a shared state object, each AI call re-derives context independently, which leads to drift and contradictions (e.g. one call picking a playful tone while another assumes a clinical one). By threading one `BrandState` through the whole pipeline:

- Every call gets the full, current context (`discovery` → `positioning` → `shape` → `visualDirection` → ...) rather than starting cold.
- Decisions are made once and recorded, not re-litigated at each step.
- The state can be inspected, diffed, or rolled back at any point in the pipeline.

## Section breakdown

| Section | Purpose |
|---|---|
| `project` | The raw seed — what the user is building and their stated goal. |
| `discovery` | Problem space: audience, need, goals, constraints, assumptions, and unresolved questions. |
| `positioning` | Where the brand sits in the market and why. |
| `shape` | The brand's personality and voice — naming, tagline, and messaging exploration. |
| `visualDirection` | The look and feel: color, type, imagery, shape language, mood, and what to avoid. |
| `selectedStrategy` | The chosen direction once options have been narrowed down. |
| `stressTests` | Checks run against the strategy (e.g. does it hold up against competitors, edge cases, misreadings). |
| `consistency` | Cross-check results ensuring positioning, shape, and visual direction don't contradict each other. |
| `finalBrand` | The finished, locked brand package. |

## Suggested flow

1. Populate `project` and `discovery` from the initial brief/conversation.
2. Derive `positioning` from `discovery`.
3. Derive `shape` and `visualDirection` from `positioning`.
4. Narrow into `selectedStrategy`.
5. Run `stressTests` and `consistency` checks against `selectedStrategy`.
6. Lock `finalBrand` once everything passes.

Each step's AI call should receive the entire `BrandState` so far as input, and return an updated `BrandState` (or just the delta for that section) as output — never regenerating earlier sections unless explicitly asked to revise.
