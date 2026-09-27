/**
 * Recording the human's choice of name and tagline.
 *
 * Kept beside the strategy selection it mirrors: the model proposes candidates, a person
 * picks one, and the pick is validated against what was actually offered. A name that was
 * never a candidate cannot be selected here, because then the Brand OS would present a
 * decision nothing in the pipeline had reasoned about.
 */
import type { Naming } from './types.ts';

/** Thrown when a chosen name or tagline is not one of the candidates. */
export class NameNotOfferedError extends Error {
  readonly offered: string[];

  constructor(kind: 'name' | 'tagline', chosen: string, offered: string[]) {
    super(
      `"${chosen}" is not one of the ${kind} candidates. Offered: ${offered.join(', ')}. ` +
        'Pick one of those, or re-run the naming stage to get different candidates.',
    );
    this.name = 'NameNotOfferedError';
    this.offered = offered;
  }
}

/**
 * Returns a `Naming` with the selection recorded.
 *
 * Case-insensitive on input but stores the candidate's own spelling, so the deliverable
 * shows the name as it was written rather than as it was typed.
 */
export function selectName(
  naming: Naming,
  choice: { name: string; tagline: string },
): Naming {
  const names = naming.candidates.map((candidate) => candidate.name);
  const matchedName = names.find(
    (name) => name.toLowerCase() === choice.name.trim().toLowerCase(),
  );
  if (matchedName === undefined) {
    throw new NameNotOfferedError('name', choice.name, names);
  }

  const matchedTagline = naming.tagline.candidates.find(
    (line) => line.toLowerCase() === choice.tagline.trim().toLowerCase(),
  );
  if (matchedTagline === undefined) {
    throw new NameNotOfferedError('tagline', choice.tagline, [...naming.tagline.candidates]);
  }

  return {
    ...naming,
    selectedName: matchedName,
    tagline: { ...naming.tagline, selected: matchedTagline },
  };
}
