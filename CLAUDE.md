# CLAUDE.md

# BRANDOS — CLAUDE CODE INSTRUCTIONS

You are working on **BRANDOS**, a 20-hour, 2-person hackathon project.

Read `ARCHITECTURE.md` before making architectural or product decisions.

---

# 1. PRODUCT CONTEXT

BRANDOS is:

> **An AI brand decision engine that transforms incomplete ideas into coherent brand systems, stress-tests the strategy, and produces a launch-ready Brand OS.**

Core workflow:

```text
ROUGH IDEA
→ DISCOVER
→ POSITION
→ SHAPE
→ VISUALIZE
→ BRAND BATTLE
→ STRESS TEST
→ CONSISTENCY
→ BRAND OS
```

This is NOT a generic chatbot or one-prompt brand generator.

---

# 2. PRIMARY ENGINEERING OBJECTIVE

Optimize for:

1. Working end-to-end product
2. Precise AI outputs
3. Strong structured AI workflow
4. Premium UI
5. Demo reliability
6. Fast implementation

Do NOT optimize for:
- architectural complexity
- number of AI agents
- number of dependencies
- number of pages
- number of features

---

# 3. TECHNOLOGY RULES

Use:

- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui
- PostgreSQL
- Prisma
- Zod
- one primary LLM provider
- Vercel deployment

Use React Flow/SVG for Brand DNA where appropriate.

Use Tremor only for useful analytics.

Use Aceternity / Magic UI / React Bits / 21st.dev / Origin UI / Motion Primitives selectively.

Do NOT add a new library without a concrete reason.

---

# 4. ARCHITECTURE RULE

Use a modular monolith.

Do NOT introduce:
- microservices
- separate AI servers
- queues
- Kubernetes
- unnecessary infrastructure
- complex event systems

The hackathon has 20 hours.

---

# 5. AI ARCHITECTURE

Do NOT implement a swarm of independent agents.

Use one workflow orchestrator with specialized stages:

```text
discover
position
shape
visualize
battle
stress-test
consistency
finalize
```

Each stage receives structured state from previous stages.

---

# 6. AI PRECISION RULES

These are mandatory.

## Never invent facts.

If the user did not provide something, classify it as:
- unknown
- assumption
- recommendation

Never present an assumption as a fact.

## Never make unsupported competitive claims.

Do not say:

> "Your competitors all do X"

unless we actually have retrieved evidence.

Instead:

> "This may be a differentiation risk because..."

## Ask focused questions.

Only ask a question if its answer could materially change the brand strategy.

## Keep outputs concise.

Do not produce unnecessary essays.

## Explain important decisions.

Every major recommendation should have a short rationale.

## Preserve approved decisions.

Once the user approves a decision, later stages must respect it unless the user explicitly changes it.

## Make uncertainty visible.

Use:

```text
high
medium
low
```

confidence where appropriate.

---

# 7. STRUCTURED OUTPUTS

Never depend on free-form model output when the application needs structured data.

Use Zod schemas.

Pipeline:

```text
LLM
 ↓
JSON parse
 ↓
Zod validation
 ↓
business-rule validation
 ↓
persist
 ↓
render
```

If validation fails:
- retry with a correction prompt
- never silently render malformed data

---

# 8. BRAND STATE

Maintain a structured BrandState.

Conceptually:

```ts
type BrandState = {
  project: ProjectState
  discovery: DiscoveryState
  positioning: PositioningState
  shape: ShapeState
  visual: VisualState
  voice: VoiceState
  battle: BrandBattleState
  stressTests: StressTest[]
  consistency: ConsistencyState
  finalBrand?: BrandOS
}
```

Do not pass an enormous chat history to every model call.

Pass the relevant structured state.

---

# 9. USER CONTROL

AI recommends.

User decides.

Meaningful decisions must support:

```text
Accept
Reject
Edit
```

Never silently replace user-approved strategy.

---

# 10. STRESS TEST RULES

Stress Test is the signature feature.

Tests:

- cliché
- audience fit
- differentiation
- contradiction
- message clarity
- positioning defensibility

Each result should contain:

```text
status
severity
issue
evidence
impact
recommendation
alternative
```

The UI must make these understandable in seconds.

---

# 11. DEPENDENCY UPDATE RULE

If the user changes an important decision:

```text
decision changed
 ↓
identify dependent decisions
 ↓
show affected areas
 ↓
recalculate only affected stages
 ↓
update Brand DNA
 ↓
re-run consistency
```

Do not regenerate the entire brand unnecessarily.

Example:

If audience changes:

```text
Audience
 ↓
Positioning
 ↓
Personality
 ↓
Voice
 ↓
Visual
```

The UI should show affected nodes.

---

# 12. UI PRINCIPLES

The UI should feel like:

**premium AI strategy workstation**

Not:
- generic SaaS dashboard
- ChatGPT clone
- neon cyberpunk template
- excessive glassmorphism
- component-library demo

Prioritize:

- strong typography
- whitespace
- visual hierarchy
- purposeful motion
- clear state
- interactive reasoning
- high-quality empty/loading states

---

# 13. MAIN PAGES

Required:

```text
/
 /new
 /project/[id]/discover
 /project/[id]/strategy
 /project/[id]/stress-test
 /project/[id]/consistency
 /project/[id]/brand-os
```

Do not create unnecessary pages.

---

# 14. STRATEGY PAGE

The Strategy page contains:

```text
Position
Shape
Visual
Brand Battle
Brand DNA
AI Reasoning
```

Do not create separate routes unless there is a strong UX reason.

---

# 15. BRAND DNA UI

The graph is a core interaction.

Nodes:

```text
Audience
Problem
Positioning
Value
Personality
Voice
Visual
Launch
```

Clicking a node should open:

- decision
- rationale
- source
- alternatives
- confidence
- status

The graph is not decoration.

It represents actual application state.

---

# 16. STRESS TEST UI

The hero interaction:

```text
TRY TO BREAK THIS BRAND
```

When clicked:

1. show active tests
2. animate progress
3. reveal findings
4. show severity
5. explain evidence
6. provide recommendation
7. let user accept/reject/edit

Do not fake the processing.

The API must actually run the stress-test workflow.

---

# 17. BRAND OS

The final page must look exportable and professional.

Sections:

```text
Overview
Strategy
Identity
Visual
Voice
Launch
Validation
```

Avoid dumping raw AI markdown into the page.

Use structured presentation.

---

# 18. API RULES

Server-side only for model calls.

Never expose API keys to the client.

Validate all inputs.

Suggested endpoints:

```text
POST /api/projects
GET  /api/projects/:id

POST /api/projects/:id/discovery
POST /api/projects/:id/position
POST /api/projects/:id/shape
POST /api/projects/:id/visualize
POST /api/projects/:id/battle
POST /api/projects/:id/stress-test
POST /api/projects/:id/consistency
POST /api/projects/:id/finalize

PATCH /api/projects/:id/decisions/:decisionId
```

---

# 19. DATABASE RULES

Use Prisma.

Keep database models simple.

Prefer JSON/JSONB for rapidly evolving AI structures during the hackathon.

Do not normalize every AI field into dozens of tables.

---

# 20. ERROR HANDLING

AI failure must never destroy project state.

If a call fails:

```text
preserve current state
show retry
show useful error
```

Never lose user input.

Optional features must fail gracefully.

---

# 21. LOADING UX

Never show:

> Loading...

Use meaningful progress.

Example:

```text
Understanding your idea...
✓

Finding positioning opportunities...
◌

Preparing brand directions...
○
```

For Stress Test:

```text
Running audience attack...
✓

Testing differentiation...
✓

Checking contradictions...
◌
```

---

# 22. DESIGN SYSTEM

Create a small internal design system.

Use shared tokens for:

- spacing
- typography
- border radius
- shadows
- surfaces
- status colors
- animation durations

Do not style every component independently.

---

# 23. RESPONSIVE

Desktop first.

Support:

- 1440px
- 1280px
- 1024px
- tablet

Mobile should remain functional but does not need desktop-equivalent complexity.

---

# 24. ACCESSIBILITY

Minimum:

- semantic HTML
- keyboard navigation
- visible focus
- labels
- accessible dialogs
- contrast
- reduced motion

---

# 25. PERFORMANCE

Do not sacrifice application responsiveness for visual effects.

Rules:

- lazy-load heavy components
- avoid unnecessary re-renders
- avoid huge client-side state
- don't load Three.js unless needed
- keep landing page fast
- use server components where appropriate
- use client components only for interactive areas

---

# 26. SECURITY

- API keys server-side
- validate inputs
- sanitize uploaded content
- never trust model output
- validate model output
- avoid exposing internal prompts
- don't log secrets
- don't log full sensitive user content unnecessarily

---

# 27. CODING STYLE

Use:

- TypeScript
- small reusable components
- explicit types
- clear names
- early returns
- minimal abstraction
- comments only where useful

Avoid:

- giant components
- deeply nested conditionals
- duplicated API logic
- magic strings
- unnecessary design patterns
- premature optimization

---

# 28. FILE STRUCTURE

Recommended:

```text
src/
├── app/
│   ├── page.tsx
│   ├── new/
│   ├── project/
│   │   └── [id]/
│   │       ├── discover/
│   │       ├── strategy/
│   │       ├── stress-test/
│   │       ├── consistency/
│   │       └── brand-os/
│   └── api/
│
├── components/
│   ├── landing/
│   ├── discovery/
│   ├── strategy/
│   ├── brand-dna/
│   ├── stress-test/
│   ├── consistency/
│   ├── brand-os/
│   └── ui/
│
├── lib/
│   ├── ai/
│   │   ├── orchestrator.ts
│   │   ├── discovery.ts
│   │   ├── positioning.ts
│   │   ├── shape.ts
│   │   ├── visualize.ts
│   │   ├── battle.ts
│   │   ├── stress-test.ts
│   │   └── consistency.ts
│   ├── db/
│   ├── validation/
│   └── utils/
│
├── types/
└── prisma/
```

Adapt if the actual Next.js setup differs.

---

# 29. IMPLEMENTATION ORDER

Do not build the landing page for hours before the product works.

Order:

```text
1. Project setup
2. Database
3. AI provider
4. Discovery
5. Positioning
6. Shape
7. Brand Battle
8. Brand DNA
9. Stress Test
10. Consistency
11. Brand OS
12. Landing polish
13. Animations
14. Deployment
15. Demo hardening
```

---

# 30. TWO-PERSON WORK SPLIT

## Developer A — FRONTEND

Own:

- layout
- pages
- components
- Brand DNA graph
- Brand Battle UI
- Stress Test UI
- Brand OS
- animations
- responsive UI

## Developer B — AI / BACKEND

Own:

- Prisma
- database
- API
- AI orchestration
- prompts
- Zod
- Stress Test engine
- consistency engine
- deployment backend

### Integration checkpoints

At:
- Hour 5
- Hour 8
- Hour 12
- Hour 15
- Hour 17

Both developers integrate before continuing.

---

# 31. 20-HOUR RULE

At Hour 8:

If the full AI workflow does not work:

**STOP UI POLISH.**

At Hour 12:

If Stress Test does not work:

**STOP ADDING FEATURES.**

At Hour 15:

Freeze features.

Only polish, test and deploy.

---

# 32. DEFINITION OF DONE

A judge must be able to:

1. Enter an idea.
2. Answer focused questions.
3. See structured understanding.
4. Generate strategy.
5. Compare directions.
6. Select a direction.
7. Run Stress Test.
8. See actual findings.
9. Accept a recommendation.
10. See Brand DNA update.
11. Run consistency validation.
12. View final Brand OS.

If that works reliably, the project is submission-ready.

---

# 33. CLAUDE BEHAVIOR

When asked to implement something:

1. Read `ARCHITECTURE.md`.
2. Inspect the existing code.
3. Reuse existing patterns.
4. Do not rewrite unrelated files.
5. Keep changes focused.
6. Validate TypeScript.
7. Run lint/build when practical.
8. Fix errors before moving on.
9. Never remove working functionality without a reason.
10. Prefer a working simple implementation over an impressive unfinished one.

---

# 34. BEFORE ADDING A FEATURE

Ask internally:

### Does this directly improve:
- AI workflow?
- originality?
- problem solving?
- working implementation?
- UI/UX?
- demo?

If not, do not build it during the hackathon.

---

# 35. FINAL PRODUCT PRINCIPLE

> **Simple infrastructure. Sophisticated decision workflow. Exceptional UI.**

BRANDOS should make the judge think:

> “This isn't just an LLM generating branding copy. The product is actually reasoning through brand decisions, challenging them, and maintaining a coherent system.”

That is the product we are building.
