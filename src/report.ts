/**
 * Rendering a `BrandState` as Markdown.
 *
 * The JSON is the source of truth; this is for reading. Sections not yet derived
 * are left out rather than shown empty.
 */
import { isSectionPopulated, populatedSections, resolveSelectedStrategy } from './state.ts';
import type { BrandState } from './types.ts';

export function renderMarkdown(state: BrandState): string {
  const out: string[] = [];
  const heading = state.finalBrand?.name ?? 'Brand in progress';
  out.push(`# ${heading}`, '');

  if (state.finalBrand) out.push(`> ${state.finalBrand.tagline}`, '');

  out.push('## Project', '');
  out.push(`- **Idea:** ${state.project.idea}`);
  if (state.project.productType) out.push(`- **Type:** ${state.project.productType}`);
  if (state.project.goal) out.push(`- **Goal:** ${state.project.goal}`);
  out.push('');

  if (isSectionPopulated(state, 'discovery')) {
    const d = state.discovery;
    out.push('## Discovery', '');
    out.push(`**Problem.** ${d.problem}`, '');
    out.push(`**Audience.** ${d.targetAudience}`, '');
    out.push(`**Need.** ${d.userNeed}`, '');
    out.push(...list('Goals', d.goals));
    out.push(...list('Constraints', d.constraints));
    out.push(...list('Assumptions', d.assumptions));
    out.push(...list('Open questions', d.openQuestions));
  }

  if (isSectionPopulated(state, 'positioning')) {
    const p = state.positioning;
    out.push('## Positioning', '');
    out.push(`**Category.** ${p.category}`, '');
    out.push(`**Value proposition.** ${p.valueProposition}`, '');
    out.push(`**Differentiator.** ${p.differentiator}`, '');
    out.push(`**Competitive angle.** ${p.competitiveAngle}`, '');
    out.push(...list('Rationale', p.rationale));
  }

  if (isSectionPopulated(state, 'shape')) {
    const s = state.shape;
    out.push('## Shape', '');
    out.push(...list('Personality', s.personality));
    out.push(...list('Principles', s.principles));

    if (s.namingTerritories.length > 0) {
      out.push('### Naming territories', '');
      for (const t of s.namingTerritories) {
        out.push(`**${t.name}.** ${t.rationale}`);
        out.push(`Examples: ${t.examples.join(', ')}`, '');
      }
    }

    if (s.taglineDirections.length > 0) {
      out.push('### Tagline directions', '');
      for (const t of s.taglineDirections) {
        out.push(`- **${t.tagline}** — ${t.rationale}${fit(t.personalityFit)}`);
      }
      out.push('');
    }

    if (s.messagingHierarchy.length > 0) {
      out.push('### Messaging hierarchy', '');
      for (const m of s.messagingHierarchy) {
        out.push(`- **${m.level}** (${m.audience}): ${m.message}`);
      }
      out.push('');
    }
  }

  if (isSectionPopulated(state, 'visualDirection')) {
    out.push('## Visual direction', '');
    out.push(...renderVisual(state.visualDirection));
  }

  if (state.strategyOptions.length > 0) {
    const selected = resolveSelectedStrategy(state);

    out.push('## Strategy options', '');
    out.push(
      selected === undefined
        ? '_No direction chosen yet._'
        : `Chosen: **${selected.direction}**${state.selectedStrategy?.chosenAt ? ` (${state.selectedStrategy.chosenAt})` : ''}`,
      '',
    );
    if (state.selectedStrategy?.reasonChosen) {
      out.push(`Reason: ${state.selectedStrategy.reasonChosen}`, '');
    }

    // Every option is kept, including the ones not picked, so the road not taken
    // stays on the record rather than disappearing behind the decision.
    for (const option of state.strategyOptions) {
      const mark = option.direction === selected?.direction ? ' — chosen' : '';
      out.push(`### ${option.direction}${mark}`, '');
      out.push(option.positioning, '');
      out.push(...list('Strengths', option.strengths));
      out.push(...list('Risks', option.risks));
      out.push(`**Audience fit.** ${option.audienceFit}`, '');
      out.push(`**Differentiation.** ${option.differentiation}`, '');
      out.push(...list('Rationale', option.rationale));
    }
  }

  if (state.stressTests.length > 0) {
    out.push('## Stress tests', '');
    out.push('| Dimension | Severity | Held up | Finding | Recommendation |');
    out.push('|---|---|---|---|---|');
    for (const t of state.stressTests) {
      out.push(
        `| ${cell(t.dimension)} | ${t.severity} | ${t.passed ? 'yes' : 'no'} | ${cell(t.finding)} | ${cell(t.recommendation)} |`,
      );
    }
    out.push('');
  }

  if (isSectionPopulated(state, 'consistency')) {
    const c = state.consistency;
    out.push('## Consistency', '');
    out.push(c.coherent ? 'No high-severity contradictions found.' : 'Contradictions found.', '');
    if (c.issues.length > 0) {
      for (const issue of c.issues) {
        out.push(`- **${issue.sections.join(' ↔ ')}** (${issue.severity}): ${issue.conflict}`);
        out.push(`  - Resolution: ${issue.resolution}`);
      }
      out.push('');
    }
    out.push(...list('Strengths', c.strengths));
  }

  if (state.finalBrand) {
    const f = state.finalBrand;
    out.push('## Final brand', '');
    out.push(`**${f.name}** — ${f.tagline}`, '');
    out.push(`**Positioning.** ${f.positioningStatement}`, '');
    out.push(f.narrative, '');
    out.push(...list('Personality', f.personality));
    out.push(...list('Principles', f.principles));
    out.push('### Voice', '');
    out.push(`**Tone.** ${f.voice.tone}`, '');
    out.push(...list('Does', f.voice.does));
    out.push(...list('Avoids', f.voice.donts));
    out.push('### Messaging', '');
    for (const m of f.messaging) out.push(`- **${m.level}** (${m.audience}): ${m.message}`);
    out.push('');
    out.push('### Visual identity', '');
    out.push(...renderVisual(f.visualIdentity));
    out.push(...list('Applications', f.applications));
  }

  const remaining = populatedSections(state);
  if (remaining.length === 0) out.push('_Nothing derived yet._', '');

  return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}

function renderVisual(v: BrandState['visualDirection']): string[] {
  const out: string[] = [];
  out.push(...list('Colors', v.colors));
  out.push(`**Typography.** ${v.typography}`, '');
  out.push(`**Imagery.** ${v.imagery}`, '');
  out.push(`**Shapes.** ${v.shapes}`, '');
  out.push(`**Mood.** ${v.mood}`, '');
  out.push(...list('Avoid', v.avoid));
  return out;
}

function list(title: string, items: readonly string[]): string[] {
  if (items.length === 0) return [];
  return [`**${title}.**`, '', ...items.map((item) => `- ${item}`), ''];
}

function fit(traits: readonly string[]): string {
  return traits.length > 0 ? ` _(${traits.join(', ')})_` : '';
}

/** Escapes pipes so a finding containing one does not break the table row. */
function cell(text: string): string {
  return text.replace(/\|/g, '\\|');
}
