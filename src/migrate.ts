/**
 * Migrating stored states onto the current contract.
 *
 * Phase 6 retired `shape` and restructured `consistency`, which makes every state
 * written before it unreadable. The contract says that needs a migration pass rather
 * than a silent patch in one place, so it lives here, runs on load, and reports what
 * it had to guess.
 *
 * The rule throughout: never invent brand content. Where the old shape held no
 * equivalent for a new field, the field is left empty and the step that owns it can
 * fill it in — a migration that fabricates a tone of voice is worse than one that
 * leaves a gap.
 */
import { randomUUID } from 'node:crypto';
import { SCHEMA_VERSION } from './schemas.ts';
import type { BrandState, Consistency, Naming, Personality, Voice } from './types.ts';

export type MigrationResult = {
  state: BrandState;
  /** The contract version the input was built against, as far as it could be told. */
  from: string;
  /** What changed, and what could not be carried across. */
  notes: string[];
};

/** `'1.2.0'` -> `[1, 2, 0]`, with anything unparseable reading as oldest. */
function versionParts(value: unknown): [number, number, number] {
  if (typeof value !== 'string') return [0, 0, 0];
  const parts = value.split('.').map((part) => Number.parseInt(part, 10));
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

/** True when `stored` is older than the version this code writes. */
function isOlderThanCurrent(stored: unknown): boolean {
  const [a, b, c] = versionParts(stored);
  const [x, y, z] = versionParts(SCHEMA_VERSION);
  if (a !== x) return a < x;
  if (b !== y) return b < y;
  return c < z;
}

/**
 * Whether a value looks like a state from before this contract.
 *
 * The version comparison matters as much as the structural markers: 1.3.0 added required
 * fields to `consistency` without changing anything a marker would catch, so a 1.2.0
 * state looks structurally current while failing validation. Comparing versions covers
 * that, and every later bump, rather than needing a new marker each time.
 */
export function needsMigration(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;

  return (
    'shape' in record ||
    record.schemaVersion === undefined ||
    isOlderThanCurrent(record.schemaVersion) ||
    (typeof record.consistency === 'object' &&
      record.consistency !== null &&
      'coherent' in (record.consistency as Record<string, unknown>))
  );
}

/**
 * Brings a stored state onto the current contract.
 *
 * Tolerant by design: it is reading data written by older code, so every branch is
 * treated as possibly absent or malformed rather than trusted. Anything it cannot
 * interpret becomes an empty branch and a note, never a guess.
 */
export function migrateState(value: unknown): MigrationResult {
  if (value === null || typeof value !== 'object') {
    throw new TypeError('Cannot migrate a value that is not an object.');
  }

  const input = value as Record<string, any>;
  const notes: string[] = [];
  const from = typeof input.schemaVersion === 'string' ? input.schemaVersion : 'pre-1.0.0';
  const now = new Date().toISOString();

  const shape = (input.shape ?? {}) as Record<string, any>;
  const hasShape = input.shape !== undefined && input.shape !== null;

  const personality: Personality = input.personality ?? {
    traits: stringList(shape.personality),
    // Nothing in the old shape recorded what the brand was not.
    antiTraits: [],
    values: stringList(shape.principles),
    rationale: [],
  };

  const naming: Naming = input.naming ?? {
    territories: (Array.isArray(shape.namingTerritories) ? shape.namingTerritories : [])
      .map((territory: any) =>
        typeof territory?.name === 'string'
          ? territory.rationale
            ? `${territory.name} (${territory.rationale})`
            : territory.name
          : undefined,
      )
      .filter((entry: unknown): entry is string => typeof entry === 'string'),
    candidates: (Array.isArray(shape.namingTerritories) ? shape.namingTerritories : []).flatMap(
      (territory: any) =>
        (Array.isArray(territory?.examples) ? territory.examples : [])
          .filter((name: unknown) => typeof name === 'string')
          .map((name: string) => ({
            name,
            territory: typeof territory?.name === 'string' ? territory.name : 'unknown',
            // The old shape recorded no per-name assessment, and inventing one here
            // would put words in a strategist's mouth.
            pros: [],
            cons: [],
          })),
    ),
    tagline: {
      candidates: (Array.isArray(shape.taglineDirections) ? shape.taglineDirections : [])
        .map((direction: any) => direction?.tagline)
        .filter((entry: unknown): entry is string => typeof entry === 'string'),
    },
  };

  const voice: Voice = input.voice ?? {
    // The old shape had no tone attributes, writing principles or avoid list at all.
    toneAttributes: [],
    writingPrinciples: [],
    avoid: [],
    messagingHierarchy: messagingFrom(shape.messagingHierarchy),
  };

  if (hasShape) {
    notes.push('shape.personality and shape.principles moved to personality.traits and personality.values');
    notes.push('shape.namingTerritories moved to naming.territories and naming.candidates');
    notes.push('shape.taglineDirections moved to naming.tagline.candidates');
    notes.push('shape.messagingHierarchy moved to voice.messagingHierarchy');
    notes.push(
      'personality.antiTraits, personality.rationale, voice.toneAttributes, voice.writingPrinciples ' +
        'and voice.avoid had no equivalent in shape and are empty — re-run those steps to fill them',
    );
    if (naming.candidates.length > 0) {
      notes.push('naming.candidates carry no pros or cons, which the old shape did not record');
    }
  }

  const consistency = migrateConsistency(input.consistency, notes);
  const positioning = migratePositioning(input.positioning, notes);
  const visualDirection = migrateVisualDirection(input.visualDirection, notes);

  const state = {
    id: typeof input.id === 'string' ? input.id : randomUUID(),
    schemaVersion: SCHEMA_VERSION,
    createdAt: typeof input.createdAt === 'string' ? input.createdAt : now,
    updatedAt: now,

    project: input.project ?? { idea: '' },
    discovery: input.discovery,
    positioning,
    strategyOptions: Array.isArray(input.strategyOptions) ? input.strategyOptions : [],
    ...(input.selectedStrategy === undefined ? {} : { selectedStrategy: input.selectedStrategy }),
    personality,
    naming,
    visualDirection,
    voice,
    stressTests: Array.isArray(input.stressTests) ? input.stressTests : [],
    consistency,
    ...(input.finalBrand === undefined ? {} : { finalBrand: input.finalBrand }),
  } as BrandState;

  if (typeof input.id !== 'string') notes.push('an id was generated, since the stored state had none');
  if (from === 'pre-1.0.0') notes.push(`schemaVersion set to ${SCHEMA_VERSION}`);

  return { state, from, notes };
}

/**
 * Schema 1.2.0 added `composition`, `visualPersonality` and `rationale` to the visual
 * direction.
 *
 * There is nothing in an older state to derive them from, so they arrive empty. That is
 * deliberate: inventing a composition or a trait mapping would be exactly the
 * disconnected-from-strategy guess this stage exists to prevent. An already-populated
 * visual direction will therefore fail `validateState` until the stage is re-run, which
 * is the honest signal — the note says so.
 */
function migrateVisualDirection(value: unknown, notes: string[]): unknown {
  if (value === null || value === undefined || typeof value !== 'object') return value;

  const old = value as Record<string, unknown>;
  if (typeof old.composition === 'string' && typeof old.visualPersonality === 'string') return old;

  const wasPopulated = typeof old.mood === 'string' && old.mood !== '';
  notes.push(
    'visualDirection gained composition, visualPersonality and rationale in schema 1.2.0; they are ' +
      (wasPopulated
        ? 'empty because the stored state predates them — re-run the visualize stage to fill them'
        : 'empty, which is correct for a section that has not been derived yet'),
  );

  return {
    ...old,
    composition: typeof old.composition === 'string' ? old.composition : '',
    visualPersonality: typeof old.visualPersonality === 'string' ? old.visualPersonality : '',
    rationale: Array.isArray(old.rationale) ? old.rationale : [],
  };
}

/**
 * Schema 1.1.0 added `assumptions` and `confidence` to positioning.
 *
 * `assumptions` becomes an empty list, which is honest — the older version recorded
 * none. `confidence` is left absent rather than defaulted, because a confidence nobody
 * assessed is exactly the kind of invented certainty the pipeline exists to avoid.
 */
function migratePositioning(value: unknown, notes: string[]): unknown {
  if (value === null || value === undefined || typeof value !== 'object') return value;

  const old = value as Record<string, unknown>;
  if (Array.isArray(old.assumptions)) return old;

  notes.push(
    'positioning.assumptions added as an empty list, and confidence left unset — ' +
      'schema 1.1.0 records both, and the stored state predates them',
  );
  return { ...old, assumptions: [] };
}

/**
 * The old consistency object recorded `coherent` plus issues and strengths; the new
 * one records a status and flat notes. The issues and strengths are folded into the
 * notes so the findings survive the move rather than being dropped.
 */
function migrateConsistency(value: unknown, notes: string[]): Consistency {
  if (value === null || value === undefined || typeof value !== 'object') {
    return blankConsistency();
  }

  const old = value as Record<string, any>;

  // Already on a status-based shape. 1.3.0 added structured findings, so a state
  // written before that has a status but no findings array: it was checked, and the
  // conflicts it found survive only as prose in notes. Backfilling empty arrays keeps
  // the status honest rather than inventing findings it never recorded.
  if (typeof old.status === 'string') {
    const upgraded: Consistency = {
      ...(old as Consistency),
      findings: Array.isArray(old.findings) ? old.findings : [],
      dimensionsChecked: Array.isArray(old.dimensionsChecked) ? old.dimensionsChecked : [],
    };
    if (!Array.isArray(old.findings)) {
      notes.push(
        'consistency gained structured findings; the previous result kept its status and notes, ' +
          'so re-run the check to get findings',
      );
    }
    return upgraded;
  }
  if (!('coherent' in old)) return blankConsistency();

  const issues = Array.isArray(old.issues) ? old.issues : [];
  const strengths = Array.isArray(old.strengths) ? old.strengths : [];

  // An old state that was never checked left coherent false with nothing recorded,
  // which is not the same as having been checked and found inconsistent.
  if (issues.length === 0 && strengths.length === 0 && old.coherent !== true) {
    notes.push('consistency had no recorded result, so it reads as not-yet-checked');
    return blankConsistency();
  }

  const carried = [
    ...issues.map((issue: any) =>
      [
        Array.isArray(issue?.sections) ? issue.sections.join(' / ') : 'unknown',
        issue?.severity ? `(${issue.severity})` : '',
        issue?.conflict ?? '',
        issue?.resolution ? `→ ${issue.resolution}` : '',
      ]
        .filter((part) => part !== '')
        .join(' '),
    ),
    ...strengths.map((strength: string) => `holds together: ${strength}`),
  ];

  notes.push('consistency.coherent became a status, with its issues and strengths folded into notes');

  return {
    status: issues.length > 0 ? 'issues-found' : 'consistent',
    // The old issues carried no category or dimensions, so they cannot be rebuilt as
    // structured findings without inventing fields. They stay in notes.
    findings: [],
    dimensionsChecked: [],
    ...(carried.length > 0 ? { notes: carried } : {}),
  };
}

/** An unchecked consistency section. */
function blankConsistency(): Consistency {
  return { status: 'not-yet-checked', findings: [], dimensionsChecked: [] };
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

/** Folds the old ordered messaging layers into a primary message plus supporting ones. */
function messagingFrom(layers: unknown): Voice['messagingHierarchy'] {
  if (!Array.isArray(layers) || layers.length === 0) {
    return { primaryMessage: '', supportingMessages: [] };
  }

  const messages = layers
    .map((layer: any) => (typeof layer?.message === 'string' ? layer.message : undefined))
    .filter((entry): entry is string => entry !== undefined);

  return {
    primaryMessage: messages[0] ?? '',
    supportingMessages: messages.slice(1),
  };
}
