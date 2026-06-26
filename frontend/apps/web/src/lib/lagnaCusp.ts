/**
 * Lagna (Ascendant) cusp awareness — pure presentation helpers.
 *
 * A sign spans 30°. When the Ascendant sits near a sign boundary (a "cusp"), a
 * few minutes of birth time can flip the rising sign — which is exactly the
 * ambiguity birth-time rectification exists to resolve. These helpers compute,
 * for DISPLAY ONLY, how close a lagna is to a boundary and which adjacent sign
 * it is about to cross into. They never recompute astrology: the engine emits
 * the sign + degree; we only measure distance to the nearest boundary.
 */

/** Aries..Pisces in zodiacal order (engine Title-Case names). */
const ZODIAC_ORDER: readonly string[] = [
  'Aries',
  'Taurus',
  'Gemini',
  'Cancer',
  'Leo',
  'Virgo',
  'Libra',
  'Scorpio',
  'Sagittarius',
  'Capricorn',
  'Aquarius',
  'Pisces',
];

const SIGN_SPAN = 30;

/** Adjacent sign in the cycle; `step` is -1 (previous) or +1 (next). */
function neighbour(sign: string, step: number): string | null {
  const index = ZODIAC_ORDER.indexOf(sign);
  if (index < 0) {
    return null;
  }
  return ZODIAC_ORDER[(index + step + ZODIAC_ORDER.length) % ZODIAC_ORDER.length];
}

/** Degrees from the lagna to the nearer of the two 0°/30° sign boundaries. */
export function degreesToNearestCusp(signDegrees: number): number {
  return Math.min(signDegrees, SIGN_SPAN - signDegrees);
}

/** The adjacent sign a near-boundary lagna is about to cross into, and how far. */
export interface CuspInfo {
  /** The neighbouring sign (previous at the lower boundary, next at the upper). */
  readonly neighbourSign: string;
  /** Degrees from the lagna to that boundary. */
  readonly degrees: number;
}

/**
 * Describe a cusp when the lagna is within `threshold` degrees of a sign
 * boundary, else `null`. The lower boundary points at the PREVIOUS sign, the
 * upper boundary at the NEXT sign; the cycle wraps (Aries↔Pisces). Returns
 * `null` for an unknown sign name rather than throwing.
 */
export function cuspInfo(sign: string, signDegrees: number, threshold = 3): CuspInfo | null {
  const toLower = signDegrees;
  const toUpper = SIGN_SPAN - signDegrees;
  if (toLower <= toUpper) {
    if (toLower > threshold) {
      return null;
    }
    const neighbourSign = neighbour(sign, -1);
    return neighbourSign === null ? null : { neighbourSign, degrees: toLower };
  }
  if (toUpper > threshold) {
    return null;
  }
  const neighbourSign = neighbour(sign, 1);
  return neighbourSign === null ? null : { neighbourSign, degrees: toUpper };
}
