/**
 * Rendering a `BrandState` as Markdown.
 *
 * The JSON is the source of truth; this is for reading. Sections not yet derived
 * are left out rather than shown empty.
 */
import { isSectionPopulated, populatedSections, resolveSelectedStrategy } from './state.ts';
import { summarize } from './stress.ts';
import type { BrandState } from './types.ts';

export function renderMarkdown(state: BrandState): string {
  const out: string[] = [];
  const heading = state.finalBrand?.name ?? state.naming.selectedName ?? 'Brand in progress';
  out.push(`# ${heading}`, '');

  const tagline = state.finalBrand?.tagline ?? state.naming.tagline.selected;
  if (tagline) out.push(`> ${tagline}`, '');

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

  if (isSectionPopulated(state, 'personality')) {
    const p = state.personality;
    out.push('## Personality', '');
    if (p.archetype) out.push(`**Archetype.** ${p.archetype}`, '');
    out.push(...list('Traits', p.traits));
    out.push(...list('Explicitly not', p.antiTraits));
    out.push(...list('Values', p.values));
    out.push(...list('Rationale', p.rationale));
  }

  if (isSectionPopulated(state, 'naming')) {
    const n = state.naming;
    out.push('## Naming', '');
    if (n.selectedName) out.push(`**Name.** ${n.selectedName}`, '');
    if (n.tagline.selected) out.push(`**Tagline.** ${n.tagline.selected}`, '');
    out.push(...list('Territories', n.territories));

    if (n.candidates.length > 0) {
      out.push('### Candidates', '');
      for (const candidate of n.candidates) {
        const mark = candidate.name === n.selectedName ? ' — chosen' : '';
        out.push(`**${candidate.name}**${mark} (${candidate.territory})`, '');
        out.push(...list('For', candidate.pros));
        out.push(...list('Against', candidate.cons));
      }
    }

    if (n.tagline.candidates.length > 0) {
      out.push(...list('Tagline candidates', n.tagline.candidates));
    }
  }

  if (isSectionPopulated(state, 'visualDirection')) {
    out.push('## Visual direction', '');
    out.push(...renderVisual(state.visualDirection));
  }

  if (isSectionPopulated(state, 'voice')) {
    out.push('## Voice', '');
    out.push(...renderVoice(state.voice));
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
    const summary = summarize(state.stressTests);

    out.push('## Stress tests', '');
    out.push(
      `${summary.critical} critical, ${summary.high} high, ${summary.medium} medium, ${summary.low} low.`,
      '',
    );
    out.push(
      summary.blocksFinalization
        ? '**Finalization is blocked** while a critical or high finding is still open.'
        : 'Nothing open at critical or high — the brand can be finalized.',
      '',
    );

    // Severity first, so the things that block come first; findings of equal
    // severity keep the order they were reported in.
    const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    const sorted = [...state.stressTests].sort(
      (a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9),
    );

    for (const finding of sorted) {
      const status = finding.status ?? 'open';
      const flag = status === 'open' ? '' : ` _(${status})_`;
      out.push(`### ${finding.severity} · ${finding.type}${flag}`, '');
      out.push(finding.issue, '');
      out.push(`**Evidence.** ${finding.evidence}`, '');
      out.push(`**Impact.** ${finding.impact}`, '');
      out.push(`**Recommendation.** ${finding.recommendation}`, '');
    }
  }

  if (isSectionPopulated(state, 'consistency')) {
    const c = state.consistency;
    out.push('## Consistency', '');
    out.push(
      c.status === 'consistent' ? 'The sections agree.' : 'Contradictions found.',
      '',
    );
    if (c.lastCheckedAt) {
      out.push(
        `Checked ${c.lastCheckedAt}${c.checkedAgainstVersion ? ` against schema ${c.checkedAgainstVersion}` : ''}.`,
        '',
      );
    }
    out.push(...list('Notes', c.notes ?? []));
  }

  if (state.finalBrand) {
    const f = state.finalBrand;
    out.push('## Final brand', '');
    out.push(`**${f.name}** — ${f.tagline}`, '');
    out.push(`Locked ${f.lockedAt}.`, '');
    out.push(`**Positioning.** ${f.positioningStatement}`, '');
    out.push(f.narrative, '');
    if (f.personality.archetype) out.push(`**Archetype.** ${f.personality.archetype}`, '');
    out.push(...list('Traits', f.personality.traits));
    out.push(...list('Explicitly not', f.personality.antiTraits));
    out.push(...list('Values', f.personality.values));
    out.push('### Voice', '');
    out.push(...renderVoice(f.voice));
    out.push('### Visual identity', '');
    out.push(...renderVisual(f.visualIdentity));
    out.push(...list('Applications', f.applications));
  }

  const remaining = populatedSections(state);
  if (remaining.length === 0) out.push('_Nothing derived yet._', '');

  return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}

function renderVoice(v: BrandState['voice']): string[] {
  const out: string[] = [];
  out.push(...list('Tone', v.toneAttributes));
  out.push(...list('Write like this', v.writingPrinciples));
  out.push(...list('Never write', v.avoid));
  out.push(`**Primary message.** ${v.messagingHierarchy.primaryMessage}`, '');
  out.push(...list('Supporting messages', v.messagingHierarchy.supportingMessages));
  return out;
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
