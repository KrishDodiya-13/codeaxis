# BRANDOS — Frontend UI Specification

> **For: Chahit (Developer A — Frontend)**
> This document is your complete reference for every page, layout, component, state, and interaction you need to build.
> You own the design decisions. This spec tells you WHAT to build. HOW it looks is yours.

---

## GROUND RULES FOR YOUR WORK

Before writing a single line of code, read these:

- **Desktop first.** Design for 1440px → 1280px → 1024px → tablet. Mobile is last priority.
- **Premium AI strategy workstation feel.** NOT a generic SaaS. NOT a chatbot. NOT neon cyberpunk.
- **Strong typography, whitespace, hierarchy.** Every element should feel intentional.
- **Never show "Loading…"** — always show meaningful progress text.
- **User always knows where they are** in the 5-step workflow.
- **Every important AI decision must show Accept / Reject / Edit controls.**
- **Mock the API responses** — build UI with hardcoded data first, integrate when backend is ready.
- **Use shadcn/ui** for base components. Layer your design on top.
- **Motion communicates state, not decoration.** Animate stage transitions, AI progress, reveals.

---

## DESIGN SYSTEM TOKENS (Define These First)

Create `src/lib/design-tokens.ts` and use these across every component. Do NOT hardcode values.

### Spacing Scale
```
xs   = 4px
sm   = 8px
md   = 16px
lg   = 24px
xl   = 32px
2xl  = 48px
3xl  = 64px
4xl  = 96px
```

### Typography Scale
```
label      = 11px / uppercase / tracking-widest
caption    = 12px
body-sm    = 13px
body       = 14px
body-lg    = 16px
heading-sm = 18px
heading    = 22px
heading-lg = 28px
display-sm = 36px
display    = 48px
display-lg = 64px
```

### Surface Levels (Dark UI recommended)
```
surface-0  = page background
surface-1  = cards, panels
surface-2  = hover states, subtle sections
surface-3  = active states, highlights
border     = subtle divider lines
```

### Status Colors
```
pass    = green variant
warning = amber variant
fail    = red variant
info    = blue variant
```

### Animation Durations
```
instant   = 100ms
fast      = 150ms
normal    = 250ms
slow      = 400ms
veryslow  = 700ms
```

---

## FILE STRUCTURE (Your Folders)

```
src/
├── app/
│   ├── page.tsx                          ← Landing
│   ├── new/
│   │   └── page.tsx                      ← Create Project
│   └── project/
│       └── [id]/
│           ├── discover/
│           │   └── page.tsx              ← Discovery Interview
│           ├── strategy/
│           │   └── page.tsx              ← Strategy Workspace
│           ├── stress-test/
│           │   └── page.tsx              ← Stress Test
│           ├── consistency/
│           │   └── page.tsx              ← Consistency Check
│           └── brand-os/
│               └── page.tsx              ← Final Brand OS
│
├── components/
│   ├── landing/
│   │   ├── Hero.tsx
│   │   ├── WorkflowPreview.tsx
│   │   ├── StressTestPreview.tsx
│   │   └── BrandOSPreview.tsx
│   │
│   ├── discovery/
│   │   ├── Interview.tsx
│   │   ├── Question.tsx
│   │   ├── ContextPanel.tsx
│   │   └── DiscoverySummary.tsx
│   │
│   ├── strategy/
│   │   ├── BrandDNA.tsx
│   │   ├── BrandNode.tsx
│   │   ├── ReasoningPanel.tsx
│   │   ├── Positioning.tsx
│   │   ├── Shape.tsx
│   │   ├── VisualDirection.tsx
│   │   └── BrandBattle.tsx
│   │
│   ├── stress-test/
│   │   ├── StressTestHero.tsx
│   │   ├── TestRunner.tsx
│   │   ├── TestResult.tsx
│   │   ├── Severity.tsx
│   │   └── Recommendation.tsx
│   │
│   ├── consistency/
│   │   ├── ContentInput.tsx
│   │   ├── ConsistencyResult.tsx
│   │   └── RepairPanel.tsx
│   │
│   ├── brand-os/
│   │   ├── Overview.tsx
│   │   ├── StrategySection.tsx
│   │   ├── IdentitySection.tsx
│   │   ├── VisualSection.tsx
│   │   ├── VoiceSection.tsx
│   │   ├── LaunchSection.tsx
│   │   └── ValidationSection.tsx
│   │
│   └── ui/
│       ├── WorkflowNav.tsx               ← Shared step nav inside projects
│       ├── ProgressSteps.tsx
│       ├── DecisionCard.tsx
│       ├── StatusBadge.tsx
│       ├── AcceptRejectEdit.tsx          ← THE most important shared component
│       ├── ConfidenceTag.tsx
│       ├── AIProgressIndicator.tsx
│       └── EmptyState.tsx
│
└── lib/
    ├── design-tokens.ts
    ├── mock-data.ts                      ← All mock API responses go here
    └── types.ts                          ← Shared TypeScript types for UI
```

---

## SHARED COMPONENT: WorkflowNav

This appears inside every `/project/[id]/*` page. It is the persistent step navigation.

**Shows:**
```
BRANDOS logo (left)

01 Discover   02 Strategy   03 Stress Test   04 Consistency   05 Brand OS
   ✓ done        ● current       ○ locked          ○ locked         ○ locked
```

**Behavior:**
- Completed steps show a checkmark and are clickable
- Current step is highlighted
- Locked steps are greyed out and not clickable
- Steps unlock as the user completes each phase
- On mobile: collapses to "Step 3 of 5 — Stress Test" with a dropdown

**Additional top-right:**
- Project name (editable on click)
- Save status ("Saved 2 min ago")

---

## SHARED COMPONENT: AcceptRejectEdit

This is used everywhere the AI makes a recommendation.

**Structure:**
```
[ ✓ Accept ]  [ ✗ Keep Original ]  [ ✎ Edit ]
```

**States:**
- Default: all three visible
- Accepted: green highlight, "✓ Accepted" label
- Rejected: "Original kept" label
- Editing: opens an inline text area or modal
- After accept: triggers downstream update (show "Updating Brand DNA..." indicator)

---

## SHARED COMPONENT: AIProgressIndicator

Use this whenever an AI call is in progress. NEVER show "Loading..."

**Structure:**
```
Understanding your idea...        ✓
Finding positioning opportunities... ◌  (spinning)
Preparing brand directions...     ○  (waiting)
```

**States per step:**
- `○` = queued
- `◌` = active/spinning
- `✓` = complete
- `✗` = failed (show retry)

---

## SHARED COMPONENT: StatusBadge

Used throughout for AI test results.

```
[ ✓ PASS ]   [ ⚠ WARNING ]   [ ✗ FAIL ]
```

Variants: pass (green), warning (amber), fail (red), info (blue)

---

## SHARED COMPONENT: ConfidenceTag

Shows AI confidence level for decisions.

```
● HIGH   ● MEDIUM   ● LOW
```

Small pill, appears next to AI-generated values.

---

## PAGE 1 — Landing `/`

### Purpose
First impression. Explain BRANDOS, build trust, get them to click "Start Building".

### Overall Layout
```
┌────────────────────────────────────────────────────────┐
│  BRANDOS                              [ Start Building ]│  ← Sticky nav
├────────────────────────────────────────────────────────┤
│                                                        │
│                    HERO SECTION                        │
│                                                        │
├────────────────────────────────────────────────────────┤
│                HOW BRANDOS WORKS                       │
├────────────────────────────────────────────────────────┤
│             INTERACTIVE WORKFLOW PREVIEW               │
├────────────────────────────────────────────────────────┤
│              STRESS TEST SHOWCASE                      │
├────────────────────────────────────────────────────────┤
│               BRAND OS PREVIEW                         │
├────────────────────────────────────────────────────────┤
│                    FINAL CTA                           │
└────────────────────────────────────────────────────────┘
```

---

### Section 1.1 — Sticky Navbar

**Left:** BRANDOS wordmark
**Right:** [ Start Building → ] button (primary CTA)

Behavior: transparent at top, solid background on scroll.

---

### Section 1.2 — Hero

**Content:**
- Eyebrow label: `AI BRAND DECISION ENGINE`
- Headline (large display): `Build it. Challenge it. Launch it.`
- Subheadline: `Turn an incomplete idea into a coherent, stress-tested, launch-ready brand system.`
- CTA Button: `Start Building →`
- Secondary link: `See how it works ↓`

**Visual area (right side or background):**
- Abstract representation of the Brand DNA graph OR
- Animated workflow preview that hints at stages
- This is a premium moment — use Aceternity / Magic UI if it adds value

**DO NOT:**
- Use stock photos
- Use generic SaaS hero copy
- Use a screenshot of the app

---

### Section 1.3 — How BRANDOS Works

**Headline:** `A structured AI workflow, not a one-prompt generator.`

**Visual:**
Show the 8-step workflow as a horizontal or vertical flow:
```
ROUGH IDEA → DISCOVER → POSITION → SHAPE → VISUALIZE → BRAND BATTLE → STRESS TEST → BRAND OS
```

Each step has:
- Icon or number
- Short 1-line description

**DO NOT make this a static list of bullet points.**
Make it feel like a flow — arrows, connectors, progression.

---

### Section 1.4 — Interactive Workflow Preview

Pick ONE of the stages and show a static or lightly animated preview of what that stage looks like.

Recommended: Show the **Brand DNA** graph as a static preview with a few visible nodes and connections. This visually communicates that BRANDOS is a decision system, not a chatbot.

Small label: `The Brand DNA graph — every approved decision, visualized.`

---

### Section 1.5 — Stress Test Showcase

This is the key differentiator. Make it visually stand out.

**Headline:** `TRY TO BREAK THIS BRAND`

Show a mock stress test result panel:
```
✓  Audience Fit         PASS
⚠  Differentiation      WARNING — "Positions against 3 identical competitors"
✗  Positioning          FAIL — "Core claim is a cliché in this category"
✓  Message Clarity      PASS
⚠  Visual Direction     WARNING — "Color palette conflicts with brand personality"
```

Add a label: `AI deliberately attacks your strategy and shows you where it's weak.`

**This section should make someone lean forward.**

---

### Section 1.6 — Brand OS Preview

Show a clean, cropped preview of what the final Brand OS looks like.

Display a few sections:
- Strategy (positioning statement)
- Identity (personality, tagline)
- Validation (stress test summary)

Label: `The final deliverable — a structured, exportable Brand OS.`

---

### Section 1.7 — Final CTA

```
Ready to build your brand?

[ Start Building → ]

Takes 15–20 minutes. No signup required.
```

---

## PAGE 2 — Create Project `/new`

### Purpose
The entry point. Clean, fast, focused. Get the idea out of the user's head and into the system.

### Overall Layout
```
┌──────────────────────────────────────────────────────┐
│  ← BRANDOS                                           │
├──────────────────────────────────────────────────────┤
│                                                      │
│                                                      │
│           What's your idea?                         │
│                                                      │
│   ┌────────────────────────────────────────────┐    │
│   │                                            │    │
│   │   Describe it in your own words...         │    │
│   │   (large textarea)                         │    │
│   │                                            │    │
│   └────────────────────────────────────────────┘    │
│                                                      │
│   Optional  ▼                                        │
│   ┌──────────────────┐  ┌──────────────────────┐    │
│   │ Who's it for?    │  │ Any constraints?      │    │
│   └──────────────────┘  └──────────────────────┘    │
│                                                      │
│              [ Start Discovery → ]                  │
│                                                      │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### Fields

**Main textarea:**
- Label: `What's your idea?`
- Placeholder: `Describe it in your own words. It doesn't have to be perfect.`
- Minimum 3 lines visible, expands as user types
- Character counter bottom right (soft limit 500 chars)

**Optional accordion (collapsed by default):**
Click "Optional ▼" to expand these:

- `Who's it for?` — short text input
- `Product type` — short text input
- `Known constraints or non-negotiables` — short text input

**CTA Button:**
- Text: `Start Discovery →`
- Disabled until main textarea has content
- Loading state: `Starting discovery...`

**Bottom microcopy:**
`No account needed. Your project is saved automatically.`

### States

- **Empty:** Show placeholder and soft prompt
- **Typing:** Show character count, enable button
- **Submitting:** Show AIProgressIndicator overlay or button spinner
- **Error:** Show inline error with retry

---

## PAGE 3 — Discovery `/project/[id]/discover`

### Purpose
Adaptive AI interview. The AI extracts structured understanding from the rough idea. The user can see understanding building in real-time.

### Overall Layout (3-panel)
```
┌─────────────────┬──────────────────────┬────────────────────┐
│   WorkflowNav (top bar)                                      │
├─────────────────┼──────────────────────┼────────────────────┤
│                 │                      │                    │
│  CONVERSATION   │  CURRENT             │  KNOWN /           │
│  PANEL          │  UNDERSTANDING       │  UNKNOWN /         │
│  (left)         │  (center)            │  ASSUMPTIONS       │
│                 │                      │  (right)           │
│  AI question    │  JSON structure      │                    │
│  user answer    │  building visually   │  ● Known (3)       │
│  AI question    │  as user answers     │  ○ Unknown (2)     │
│  ...            │                      │  ~ Assumption (1)  │
│                 │                      │                    │
│  [ input box ]  │                      │                    │
│  [ Send ]       │                      │                    │
└─────────────────┴──────────────────────┴────────────────────┘
```

---

### Panel 3.1 — Conversation (Left)

**What it shows:**
- Chat-like thread of AI questions and user answers
- Each AI message is clearly labeled `BRANDOS`
- Each user message is right-aligned
- Latest question is always visible at bottom

**AI question card:**
```
┌─────────────────────────────────────────┐
│  BRANDOS                                │
│                                         │
│  "Who exactly are you building this     │
│   for? Be as specific as possible."     │
│                                         │
│  (Why this matters: Audience defines    │
│   positioning strategy.)               │
└─────────────────────────────────────────┘
```

Show a subtle "Why this matters" reason under each question. This builds trust.

**User input area (bottom of left panel):**
```
┌─────────────────────────────────────────┐
│  Your answer...                         │
├─────────────────────────────────────────┤
│  [ Send → ]                    ⌨ Enter │
└─────────────────────────────────────────┘
```

**After user sends:**
- AI shows typing indicator (`...`)
- Then next question appears
- Or if discovery is complete: "✓ I have enough to build your discovery state." → show "Continue to Strategy →" button

---

### Panel 3.2 — Current Understanding (Center)

**Purpose:** Show the AI building a structured model of the idea in real-time.

**Visual style:** NOT raw JSON. Present as labeled fields that fill in as answers arrive.

```
DISCOVERY STATE

Problem
  ──────────────────────────────────
  "Founders struggle to build brand
   systems consistently..."

  ● confidence: HIGH

Target Audience
  ──────────────────────────────────
  ⏳ Still gathering...

Value Proposition
  ──────────────────────────────────
  ~ Assumed: First-time founders
  (not yet confirmed)

Goals
  ──────────────────────────────────
  ○ Not yet identified
```

**States per field:**
- `○ Not yet identified` — greyed out
- `⏳ Still gathering...` — placeholder, pending
- `~ Assumed: [value]` — amber, unconfirmed
- `● [value]` — green, confirmed from user

**Animates:** Each field fades in / updates as new answers arrive.

---

### Panel 3.3 — Known / Unknown / Assumptions (Right)

**Three collapsible sections:**

```
● KNOWN  (3)
──────────────────────
• Target: Early-stage founders
• Problem: Brand inconsistency
• Category: B2B SaaS

○ UNKNOWN  (2)
──────────────────────
• Pricing model
• Geographic focus

~ ASSUMPTIONS  (1)
──────────────────────
• English-speaking market
  [Ask to confirm]
```

**Clicking an assumption** surfaces it as a question in the left panel.
**This panel is read-only** — it reflects AI state, not user-editable.

---

### Page 3 — Bottom Bar

When discovery is complete:
```
┌──────────────────────────────────────────────────────────────┐
│  ✓ Discovery complete — 6 facts found, 1 assumption flagged  │
│                                           [ Go to Strategy → ]│
└──────────────────────────────────────────────────────────────┘
```

---

## PAGE 4 — Strategy Workspace `/project/[id]/strategy`

### Purpose
The main application workspace. The most complex page. Contains positioning, shape, visual direction, brand battle, and the Brand DNA graph.

### Overall Layout (Tabs + Side Panel)
```
┌────────────────────────────────────────────────────────────┐
│  WorkflowNav (top bar)                                      │
├───────────────────────────────────────┬────────────────────┤
│                                       │                    │
│   [ Position ] [ Shape ] [ Visual ]   │  AI REASONING      │
│   [ Brand Battle ] [ Brand DNA ]      │  PANEL             │
│                                       │                    │
│                                       │  Shows why the AI  │
│   ACTIVE TAB CONTENT                  │  made the current  │
│                                       │  recommendation    │
│                                       │                    │
│                                       │  ───────────────── │
│                                       │  SOURCES:          │
│                                       │  • Discovery State │
│                                       │  • Positioning     │
│                                       │                    │
└───────────────────────────────────────┴────────────────────┘
```

**Left/main area:** ~70% width, holds tab content
**Right panel:** ~30% width, persistent AI Reasoning Panel
**Tabs:** Position → Shape → Visual → Brand Battle → Brand DNA

---

### Tab 4.1 — Position

**What to show:**

```
POSITIONING

Category
  ──────────────────────────────────────
  AI Brand Strategy Tools               ● HIGH confidence
  [ ✓ Accept ]  [ ✗ Keep ]  [ ✎ Edit ]

Target Audience
  ──────────────────────────────────────
  Early-stage startup founders           ● HIGH confidence
  who need strategic branding guidance
  [ ✓ Accept ]  [ ✗ Keep ]  [ ✎ Edit ]

Core Problem
  ──────────────────────────────────────
  Brand decisions made without strategy  ● MEDIUM confidence
  lead to inconsistency and wasted spend
  [ ✓ Accept ]  [ ✗ Keep ]  [ ✎ Edit ]

Value Proposition
  ──────────────────────────────────────
  "The only brand tool that builds AND   ● MEDIUM confidence
   stress-tests your strategy"
  [ ✓ Accept ]  [ ✗ Keep ]  [ ✎ Edit ]

Differentiator
  ──────────────────────────────────────
  ~ Assumption: Currently positioned     ● LOW confidence
  on AI-assisted decision workflow
  [Ask to clarify]

Competitive Angle
  ──────────────────────────────────────
  vs. one-prompt generators: depth,     ● MEDIUM
  structure, validation
  [ ✓ Accept ]  [ ✗ Keep ]  [ ✎ Edit ]
```

**After all accepted:** Show `Continue to Shape →` button at bottom.

---

### Tab 4.2 — Shape

**What to show:**

```
BRAND SHAPE

Personality Traits
  ──────────────────────────────────────
  confident  · collaborative · decisive  ● HIGH
  [ ✓ Accept ]  [ ✗ Keep ]  [ ✎ Edit ]

Avoid (Anti-personality)
  ──────────────────────────────────────
  corporate  · vague  · generic         ● HIGH
  [ ✓ Accept ]  [ ✗ Keep ]  [ ✎ Edit ]

Brand Principles
  ──────────────────────────────────────
  1. AI recommends. You decide.         ● HIGH
  2. Structure over style.
  3. Every decision has a reason.
  [ ✓ Accept ]  [ ✗ Keep ]  [ ✎ Edit ]

Naming Territories
  ──────────────────────────────────────
  → Strategic / decision-focused        ● MEDIUM
  → Action-oriented (Build, Break, OS)
  → Technical authority
  [ ✓ Accept ]  [ ✗ Keep ]  [ ✎ Edit ]

Tagline Directions  (3 options)
  ──────────────────────────────────────
  ○ "Build it. Challenge it. Launch it."
  ○ "Brand decisions, structured."
  ○ "Don't guess. Brand decisively."
  [ Select one ]

Message Hierarchy
  ──────────────────────────────────────
  Primary:   AI brand decision engine
  Secondary: Stress-tests your strategy
  Tertiary:  Coherent brand OS output
  [ ✓ Accept ]  [ ✗ Keep ]  [ ✎ Edit ]
```

---

### Tab 4.3 — Visual Direction

**What to show:**

```
VISUAL DIRECTION

Color Direction
  ──────────────────────────────────────
  Dark / sophisticated base             ● HIGH
  with precise accent color
  Rationale: "Confident, strategic feel
  aligned with positioning"
  [ ✓ Accept ]  [ ✗ Keep ]  [ ✎ Edit ]

Typography Direction
  ──────────────────────────────────────
  Geometric sans-serif primary          ● MEDIUM
  Monospace for data / AI content
  Rationale: "Technical trust + clarity"
  [ ✓ Accept ]  [ ✗ Keep ]  [ ✎ Edit ]

Shape Language
  ──────────────────────────────────────
  Clean edges, structured grids         ● HIGH
  Minimal curves
  [ ✓ Accept ]  [ ✗ Keep ]  [ ✎ Edit ]

Imagery Direction
  ──────────────────────────────────────
  Abstract / conceptual                 ● MEDIUM
  No stock-photo humans
  Data visualization aesthetics
  [ ✓ Accept ]  [ ✗ Keep ]  [ ✎ Edit ]

Visual Mood
  ──────────────────────────────────────
  Strategic · Precise · Premium         ● HIGH
  Minimal · Trustworthy
  [ ✓ Accept ]  [ ✗ Keep ]  [ ✎ Edit ]

Avoid
  ──────────────────────────────────────
  Neon · Glassmorphism · Comic-style    ● HIGH
  Excessive gradients
```

---

### Tab 4.4 — Brand Battle

This is where the AI presents 2–3 strategic directions. The user picks one.

**Layout:**
```
BRAND BATTLE

AI generated 3 strategic directions.
Compare them and choose one to develop.

┌────────────────────┐ ┌─────────────────────┐ ┌─────────────────────┐
│  Direction A       │ │  Direction B         │ │  Direction C        │
│  "THE STRATEGIST"  │ │  "THE CHALLENGER"    │ │  "THE GUIDE"        │
│                    │ │                      │ │                     │
│  Core idea:        │ │  Core idea:          │ │  Core idea:         │
│  AI-powered brand  │ │  The brand tool that │ │  Step-by-step brand │
│  decision system   │ │  attacks weak ideas  │ │  mentor             │
│                    │ │                      │ │                     │
│  Strengths:        │ │  Strengths:          │ │  Strengths:         │
│  • Unique          │ │  • Memorable CTA     │ │  • Accessible       │
│  • Premium feel    │ │  • Drama in demo     │ │  • Wide audience    │
│                    │ │                      │ │                     │
│  Risks:            │ │  Risks:              │ │  Risks:             │
│  • Complex sell    │ │  • Feels aggressive  │ │  • Less distinct    │
│                    │ │                      │ │                     │
│  Trade-off:        │ │  Trade-off:          │ │  Trade-off:         │
│  Depth vs reach    │ │  Impact vs warmth    │ │  Clarity vs premium │
│                    │ │                      │ │                     │
│  AI Recommends ★  │ │                      │ │                     │
│                    │ │                      │ │                     │
│  [ Choose This ]  │ │  [ Choose This ]    │ │  [ Choose This ]   │
└────────────────────┘ └─────────────────────┘ └─────────────────────┘

  Or: [ Keep my original direction ] [ Edit a direction ]
```

**After selection:**
- Selected card highlights prominently
- Other cards fade
- Show: `✓ Direction B selected — "THE CHALLENGER"`
- Show: `→ Proceed to Stress Test` button

**Comparison columns (optional below cards):**
```
                     A          B          C
Audience Fit:      ● HIGH    ● HIGH     ● MEDIUM
Differentiation:   ● HIGH    ● HIGH     ● LOW
Clarity:           ● MEDIUM  ● HIGH     ● HIGH
Memorability:      ● MEDIUM  ● HIGH     ● MEDIUM
```

---

### Tab 4.5 — Brand DNA

The interactive graph. This is a core UI interaction.

**Layout:**
```
BRAND DNA

[ Audience ] ──→ [ Problem ]
                     │
                     ↓
               [ Positioning ]
               /      |       \
     [Personality] [Voice]  [Visual]
                              │
                           [Launch]
```

**Node states:**
- `○ Empty` — not yet filled, greyed
- `~ Assumption` — amber, dashed border
- `● Confirmed` — filled, solid border, clickable
- `⚠ Needs update` — warning color, pulsing

**Clicking a node opens a detail panel (slide-in or popout):**
```
┌───────────────────────────────────────┐
│  AUDIENCE                             │
│                                       │
│  Decision                             │
│  "Early-stage startup founders who    │
│   need strategic brand guidance"      │
│                                       │
│  Rationale                            │
│  "Identified from user input during   │
│   Discovery stage"                    │
│                                       │
│  Source                               │
│  Discovery → User Answer              │
│                                       │
│  Confidence   ● HIGH                  │
│                                       │
│  Status       ✓ Approved by user      │
│                                       │
│  Affects                              │
│  → Positioning → Personality → Voice  │
│                                       │
│  Alternatives                         │
│  "SMB marketing managers"             │
│  "Agency owners"                      │
│                                       │
│  [ Change Audience ]  [ Close ]       │
└───────────────────────────────────────┘
```

**When a node changes:**
- Downstream nodes briefly highlight with "⚠ May need update"
- A banner shows: `"Audience changed → Updating Positioning, Personality, Voice..."`

---

### Right Panel — AI Reasoning Panel

Always visible. Updates as user moves through tabs.

```
AI REASONING

Current recommendation:

"Positioned Brand B as the challenger
because it creates maximum contrast
with generic AI branding tools."

Sources used:
• Discovery: audience = founders
• Positioning: differentiator confirmed
• User selection: Direction B

Confidence:  ● HIGH

Flags:
⚠  Differentiation risk — 2 similar
   tools entered market this year
   (assumption, not verified)

───────────────────────────────
History:
→ Positioning accepted
→ Personality accepted
→ Battle: Direction B selected
```

---

## PAGE 5 — Stress Test `/project/[id]/stress-test`

### Purpose
The signature feature. THE most important page. Must be dramatic, clear, and interactive.

### Phase 1 — Pre-Run Hero

```
┌──────────────────────────────────────────────────────────┐
│  WorkflowNav                                             │
├──────────────────────────────────────────────────────────┤
│                                                          │
│                                                          │
│         YOUR BRAND IS READY.                            │
│                                                          │
│         Will it survive scrutiny?                       │
│                                                          │
│         ┌──────────────────────────────────┐            │
│         │                                  │            │
│         │    TRY TO BREAK THIS BRAND       │            │
│         │                                  │            │
│         └──────────────────────────────────┘            │
│                                                          │
│         The AI will attack your brand strategy           │
│         across 6 critical dimensions.                   │
│                                                          │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**The CTA button "TRY TO BREAK THIS BRAND" must feel weighty.** Large, prominent.

---

### Phase 2 — Running Tests

When clicked, replace the hero with the running animation:

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  STRESS TESTING YOUR BRAND STRATEGY...                  │
│                                                          │
│  ✓  Analysing brand state...                           │
│  ◌  Running cliché test...              (spinning)      │
│  ○  Testing audience fit...             (waiting)       │
│  ○  Checking differentiation...         (waiting)       │
│  ○  Finding contradictions...           (waiting)       │
│  ○  Validating message clarity...       (waiting)       │
│  ○  Testing positioning defensibility.. (waiting)       │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

Each step reveals one at a time. Small delay between each for dramatic effect.

---

### Phase 3 — Results

After all tests complete, show results one by one (animate in from top):

**Overall header:**
```
3 issues found — 1 critical, 2 warnings
[ Fix All Recommended ] or review individually below
```

**Each test result card:**
```
┌──────────────────────────────────────────────────────────┐
│  DIFFERENTIATION                    [ ✗ FAIL ]  HIGH     │
│                                                          │
│  Issue                                                   │
│  "Core positioning claim is used by 3+ competitors in   │
│   this space."                                           │
│                                                          │
│  Evidence                                                │
│  "AI-powered brand strategy" appears in positioning of   │
│  Looka, Brandmark, and Namelix (assumption — not         │
│  verified via live search).                              │
│                                                          │
│  Impact                                                  │
│  Low differentiation → harder to win attention in        │
│  crowded space → higher CAC.                            │
│                                                          │
│  Recommendation                                          │
│  Shift positioning to the stress-test / validation       │
│  angle, which is genuinely uncommon.                     │
│                                                          │
│  Alternative                                             │
│  "The only brand tool designed to challenge your own     │
│   strategy, not just generate it."                       │
│                                                          │
│  [ ✓ Accept Recommendation ]  [ ✗ Keep Original ]  [ ✎ Edit ]
└──────────────────────────────────────────────────────────┘
```

**Severity badge rules:**
- HIGH + FAIL = red border, red badge
- MEDIUM + WARNING = amber border, amber badge
- LOW + PASS = green border, green badge

**After Accept:**
```
✓ Accepted — Updating Positioning...
✓ Updating Brand DNA...
✓ Updating Personality...
Re-running Consistency...
```

Show this as a mini progress sequence.

---

### Phase 4 — Post-Fix Summary

After user handles all results:

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  ✓ 1 fix applied     ✗ 2 kept original                 │
│                                                          │
│  Brand DNA has been updated.                            │
│                                                          │
│  [ Continue to Consistency → ]                          │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## PAGE 6 — Consistency Check `/project/[id]/consistency`

### Purpose
Test real content against the approved Brand DNA.

### Overall Layout
```
┌──────────────────────────────────────────────────────────┐
│  WorkflowNav                                             │
├───────────────────────────┬──────────────────────────────┤
│                           │                              │
│  CONTENT INPUT            │  CONSISTENCY RESULTS         │
│  (left 45%)               │  (right 55%)                 │
│                           │                              │
│                           │                              │
└───────────────────────────┴──────────────────────────────┘
```

---

### Panel 6.1 — Content Input (Left)

```
CHECK CONTENT AGAINST YOUR BRAND

What content do you want to test?

[ Text ] [ Image (coming soon) ]

┌────────────────────────────────────────┐
│                                        │
│  Paste your copy, tagline, post,       │
│  headline, or any brand content...     │
│                                        │
│                                        │
│                                        │
└────────────────────────────────────────┘

[ Check Consistency → ]
```

**Examples below input (subtle):**
```
Try:
• A social media post
• Your homepage headline
• An email subject line
• A product description
```

---

### Panel 6.2 — Consistency Results (Right)

**Default state:**
```
CONSISTENCY RESULTS

Run a check to see how well your content
aligns with your brand DNA.
```

**After check — result card:**
```
CONSISTENCY RESULTS

Content:
"The AI that builds brands and helps them
think smarter."

Overall   ⚠ WARNING

Voice              ✓ PASS
  "Confident and direct — matches brand"

Positioning        ⚠ WARNING
  "Mentions 'smarter' — conflicts with
   precision-focused positioning"
  Recommendation: Replace "smarter" with
  "more strategically"

Audience Fit       ✓ PASS
  "Speaks to founder-level decision-making"

Personality        ✓ PASS
  "Tone matches confident, decisive trait"

Visual Language    N/A for text
```

**Repair Panel (if issues found):**
```
SUGGESTED REPAIR

Original:
"...helps them think smarter."

Suggested fix:
"...helps them brand more decisively."

Why: Aligns "decisively" with positioning
     and personality traits.

[ ✓ Use this ]  [ ✗ Keep original ]  [ ✎ Edit ]
```

**After accepting repair:**
- Show "✓ Repair applied to Brand OS"
- Input field updates with repaired text

---

### Bottom Bar
```
[ ← Back to Stress Test ]             [ Continue to Brand OS → ]
```

---

## PAGE 7 — Brand OS `/project/[id]/brand-os`

### Purpose
The final deliverable. Must feel like a premium strategic document. Professional enough to share with a co-founder, investor, or designer.

### Overall Layout
```
┌──────────────────────────────────────────────────────────┐
│  WorkflowNav                              [ Export / Share ]│
├──────────────────────────────────────────────────────────┤
│                                                          │
│  BRANDOS   BRAND OS   [Project Name]    Created: date    │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  [ Overview ] [ Strategy ] [ Identity ] [ Visual ]       │
│  [ Voice ] [ Launch Kit ] [ Validation ]                 │
├──────────────────────────────────────────────────────────┤
│                                                          │
│   SECTION CONTENT                                        │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

Tabs or scroll sections — your choice. Scroll is more document-like.

---

### Section 7.1 — Overview

```
BRAND OS

[Project Name]
Prepared by BRANDOS · September 27, 2026

───────────────────────────────────────────────

Brand in One Line:
"An AI brand decision engine that builds, challenges,
and validates brand strategy."

Category:        AI Brand Strategy Tools
Stage:           Discovery / Positioning complete
Stress Test:     3 tests run · 1 fix applied
Consistency:     Validated
```

---

### Section 7.2 — Strategy

```
STRATEGY

Problem
"Founders make brand decisions without structure,
leading to inconsistency and wasted spend."

Target Audience
"Early-stage startup founders who need structured
brand guidance, not generic design tools."

Category
"AI Brand Strategy Tools"

Positioning
"The only brand tool designed to challenge your
own strategy, not just generate it."

Value Proposition
"Turns an incomplete idea into a coherent,
stress-tested, launch-ready Brand OS."

Differentiator
"Structured decision workflow with built-in
brand stress-testing and validation."
```

---

### Section 7.3 — Identity

```
IDENTITY

Personality
confident  ·  decisive  ·  collaborative

Principles
1. AI recommends. You decide.
2. Structure over style.
3. Every decision has a reason.

Avoid
corporate  ·  vague  ·  generic

Naming Direction
Strategic / decision-focused
Action-oriented (Build, Break, OS)

Tagline
"Build it. Challenge it. Launch it."

One-Line Pitch
"BRANDOS turns a rough brand idea into a
stress-tested Brand OS in 20 minutes."
```

---

### Section 7.4 — Visual Direction

```
VISUAL DIRECTION

Note: This is a strategic visual brief.
Final execution belongs to a designer.

Color Direction
Dark / sophisticated base with precise accent color.
Avoid: neon, pastels, excessive gradients.

Typography Direction
Geometric sans-serif (primary)
Monospace (for data and AI content)
Avoid: script, slab, decorative fonts.

Shape Language
Clean edges, structured grids, minimal curves.

Imagery Direction
Abstract / conceptual. No stock-photo humans.
Data visualization aesthetics.

Visual Mood
Strategic · Precise · Premium · Minimal
```

---

### Section 7.5 — Voice

```
VOICE

Tone
Confident, direct, precise.
NOT corporate. NOT casual. NOT jargon-heavy.

Messaging Hierarchy
Primary:   "AI brand decision engine"
Secondary: "Stress-tests your strategy"
Tertiary:  "Coherent Brand OS output"

Sample Copy

Headline:
"Most tools generate brands. BRANDOS builds them."

Subheadline:
"A structured AI workflow that understands your idea,
 challenges it, and produces a launch-ready Brand OS."

Social one-liner:
"Your brand isn't ready until it's been broken.
 Then rebuilt. Try BRANDOS."
```

---

### Section 7.6 — Launch Kit

```
LAUNCH KIT

Landing Page Headline
"Build it. Challenge it. Launch it."

One-Line Pitch
"BRANDOS turns a rough idea into a stress-tested
Brand OS in 20 minutes."

Social Launch Copy
"We just launched BRANDOS — the AI brand tool that
actually tries to break your strategy before you do.
 
Enter your idea. Answer 5 questions. Get a Brand OS
that's been stress-tested by AI.
 
[link]"

Product Hunt Tagline
"The AI brand tool that attacks your strategy
to make it stronger."
```

---

### Section 7.7 — Validation

```
VALIDATION

Stress Test Summary
─────────────────────────────────────
Test                    Result   Action
─────────────────────────────────────
Cliché                  ✓ PASS   —
Audience Fit            ✓ PASS   —
Differentiation         ✗ FAIL   Fixed
Contradiction           ✓ PASS   —
Message Clarity         ⚠ WARN   Kept
Positioning Defense     ⚠ WARN   Fixed
─────────────────────────────────────

Consistency Check
─────────────────────────────────────
Voice                   ✓ PASS
Positioning             ✓ PASS (after repair)
Audience Fit            ✓ PASS
Personality             ✓ PASS
─────────────────────────────────────

Remaining Risks
⚠ Message Clarity — user kept original
  Recommendation still open
```

---

### Export / Share Button

Top-right of Brand OS page:

```
[ ↗ Export / Share ]
  ↳ Copy link
  ↳ Download as PDF  (P1 — implement if time allows)
```

---

## EMPTY STATES

Define these for every page. Never leave a blank white space.

### Discovery — No answers yet
```
🟡  Waiting for your first answer...
    Ask the first question above to begin.
```

### Strategy — No positioning generated
```
Complete Discovery first to unlock positioning.
[ ← Go to Discovery ]
```

### Brand DNA — Nothing approved yet
```
Accept your first positioning decision
to start building your Brand DNA.
```

### Stress Test — Not run yet
```
Complete Strategy to unlock Stress Test.
```

### Brand OS — Not complete
```
Complete Stress Test and Consistency
to generate your Brand OS.
[ ← Go to Stress Test ]
```

---

## LOADING STATES

Define for every AI call. NEVER use "Loading..."

### Discovery question loading
```
Analysing your answer...
```

### Positioning loading
```
Understanding your idea...       ✓
Finding positioning opportunities... ◌
Preparing strategic options...       ○
```

### Brand Battle loading
```
Building direction A...          ✓
Building direction B...          ✓
Building direction C...          ◌
Evaluating trade-offs...         ○
```

### Stress Test loading
```
Running cliché test...           ✓
Testing audience fit...          ✓
Checking differentiation...      ◌
Finding contradictions...        ○
Validating message clarity...    ○
Testing positioning defense...   ○
```

### Consistency loading
```
Reading your content...          ✓
Comparing to Brand DNA...        ◌
Generating repair suggestions... ○
```

### Brand OS loading
```
Compiling strategy...            ✓
Building identity sections...    ✓
Writing voice guidelines...      ◌
Preparing launch kit...          ○
Running final validation...      ○
```

---

## ERROR STATES

Define for every AI call. NEVER lose user state.

**Template:**
```
Something went wrong.

We couldn't complete this step. Your progress
is saved — you can try again.

[ ↺ Retry ]  [ ← Go back ]
```

Never show a technical error message to the user.
Always say "Something went wrong" + offer retry + preserve state.

---

## RESPONSIVE BEHAVIOR

Priority: 1440px → 1280px → 1024px → tablet

### Breakpoints

**1440px:** Full 3-panel layouts, all panels visible
**1280px:** Full layouts, slightly tighter padding
**1024px:** 2-panel layouts (collapse right panels into tabs or drawers)
**Tablet (768px):** Single column, panels become drawers/sheets

### Specific collapses

- Discovery: 3 panels → 1 panel + drawer for context
- Strategy: Tabs + side panel → Tabs full width + drawer for reasoning
- Brand DNA: Graph full width, node panel as overlay/sheet
- Brand OS: All sections visible, just narrower columns

---

## ACCESSIBILITY CHECKLIST

Before submitting:
- [ ] All buttons have visible focus rings
- [ ] All form inputs have labels (not just placeholders)
- [ ] All icons have aria-labels
- [ ] Color is not the only way to convey status (also use icons + text)
- [ ] Dialogs trap focus properly
- [ ] Keyboard navigation works through all tabs and forms
- [ ] Reduced motion support: wrap all animations in `@media (prefers-reduced-motion)`

---

## MOCK DATA FILE

Create `src/lib/mock-data.ts` with typed mock responses for every API endpoint.

Use these in your components while backend is being built.

```typescript
// src/lib/mock-data.ts

export const MOCK_PROJECT = {
  id: "proj_001",
  name: "BRANDOS",
  originalIdea: "An AI tool that helps founders build brand strategy",
  status: "strategy",
};

export const MOCK_DISCOVERY = {
  problem: "Founders build brands without strategic structure",
  targetAudience: ["Early-stage startup founders"],
  context: "B2B SaaS space",
  userNeed: "Structured brand decisions without a consultant",
  goals: ["Launch a brand identity", "Attract early users"],
  constraints: ["Bootstrap budget", "No design team"],
  assumptions: ["English-speaking market"],
  openQuestions: [],
};

export const MOCK_POSITIONING = {
  category: "AI Brand Strategy Tools",
  targetAudience: ["Early-stage startup founders"],
  coreProblem: "Brand inconsistency from unstructured decisions",
  valueProposition: "The only brand tool that stress-tests your strategy",
  differentiator: "Structured AI decision workflow with validation",
  competitiveAngle: "vs. one-prompt generators: depth, structure, validation",
  confidence: "high",
};

export const MOCK_BRAND_BATTLE = [
  {
    name: "THE STRATEGIST",
    coreIdea: "AI-powered brand decision system",
    positioning: "Depth and structure",
    personality: ["precise", "analytical", "trustworthy"],
    strengths: ["Unique positioning", "Premium feel"],
    risks: ["Complex to sell", "Narrow audience"],
    tradeoffs: ["Depth vs reach"],
    fit: { audience: "high", differentiation: "high", clarity: "medium", memorability: "medium" },
    aiRecommended: false,
  },
  {
    name: "THE CHALLENGER",
    coreIdea: "The brand tool that attacks your strategy",
    positioning: "Break → Rebuild → Launch",
    personality: ["confident", "bold", "decisive"],
    strengths: ["Memorable CTA", "Demo drama"],
    risks: ["Feels aggressive to some"],
    tradeoffs: ["Impact vs warmth"],
    fit: { audience: "high", differentiation: "high", clarity: "high", memorability: "high" },
    aiRecommended: true,
  },
  {
    name: "THE GUIDE",
    coreIdea: "Step-by-step brand mentor",
    positioning: "Structured brand guidance",
    personality: ["approachable", "clear", "educational"],
    strengths: ["Wide audience", "Easy to understand"],
    risks: ["Less distinctive", "Lower premium feel"],
    tradeoffs: ["Clarity vs differentiation"],
    fit: { audience: "high", differentiation: "low", clarity: "high", memorability: "medium" },
    aiRecommended: false,
  },
];

export const MOCK_STRESS_TESTS = [
  {
    testType: "Cliché",
    status: "pass",
    severity: "low",
    issue: "",
    evidence: "No common clichés detected in positioning",
    impact: "None",
    recommendation: "",
    alternative: "",
  },
  {
    testType: "Differentiation",
    status: "fail",
    severity: "high",
    issue: "Core claim used by multiple competitors",
    evidence: "AI brand strategy positioning appears in 3+ competitor tools",
    impact: "Low differentiation → harder to win attention",
    recommendation: "Shift to stress-test / validation angle",
    alternative: "The only brand tool designed to challenge your own strategy",
  },
  {
    testType: "Audience Fit",
    status: "pass",
    severity: "low",
    issue: "",
    evidence: "Messaging aligns with early-stage founder pain points",
    impact: "None",
    recommendation: "",
    alternative: "",
  },
  {
    testType: "Contradiction",
    status: "pass",
    severity: "low",
    issue: "",
    evidence: "No contradictions found between personality and voice",
    impact: "None",
    recommendation: "",
    alternative: "",
  },
  {
    testType: "Message Clarity",
    status: "warning",
    severity: "medium",
    issue: "Primary message requires prior category knowledge",
    evidence: "Brand decision engine may not be immediately understood",
    impact: "Higher bounce rate on landing page",
    recommendation: "Add a concrete one-line example below the headline",
    alternative: "",
  },
  {
    testType: "Positioning Defensibility",
    status: "warning",
    severity: "medium",
    issue: "Stress-test angle could be replicated quickly",
    evidence: "No technical moat — UX execution is the differentiator",
    impact: "Risk of copycat positioning if BRANDOS gains traction",
    recommendation: "Build Brand DNA graph as a visual moat",
    alternative: "",
  },
];
```

---

## INTEGRATION CHECKPOINTS WITH BACKEND

At these hours, sync with your partner:

**Hour 5:** Discovery UI ↔ Discovery API
- Your mock: `MOCK_DISCOVERY`
- Their endpoint: `POST /api/projects/:id/discovery`
- Replace mock with real call

**Hour 8:** Strategy ↔ Positioning / Battle API
- Your mock: `MOCK_POSITIONING`, `MOCK_BRAND_BATTLE`
- Their endpoints: `POST /api/projects/:id/position`, `/battle`

**Hour 12:** Stress Test ↔ Stress Test API
- Your mock: `MOCK_STRESS_TESTS`
- Their endpoint: `POST /api/projects/:id/stress-test`

**Hour 15:** Brand OS ↔ Finalize API
- Their endpoint: `POST /api/projects/:id/finalize`

---

## IMPLEMENTATION ORDER (YOUR PRIORITY)

Follow this. Don't start page 7 before page 3 works.

```
1.  Design tokens + globals
2.  WorkflowNav component
3.  AcceptRejectEdit component
4.  AIProgressIndicator component
5.  StatusBadge, ConfidenceTag, EmptyState
6.  Page 2: /new — idea input
7.  Page 3: /discover — 3-panel layout + mock data
8.  Page 4 Tab 1: Position — decision cards
9.  Page 4 Tab 4: Brand Battle — direction cards
10. Page 4 Tab 5: Brand DNA — graph + node panel
11. Page 5: Stress Test — hero → running → results
12. Page 6: Consistency — input + results panel
13. Page 7: Brand OS — all sections
14. Page 1: Landing — polish last
15. Responsive fixes
16. Animations
17. Integration with backend APIs
18. Error states + edge cases
```

---

## YOUR DEFINITION OF DONE

You are done when:

- [ ] Page 1 (Landing) explains what BRANDOS is and has a working CTA
- [ ] Page 2 (/new) accepts an idea and routes to discovery
- [ ] Page 3 (/discover) shows 3-panel interview with mock AI questions and builds visible understanding
- [ ] Page 4 (/strategy) shows all 5 tabs — Position, Shape, Visual, Brand Battle, Brand DNA with working node click
- [ ] Page 5 (/stress-test) runs animated test sequence and shows all 6 results with Accept/Reject/Edit
- [ ] Page 6 (/consistency) accepts text input and shows alignment result with repair suggestion
- [ ] Page 7 (/brand-os) shows all 7 sections in a clean document format
- [ ] WorkflowNav works on all project pages and shows correct step state
- [ ] All AcceptRejectEdit controls work and show visual feedback
- [ ] All AI loading states use meaningful text, not "Loading..."
- [ ] All empty and error states are handled
- [ ] Desktop layout works at 1440px, 1280px, 1024px
- [ ] No console errors

---

*This spec is your source of truth. Backend owns APIs. You own everything the user sees.*
*When in doubt: simpler, cleaner, more intentional.*
