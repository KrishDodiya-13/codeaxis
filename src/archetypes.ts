/**
 * The strategic direction vocabulary, and the machinery for keeping directions apart.
 *
 * BRAND BATTLE exists because a single AI-generated position is a guess dressed up
 * as a decision. The thing that makes it worth running is that the options are
 * *meaningfully* different — and "be different" as an instruction produces three
 * versions of one idea with different adjectives. So divergence is made structural
 * here: strategies are generated against named archetypes chosen to pull in
 * genuinely different directions, and the results are checked rather than trusted.
 */

export const DIRECTIONS = [
  'CONNECTION',
  'OUTCOMES',
  'COMPETITION',
  'TRUST',
  'ACCESSIBILITY',
  'CRAFT',
  'REBELLION',
] as const;

export type Direction = (typeof DIRECTIONS)[number];

export type Archetype = {
  direction: Direction;
  /** What this direction appeals to. */
  coreAppeal: string;
  /** The angle in one line, as a user would hear it. */
  typicalAngle: string;
  /**
   * Where this direction sits on the axes below, each 0..1.
   *
   * These are a deliberate simplification whose only job is to let
   * `chooseDirections` pick a spread rather than three neighbours. They are not a
   * theory of branding, and nothing downstream reads them as one.
   */
  axes: {
    /** 0 = appeals to the individual, 1 = appeals to the collective. */
    collective: number;
    /** 0 = functional and instrumental, 1 = emotional and identity-driven. */
    emotional: number;
    /** 0 = works with the grain of the category, 1 = set against it. */
    oppositional: number;
    /** 0 = promises safety, 1 = promises upside. */
    ambition: number;
  };
};

export const ARCHETYPES: Record<Direction, Archetype> = {
  CONNECTION: {
    direction: 'CONNECTION',
    coreAppeal: 'Belonging, community, relationships',
    typicalAngle: "You'll find your people",
    axes: { collective: 1.0, emotional: 0.85, oppositional: 0.2, ambition: 0.5 },
  },
  OUTCOMES: {
    direction: 'OUTCOMES',
    coreAppeal: 'Efficiency, results, getting it done',
    typicalAngle: "You'll ship faster and better",
    axes: { collective: 0.2, emotional: 0.05, oppositional: 0.3, ambition: 0.6 },
  },
  COMPETITION: {
    direction: 'COMPETITION',
    coreAppeal: 'Status, ambition, winning',
    typicalAngle: "You'll prove yourself and stand out",
    axes: { collective: 0.1, emotional: 0.7, oppositional: 0.4, ambition: 1.0 },
  },
  TRUST: {
    direction: 'TRUST',
    coreAppeal: 'Safety, reliability, reduced risk',
    typicalAngle: 'You can count on this',
    axes: { collective: 0.4, emotional: 0.25, oppositional: 0.1, ambition: 0.0 },
  },
  ACCESSIBILITY: {
    direction: 'ACCESSIBILITY',
    coreAppeal: 'Ease, inclusion, a low barrier to entry',
    typicalAngle: 'Anyone can do this, no gatekeeping',
    axes: { collective: 0.75, emotional: 0.5, oppositional: 0.6, ambition: 0.3 },
  },
  CRAFT: {
    direction: 'CRAFT',
    coreAppeal: 'Quality, expertise, mastery',
    typicalAngle: 'This is built by people who care',
    axes: { collective: 0.35, emotional: 0.6, oppositional: 0.15, ambition: 0.45 },
  },
  REBELLION: {
    direction: 'REBELLION',
    coreAppeal: 'Against the status quo and the incumbents',
    typicalAngle: 'The old way is broken',
    axes: { collective: 0.6, emotional: 0.9, oppositional: 1.0, ambition: 0.8 },
  },
};

export function isDirection(value: string): value is Direction {
  return (DIRECTIONS as readonly string[]).includes(value);
}

/** Euclidean distance between two archetypes across the axes. */
export function archetypeDistance(a: Direction, b: Direction): number {
  const x = ARCHETYPES[a].axes;
  const y = ARCHETYPES[b].axes;
  return Math.sqrt(
    (x.collective - y.collective) ** 2 +
      (x.emotional - y.emotional) ** 2 +
      (x.oppositional - y.oppositional) ** 2 +
      (x.ambition - y.ambition) ** 2,
  );
}

/** The smallest distance between any two of `directions`. Higher is a wider spread. */
export function minimumSpread(directions: readonly Direction[]): number {
  if (directions.length < 2) return Number.POSITIVE_INFINITY;

  let smallest = Number.POSITIVE_INFINITY;
  for (let i = 0; i < directions.length; i++) {
    for (let j = i + 1; j < directions.length; j++) {
      smallest = Math.min(smallest, archetypeDistance(directions[i]!, directions[j]!));
    }
  }
  return smallest;
}

/**
 * Picks `count` directions that are as far apart as possible.
 *
 * Maximises the *minimum* pairwise distance, which is what "maximally distant"
 * has to mean for a set: maximising the average would happily pair two
 * neighbours with one outlier. The vocabulary is small enough to check every
 * combination exactly — 35 of them for the default of 3 — so there is no need to
 * approximate, and the result is deterministic.
 *
 * Ties break toward the order in `DIRECTIONS`, so the same input always produces
 * the same answer.
 */
export function chooseDirections(count = 3): Direction[] {
  if (count < 1) throw new RangeError('count must be at least 1');
  if (count > DIRECTIONS.length) {
    throw new RangeError(
      `count cannot exceed the ${DIRECTIONS.length} directions in the vocabulary.`,
    );
  }

  let best: Direction[] = [];
  let bestSpread = -1;

  for (const combination of combinations([...DIRECTIONS], count)) {
    const spread = minimumSpread(combination);
    if (spread > bestSpread) {
      bestSpread = spread;
      best = combination;
    }
  }

  return best;
}

function* combinations<T>(items: T[], size: number): Generator<T[]> {
  if (size === 0) {
    yield [];
    return;
  }

  for (let i = 0; i <= items.length - size; i++) {
    for (const rest of combinations(items.slice(i + 1), size - 1)) {
      yield [items[i]!, ...rest];
    }
  }
}

/** Thrown when a caller forces directions that cannot be used. */
export class InvalidDirectionsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDirectionsError';
  }
}

/**
 * Validates caller-supplied directions.
 *
 * Case-insensitive, since these arrive over HTTP and the vocabulary is written in
 * caps. Duplicates are rejected rather than silently collapsed: two strategies
 * sharing a direction is the first distinctness failure, and a caller who asked
 * for it should be told, not quietly given fewer strategies than requested.
 */
export function normalizeDirections(directions: readonly string[]): Direction[] {
  if (directions.length === 0) {
    throw new InvalidDirectionsError('"directions" was empty. Omit it to have them chosen for you.');
  }

  const normalized: Direction[] = [];
  const seen = new Set<Direction>();

  for (const raw of directions) {
    const candidate = raw.trim().toUpperCase();
    if (!isDirection(candidate)) {
      throw new InvalidDirectionsError(
        `"${raw}" is not a known direction. Choose from: ${DIRECTIONS.join(', ')}.`,
      );
    }
    if (seen.has(candidate)) {
      throw new InvalidDirectionsError(
        `"${candidate}" appears twice. Each strategy needs its own direction.`,
      );
    }
    seen.add(candidate);
    normalized.push(candidate);
  }

  return normalized;
}

/** Words carrying no distinguishing signal, ignored when comparing two texts. */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'than', 'that', 'this', 'these', 'those',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'to', 'of', 'in', 'on', 'at', 'by', 'for',
  'with', 'from', 'as', 'it', 'its', 'they', 'them', 'their', 'who', 'whom', 'which', 'what',
  'not', 'no', 'more', 'most', 'less', 'least', 'very', 'just', 'only', 'also', 'can', 'could',
  'would', 'should', 'will', 'may', 'might', 'do', 'does', 'did', 'have', 'has', 'had', 'you',
  'your', 'we', 'our', 'us', 'i', 'me', 'my', 'so', 'up', 'out', 'about', 'into', 'over', 'all',
  'some', 'any', 'each', 'other', 'others', 'both', 'same', 'such', 'own', 'too', 'here', 'there',
  'when', 'where', 'while', 'because', 'since', 'unlike', 'versus', 'vs', 'rather',
]);

/**
 * Reduces a word to a crude stem.
 *
 * Without this, "we verify members" and "verifying the members" look like different
 * claims to the overlap check — which is exactly the restatement it exists to
 * catch, since a model rewording a claim naturally changes inflections. The rules
 * are deliberately shallow and only fire on words long enough that trimming cannot
 * collapse two genuinely different short words together.
 */
export function stem(word: string): string {
  for (const [suffix, minLength] of [
    ['ingly', 7],
    ['edly', 6],
    ['ing', 6],
    ['ies', 5],
    ['ied', 5],
    ['ed', 5],
    ['ly', 5],
    ['es', 5],
    ['s', 4],
  ] as const) {
    if (word.length >= minLength && word.endsWith(suffix)) {
      return word.slice(0, -suffix.length);
    }
  }
  return word;
}

/**
 * The comparable content words of a text: lowercased, de-punctuated, stopword-free
 * and stemmed.
 */
export function contentWords(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((word) => word.length > 2 && !STOPWORDS.has(word))
    .map(stem);

  return new Set(words);
}

/**
 * How much two texts overlap, 0..1, as Jaccard similarity over content words.
 *
 * This is a lexical measure, and its limits are the reason the distinctness check
 * does not rely on it for prose. It is applied to the short canonical fields the
 * model is asked to write — a one-line claim, a short segment label — where two
 * strategies making the same bet tend to reach for the same few words. Comparing
 * whole paragraphs this way would miss the same idea in different words, which is
 * exactly the failure this phase is about.
 */
export function overlapRatio(a: string, b: string): number {
  const first = contentWords(a);
  const second = contentWords(b);
  if (first.size === 0 || second.size === 0) return 0;

  let shared = 0;
  for (const word of first) {
    if (second.has(word)) shared++;
  }

  return shared / (first.size + second.size - shared);
}

/** Overlap between two lists, comparing them as one bag of words each. */
export function listOverlapRatio(a: readonly string[], b: readonly string[]): number {
  return overlapRatio(a.join(' '), b.join(' '));
}
