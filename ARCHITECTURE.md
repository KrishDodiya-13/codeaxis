# BRANDOS — ARCHITECTURE.md

> **Project:** BRANDOS — AI Brand Decision & Stress-Test Engine  
> **Hackathon constraint:** 20 hours  
> **Team:** 2 developers  
> **Primary objective:** Build a polished, working, judge-facing product that turns an incomplete idea into a coherent, useful, launch-ready brand system through a structured AI workflow.
>
> **Core product promise:**  
> **Build it. Challenge it. Launch it.**
>
> This document is the source of truth for product scope, architecture, UX, technical decisions, and implementation boundaries.

---

## 0. PRODUCT DEFINITION

### Problem

The challenge is to turn an incomplete idea into a coherent, useful and launch-ready brand system using an intelligent AI workflow.

A weak implementation would do:

```text
rough idea → one giant prompt → generic brand answer
```

BRANDOS must instead do:

```text
rough idea
  ↓
discover
  ↓
position
  ↓
shape
  ↓
visualize
  ↓
challenge / stress-test
  ↓
consistency validation
  ↓
launch-ready Brand OS
```

The system must preserve decisions between stages, use structured outputs, explain important recommendations, challenge weak assumptions, and keep the founder in control.

### Product positioning

> **BRANDOS is an AI brand decision engine that transforms incomplete ideas into coherent brand systems, stress-tests the strategy, and produces a launch-ready Brand OS.**

We are NOT primarily a:
- logo generator
- generic AI chatbot
- prompt wrapper
- social-media copy generator
- template marketplace

---

# 1. WINNING PRODUCT STRATEGY

The product should optimize for the published judging dimensions:

1. AI workflow
2. Originality
3. Working implementation
4. Problem solving / usefulness
5. UI/UX
6. Demo / explanation

Therefore the project must demonstrate three things simultaneously:

### A. AI is actually doing structured work
The AI should have distinct stages and structured state.

### B. The output is useful
The final result must be a coherent brand system, not a chat transcript.

### C. The demo has one unforgettable interaction
That interaction is:

> **TRY TO BREAK THIS BRAND**

The Stress Test deliberately attacks the selected brand strategy and identifies:
- weak differentiation
- audience mismatch
- clichés
- contradictions
- messaging problems
- strategic weaknesses

The user can accept, reject, or edit recommendations.

---

# 2. 20-HOUR SCOPE RULE

## MVP first

The team must have a working end-to-end flow before adding visual polish.

### P0 — MUST WORK

- Landing page
- New project / idea input
- Adaptive discovery interview
- Structured discovery state
- Positioning generation
- Brand personality / shape
- Brand Battle with 2–3 strategic directions
- Human selection
- Brand DNA
- Brand Stress Test
- Accept/reject/edit recommendation
- Consistency validation
- Final Brand OS
- Demo-ready deployment

### P1 — HIGH VALUE

- Visual design brief
- Naming territories
- Tagline directions
- AI reasoning panel
- Animated workflow progress
- Export/shareable Brand OS view
- Responsive desktop/tablet UI

### P2 — ONLY IF CORE IS COMPLETE

- Image upload / visual audit
- Competitor URL analysis
- What-if simulator
- 3D visualization
- Advanced persistence/history
- Authentication

### DO NOT BUILD

- Complex microservices
- Full user-management platform
- Billing
- Team collaboration
- Real-time multi-user editing
- Huge competitor database
- Custom model training
- Elaborate 3D for decoration
- Dozens of agents
- Mobile native app

---

# 3. RECOMMENDED TECH STACK

## Frontend + Backend

### Next.js
Use the current stable version available at project creation.

Why:
- one application for frontend + server routes/actions
- excellent Vercel deployment
- TypeScript
- easy API integration
- easy route-based pages
- flexible enough for future expansion

### TypeScript

Strict mode.

No `any` unless absolutely unavoidable.

---

## Styling

### Tailwind CSS

Use Tailwind for:
- layout
- responsive design
- spacing
- typography
- theming
- visual states

### shadcn/ui

Use for reliable base components:
- buttons
- inputs
- dialogs
- dropdowns
- tabs
- tooltips
- command UI
- sheets
- forms

---

# 4. VISUAL / UI STACK

The team has identified multiple UI resources. Do NOT install every library.

Use them selectively and keep one coherent visual language.

### Primary visual sources

- Aceternity UI — hero effects / premium visual moments
- Magic UI — animated primitives
- React Bits — micro-interactions
- 21st.dev — application patterns
- Origin UI — product controls
- Motion Primitives — transitions
- Tremor Blocks — analytics / metrics
- Three UI / Three.js — only where 3D has product value
- Canvas UI — canvas interaction ideas
- Smooth UI / Unlumen / Vengence UI — supporting patterns
- Uiverse — small interaction inspiration
- MotionSites — motion / landing references
- CodeFronts — typography exploration
- VibePrompts — prompt/interaction ideation

### Rule

> One design system, multiple component sources.

Do not make the application look like 15 unrelated component libraries.

---

# 5. MOTION PRINCIPLES

Motion should communicate state, not decorate everything.

Use animation for:

- stage transitions
- AI processing
- Brand DNA graph changes
- Stress Test discoveries
- before/after refinement
- hover / focus states
- page transitions

Avoid:
- constant floating objects
- excessive particles
- unnecessary 3D
- long loading animations
- animations that delay interaction

---

# 6. DATABASE

## PostgreSQL

Use PostgreSQL because it is flexible, production-like and easy to deploy.

### Prisma ORM

Use Prisma for schema + database access.

### Core tables

```text
projects
brand_states
brand_decisions
brand_battles
stress_tests
consistency_checks
final_brand_os
```

---

## `projects`

```text
id
name
original_idea
status
created_at
updated_at
```

---

## `brand_states`

```text
id
project_id
discovery_json
positioning_json
shape_json
visual_json
voice_json
created_at
updated_at
```

JSON/JSONB is intentional for hackathon flexibility.

---

## `brand_decisions`

```text
id
project_id
stage
category
decision
rationale
alternatives_json
confidence
user_status
created_at
```

`user_status`:

```text
proposed
approved
rejected
edited
```

---

## `brand_battles`

```text
id
project_id
directions_json
evaluation_json
selected_direction
created_at
```

---

## `stress_tests`

```text
id
project_id
test_type
issue
severity
evidence
impact
recommendation
alternative
user_action
created_at
```

---

## `consistency_checks`

```text
id
project_id
input_type
input_content
results_json
overall_status
created_at
```

---

## `final_brand_os`

```text
id
project_id
strategy_json
identity_json
visual_json
voice_json
launch_json
validation_json
created_at
updated_at
```

---

# 7. AI ARCHITECTURE

## Do NOT create 10 independent agents.

Use a single workflow orchestrator with specialized stages.

```text
                  WORKFLOW ORCHESTRATOR
                           │
       ┌───────────────────┼───────────────────┐
       ↓                   ↓                   ↓
   DISCOVER             POSITION             SHAPE
       │                   │                   │
       └───────────────────┼───────────────────┘
                           ↓
                       VISUALIZE
                           ↓
                     BRAND BATTLE
                           ↓
                      STRESS TEST
                           ↓
                   CONSISTENCY CHECK
                           ↓
                        BRAND OS
```

This is easier to debug and much more achievable in 20 hours.

---

# 8. STRUCTURED BRAND STATE

This is the central object of the entire application.

```ts
type BrandState = {
  project: ProjectState
  discovery: DiscoveryState
  positioning: PositioningState
  shape: ShapeState
  visual: VisualState
  voice: VoiceState
  battle: BrandBattleState
  stressTests: StressTestState[]
  consistency: ConsistencyState
  finalBrand?: BrandOS
}
```

Every stage consumes approved information from earlier stages.

Never regenerate the entire brand from scratch.

---

# 9. AI WORKFLOW — DISCOVER

## Goal

Understand the user's incomplete idea.

### Input

- rough idea
- optional existing audience
- optional product information
- optional constraints

### Process

```text
idea
 ↓
extract known facts
 ↓
identify missing high-value information
 ↓
ask targeted question
 ↓
update discovery state
 ↓
repeat until minimum confidence
```

### Important rule

Do NOT ask generic questions just to make the chat longer.

Only ask questions where the answer could materially change:
- audience
- positioning
- personality
- messaging
- visual direction

### Output

```json
{
  "problem": "",
  "targetAudience": [],
  "context": "",
  "userNeed": "",
  "goals": [],
  "constraints": [],
  "assumptions": [],
  "openQuestions": []
}
```

---

# 10. AI WORKFLOW — POSITION

Input:

```text
DiscoveryState
```

Output:

```json
{
  "category": "",
  "targetAudience": [],
  "coreProblem": "",
  "valueProposition": "",
  "differentiator": "",
  "competitiveAngle": "",
  "rationale": [],
  "assumptions": []
}
```

### Precision rule

Every major recommendation must reference information from DiscoveryState.

No unsupported market facts.

If external research is not implemented, say that something is an assumption rather than pretending it is verified.

---

# 11. AI WORKFLOW — SHAPE

Create:

- personality
- principles
- naming territories
- tagline directions
- message hierarchy

Example:

```json
{
  "personality": [
    "confident",
    "collaborative",
    "energetic"
  ],
  "avoid": [
    "corporate",
    "generic"
  ],
  "namingTerritories": [],
  "taglineDirections": [],
  "messageHierarchy": []
}
```

---

# 12. AI WORKFLOW — VISUALIZE

Generate a strategic visual brief.

```json
{
  "colorDirection": [],
  "typographyDirection": [],
  "shapeLanguage": [],
  "imageryDirection": [],
  "composition": [],
  "visualMood": [],
  "avoid": [],
  "rationale": []
}
```

Do not generate random colors without explaining the relationship to:
- audience
- personality
- positioning

---

# 13. BRAND BATTLE

Generate 2–3 strategically different directions.

Each direction:

```json
{
  "name": "",
  "coreIdea": "",
  "positioning": "",
  "personality": [],
  "strengths": [],
  "risks": [],
  "tradeoffs": [],
  "fit": {
    "audience": "",
    "differentiation": "",
    "clarity": "",
    "memorability": ""
  }
}
```

The evaluator must explain the trade-offs.

### Human-in-the-loop

The user selects:

```text
Choose
Keep original
Edit
```

AI recommends.

Human decides.

---

# 14. BRAND DNA

Brand DNA is the visual + logical representation of approved decisions.

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

Connections represent dependencies.

Example:

```text
Audience
  ↓
Problem
  ↓
Positioning
  ├──→ Personality
  ├──→ Voice
  └──→ Visual
```

### UI behavior

Click a node → open reasoning panel.

Panel shows:

- current decision
- why
- previous input
- alternatives
- status
- affected decisions

---

# 15. STRESS TEST

## Signature feature

The user presses:

> **TRY TO BREAK THIS BRAND**

Tests:

```text
Cliché Test
Audience Fit
Differentiation
Contradiction
Message Clarity
Positioning Defensibility
```

Each test returns:

```json
{
  "testType": "",
  "status": "pass | warning | fail",
  "issue": "",
  "severity": "low | medium | high",
  "evidence": "",
  "impact": "",
  "recommendation": "",
  "alternative": ""
}
```

### User actions

```text
Accept
Keep Original
Edit
```

If accepted:

1. update relevant BrandState
2. identify downstream dependencies
3. re-run only affected stages
4. update Brand DNA
5. re-run consistency validation

This is a major technical differentiator.

---

# 16. CONSISTENCY ENGINE

Compare:

```text
positioning
personality
voice
visual direction
messaging
launch content
```

The engine detects:

- contradictions
- tone mismatch
- audience mismatch
- visual/personality mismatch
- message/positioning mismatch

Output:

```json
{
  "overallStatus": "pass | warning | fail",
  "checks": [],
  "recommendations": []
}
```

---

# 17. FINAL BRAND OS

The final page must feel like a polished deliverable, not raw AI output.

Sections:

### Strategy

- Problem
- Audience
- Category
- Positioning
- Value proposition
- Differentiator

### Identity

- Personality
- Principles
- Naming direction
- Name
- Tagline
- One-line pitch

### Visual

- Color direction
- Typography
- Shape language
- Imagery
- Composition

### Voice

- Tone
- Messaging hierarchy
- Sample copy

### Launch

- Landing headline
- One-line pitch
- Social launch copy

### Validation

- Stress-test findings
- Consistency findings
- Remaining risks

---

# 18. PAGES / ROUTES

## We should build 7 user-facing pages/routes.

Do NOT create a separate page for every AI stage.

### PAGE 1 — Landing `/`

Purpose:
- explain product
- create premium first impression
- show value
- CTA: Start Building

Sections:

```text
Hero
↓
How BRANDOS Works
↓
Interactive workflow preview
↓
Stress Test showcase
↓
Brand OS preview
↓
CTA
```

---

### PAGE 2 — Create Project `/new`

Purpose:
Start a brand project.

UI:

```text
What's your idea?

[ large input ]

Optional:
Audience
Product type
Known constraints

[ Start Discovery ]
```

Keep this extremely clean.

---

### PAGE 3 — Discovery `/project/[id]/discover`

Purpose:
Adaptive interview.

Layout:

```text
Left:
Conversation

Center:
Current understanding

Right:
Known / Unknown / Assumptions
```

The user can see the AI gradually build structured understanding.

---

### PAGE 4 — Strategy Workspace `/project/[id]/strategy`

This is the main application.

Tabs / stages:

```text
Position
Shape
Visual
Brand Battle
```

Main visual:

**Brand DNA**

Right panel:

**AI reasoning**

This is the main "wow" workspace.

---

### PAGE 5 — Stress Test `/project/[id]/stress-test`

Purpose:
Run the signature feature.

Hero:

```text
YOUR BRAND IS READY.

TRY TO BREAK IT.

[ RUN STRESS TEST ]
```

Then animated test results:

```text
✓ Audience
⚠ Differentiation
✕ Positioning
✓ Voice
⚠ Visual
```

Click each issue for explanation and fix.

---

### PAGE 6 — Consistency `/project/[id]/consistency`

Purpose:
Test an actual piece of content against Brand DNA.

Input modes:

```text
Text
Upload image [P1]
```

Output:

```text
Voice
Positioning
Audience
Personality
Visual
```

For MVP, text consistency is enough.

---

### PAGE 7 — Brand OS `/project/[id]/brand-os`

Purpose:
Final deliverable.

This should look like a premium strategic brand document.

Sections:

```text
Brand Overview
Strategy
Identity
Visual Direction
Voice
Launch Kit
Stress Test
Consistency
```

CTA:

```text
Export / Share
```

---

# 19. PAGE COUNT DECISION

## Required for judging MVP: 7 routes

```text
1. Landing
2. New Project
3. Discovery
4. Strategy Workspace
5. Stress Test
6. Consistency
7. Brand OS
```

### Do NOT create:

- separate login page
- separate dashboard
- separate settings
- separate profile
- separate agent page
- separate analytics page

Those are not core to the challenge and consume hackathon time.

---

# 20. MAIN NAVIGATION

During the product:

```text
BRANDOS

01 Discover
02 Strategy
03 Stress Test
04 Consistency
05 Brand OS
```

Do not expose every internal AI operation as navigation.

`Position`, `Shape`, `Visualize`, and `Brand Battle` live inside Strategy.

---

# 21. COMPONENT ARCHITECTURE

```text
components/
│
├── landing/
│   ├── Hero
│   ├── WorkflowPreview
│   ├── StressTestPreview
│   └── BrandOSPreview
│
├── discovery/
│   ├── Interview
│   ├── Question
│   ├── ContextPanel
│   └── DiscoverySummary
│
├── strategy/
│   ├── BrandDNA
│   ├── BrandNode
│   ├── ReasoningPanel
│   ├── Positioning
│   ├── Shape
│   ├── VisualDirection
│   └── BrandBattle
│
├── stress-test/
│   ├── StressTestHero
│   ├── TestRunner
│   ├── TestResult
│   ├── Severity
│   └── Recommendation
│
├── consistency/
│   ├── ContentInput
│   ├── ConsistencyResult
│   └── RepairPanel
│
├── brand-os/
│   ├── Overview
│   ├── StrategySection
│   ├── IdentitySection
│   ├── VisualSection
│   ├── VoiceSection
│   ├── LaunchSection
│   └── ValidationSection
│
└── ui/
    └── shadcn components
```

---

# 22. SERVER ARCHITECTURE

```text
app/
├── api/
│   ├── projects/
│   ├── discovery/
│   ├── positioning/
│   ├── shape/
│   ├── visualize/
│   ├── battle/
│   ├── stress-test/
│   ├── consistency/
│   └── brand-os/
```

All model calls happen server-side.

Never expose model API keys to the browser.

---

# 23. VALIDATION PIPELINE

Every AI request:

```text
User input
 ↓
Zod input validation
 ↓
Workflow stage
 ↓
LLM
 ↓
JSON parse
 ↓
Zod output validation
 ↓
Business-rule validation
 ↓
Persist state
 ↓
Frontend
```

Never trust raw model output.

---

# 24. AI PRECISION RULES

These are NON-NEGOTIABLE.

### Rule 1
Never invent user facts.

### Rule 2
Separate:
- user-provided facts
- AI inference
- assumptions
- external evidence

### Rule 3
Don't make unsupported competitor claims.

### Rule 4
Don't produce generic filler.

### Rule 5
Every recommendation must have a reason.

### Rule 6
Every stage must use previous approved state.

### Rule 7
If information is insufficient, ask a focused question.

### Rule 8
Do not overwrite user-approved decisions without explicit action.

### Rule 9
Do not generate long explanations when a precise decision is enough.

### Rule 10
Structured JSON is the internal contract.

---

# 25. API ROUTES

Minimum API contract:

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

# 26. ERROR / FALLBACK STRATEGY

If an AI call fails:

```text
show friendly error
preserve current state
allow retry
```

Never lose the user's project.

If the stress test fails:

```text
preserve Brand DNA
allow retry
```

If an optional feature fails:

```text
hide optional feature
core product remains functional
```

---

# 27. 20-HOUR IMPLEMENTATION PLAN

## HOURS 0–2 — FOUNDATION

Developer A:
- Next.js
- Tailwind
- shadcn
- routing
- visual shell

Developer B:
- PostgreSQL
- Prisma
- schema
- AI provider
- Zod schemas

Goal:

> App boots + database works + AI call works.

---

## HOURS 2–5 — DISCOVERY

Developer A:
- Discovery UI
- interview UX
- context panel

Developer B:
- discovery orchestrator
- structured JSON
- persistence

Goal:

> Rough idea → structured DiscoveryState.

---

## HOURS 5–8 — STRATEGY

Developer A:
- Strategy workspace
- Brand DNA
- positioning UI
- Brand Battle UI

Developer B:
- positioning engine
- shape engine
- visual engine
- battle evaluator

Goal:

> Idea → 3 strategic directions → user selects one.

---

## HOURS 8–12 — STRESS TEST

Developer A:
- Stress Test UI
- animations
- severity states
- accept/reject/edit interactions

Developer B:
- stress test engine
- evaluation
- dependency updates
- persistence

Goal:

> Selected brand → real weaknesses → actionable fixes.

---

## HOURS 12–15 — BRAND OS

Developer A:
- final report
- typography
- visual polish
- responsive behavior

Developer B:
- consistency engine
- final Brand OS generation
- export/share

Goal:

> Complete end-to-end product.

---

## HOURS 15–17 — POLISH

Both:

- loading states
- error states
- animations
- empty states
- responsive
- performance
- accessibility
- visual consistency

---

## HOURS 17–18 — DEPLOY

- Vercel
- production environment variables
- database
- production AI API
- test full flow

---

## HOURS 18–20 — DEMO

No feature development.

Only:

- bug fixing
- demo data
- presentation
- screenshots
- recording
- submission preparation

---

# 28. TEAM DIVISION

## DEVELOPER A — FRONTEND / PRODUCT

Own:

- landing
- discovery UI
- strategy workspace
- Brand DNA visualization
- Brand Battle
- Stress Test UI
- Brand OS
- animations
- responsive design

## DEVELOPER B — AI / BACKEND

Own:

- database
- Prisma
- API routes
- workflow orchestrator
- prompts
- structured outputs
- Zod validation
- stress-test engine
- consistency engine
- deployment backend

### Shared

- architecture decisions
- integration
- debugging
- final demo

---

# 29. PERFORMANCE TARGETS

### Initial load
Keep landing fast.

### AI UX
Show progress immediately.

Example:

```text
Understanding your idea...
✓
Building positioning...
◌
Testing differentiation...
○
```

### Never block the UI unnecessarily.

Use streaming/progressive states where practical.

---

# 30. ACCESSIBILITY

Minimum:

- keyboard navigation
- visible focus
- semantic buttons
- accessible dialogs
- readable contrast
- reduced-motion support
- labels for form controls

---

# 31. RESPONSIVE STRATEGY

Priority:

1. Desktop
2. Laptop
3. Tablet

Mobile should remain usable but does NOT get equal engineering time.

The judging/demo environment is likely desktop-first.

---

# 32. DEMO FLOW

The demo should take approximately 3 minutes.

### 0:00
Show rough idea.

### 0:15
Adaptive AI interview.

### 0:40
Brand DNA appears.

### 1:00
Brand Battle.

### 1:20
Select direction.

### 1:30
Press:

> **TRY TO BREAK THIS BRAND**

### 1:50
AI discovers weaknesses.

### 2:10
Accept recommendation.

### 2:20
Brand DNA updates.

### 2:30
Consistency check.

### 2:45
Brand OS.

### 3:00
Closing statement:

> **“Most AI branding tools generate. BRANDOS builds, challenges and validates.”**

---

# 33. WINNING UI PRINCIPLES

The UI must communicate:

### Intelligence
Not just decoration.

### Causality
Show how decisions affect other decisions.

### Trust
Show why the AI made important recommendations.

### Control
The user approves meaningful changes.

### Progress
The user always knows where they are.

### Premium quality
Typography, whitespace, motion and hierarchy should feel intentional.

---

# 34. WHAT MAKES BRANDOS UNIQUE

The product's differentiation is NOT:

> “We use AI to generate brands.”

The differentiator is:

> **BRANDOS treats branding as a decision system.**

The unique loop is:

```text
UNDERSTAND
    ↓
GENERATE OPTIONS
    ↓
COMPARE
    ↓
HUMAN CHOICE
    ↓
ATTACK
    ↓
REFINE
    ↓
VALIDATE
    ↓
DELIVER
```

The signature feature is:

> **TRY TO BREAK THIS BRAND**

---

# 35. DEFINITION OF DONE

The project is DONE when a judge can:

1. Open the live URL.
2. Enter a rough idea.
3. Answer adaptive questions.
4. See structured understanding.
5. Generate positioning.
6. Compare strategic directions.
7. Select one.
8. Run Stress Test.
9. See specific weaknesses.
10. Accept a recommendation.
11. See Brand DNA update.
12. Run consistency validation.
13. Open a polished Brand OS.
14. Understand the entire AI workflow without us explaining hidden implementation.

If any of these are broken, do not spend time adding new features.

---

# 36. FINAL ARCHITECTURE

```text
                         USER
                          │
                          ▼
                  ┌──────────────┐
                  │   NEXT.JS    │
                  │   FRONTEND   │
                  └──────┬───────┘
                         │
                         ▼
                ┌─────────────────┐
                │ WORKFLOW ENGINE │
                └───────┬─────────┘
                        │
        ┌───────────────┼────────────────┐
        ▼               ▼                ▼
    DISCOVER        POSITION           SHAPE
        │               │                │
        └───────────────┼────────────────┘
                        ▼
                    VISUALIZE
                        │
                        ▼
                  BRAND BATTLE
                        │
                        ▼
                  STRESS TEST
                        │
                        ▼
                CONSISTENCY CHECK
                        │
                        ▼
                    BRAND OS
                        │
               ┌────────┴────────┐
               ▼                 ▼
          PostgreSQL          LLM API
             Prisma
```

**Architecture principle:**

> **Simple infrastructure. Sophisticated product logic. Exceptional UX.**

That is the correct trade-off for a 2-person, 20-hour hackathon.
