/**
 * Bet Size Action Abstraction Engine
 *
 * Implements the Pseudo-Harmonic Mapping (PHM) formula from:
 *   "GTO Bet Sizing and Action Abstraction Mechanics"
 *
 * PHM maps an off-tree bet size x between two abstraction bounds A and B,
 * preserving Lipschitz continuity so that small bet deviations produce smooth
 * (non-volatile) strategy blends rather than hard bucket-cuts.
 *
 * Formula (Brown & Sandholm, 2014):
 *   f(x) = (B - x)(1 + A) / ((B - A)(1 + x))
 *
 * f(x) = probability of assigning to lower bound A
 * 1-f(x) = probability of assigning to upper bound B
 */

export interface BetBucket {
  action: string;
  potFraction: number; // e.g. 0.33 for 33% pot
  ev: number;
  frequency: number;
}

/**
 * Pseudo-Harmonic Mapping: returns the weight toward the LOWER bound A.
 * Weight toward upper bound B = 1 - pseudoHarmonicMap(x, A, B).
 *
 * @param x  Off-tree bet fraction (e.g. 0.45 for a 45% pot bet)
 * @param A  Lower abstraction bound (e.g. 0.33)
 * @param B  Upper abstraction bound (e.g. 0.75)
 * @returns  Weight in [0, 1] for lower bound A
 */
export function pseudoHarmonicMap(x: number, A: number, B: number): number {
  if (A >= B) return 1.0;
  if (x <= A) return 1.0;
  if (x >= B) return 0.0;
  const numerator = (B - x) * (1 + A);
  const denominator = (B - A) * (1 + x);
  return denominator === 0 ? 0.5 : Math.max(0, Math.min(1, numerator / denominator));
}

/**
 * Given an off-tree bet fraction x and a sorted list of defined bet buckets,
 * returns a blended bucket (EV and frequency interpolated via PHM between the
 * two nearest neighbours).
 *
 * @param betFraction  Actual bet as a fraction of pot (e.g. 0.45)
 * @param buckets      Sorted ascending by potFraction
 * @returns            { ev, frequency, lowerAction, upperAction, weightLower }
 */
export function blendBucketsViaPHM(
  betFraction: number,
  buckets: BetBucket[]
): {
  ev: number;
  frequency: number;
  lowerAction: string;
  upperAction: string;
  weightLower: number;
} {
  if (buckets.length === 0) {
    return { ev: 0, frequency: 0, lowerAction: 'bet_33', upperAction: 'bet_33', weightLower: 1 };
  }

  // Find nearest lower and upper buckets
  const sorted = [...buckets].sort((a, b) => a.potFraction - b.potFraction);

  // Exact match
  const exact = sorted.find(b => Math.abs(b.potFraction - betFraction) < 0.02);
  if (exact) {
    return {
      ev: exact.ev,
      frequency: exact.frequency,
      lowerAction: exact.action,
      upperAction: exact.action,
      weightLower: 1,
    };
  }

  // Below minimum bucket — use lowest
  if (betFraction <= sorted[0].potFraction) {
    return {
      ev: sorted[0].ev,
      frequency: sorted[0].frequency,
      lowerAction: sorted[0].action,
      upperAction: sorted[0].action,
      weightLower: 1,
    };
  }

  // Above maximum bucket — use highest
  if (betFraction >= sorted[sorted.length - 1].potFraction) {
    const top = sorted[sorted.length - 1];
    return {
      ev: top.ev,
      frequency: top.frequency,
      lowerAction: top.action,
      upperAction: top.action,
      weightLower: 0,
    };
  }

  // Find bracketing pair
  let lower = sorted[0];
  let upper = sorted[sorted.length - 1];
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].potFraction <= betFraction && sorted[i + 1].potFraction >= betFraction) {
      lower = sorted[i];
      upper = sorted[i + 1];
      break;
    }
  }

  const wLower = pseudoHarmonicMap(betFraction, lower.potFraction, upper.potFraction);
  const wUpper = 1 - wLower;

  return {
    ev: wLower * lower.ev + wUpper * upper.ev,
    frequency: wLower * lower.frequency + wUpper * upper.frequency,
    lowerAction: lower.action,
    upperAction: upper.action,
    weightLower: wLower,
  };
}

/**
 * Detect board texture: returns 'dry', 'wet', or 'very_wet' based on community cards.
 *
 * Dry  = no flush draw, no open-ended straight draw (gaps ≥ 3), or paired board
 * Wet  = 2+ suited cards OR 2+ connected (gap ≤ 1)
 * Very Wet = 3 suited cards or both flush + straight draws present
 */
export type BoardTexture = 'dry' | 'wet' | 'very_wet';

export function detectBoardTexture(communityCards: { value: number; suit: string }[]): BoardTexture {
  if (communityCards.length < 3) return 'dry';

  const board = communityCards.slice(0, 3); // Use only flop cards for primary texture

  // Check flush draw (2+ same suit)
  const suitCounts = board.reduce<Record<string, number>>((acc, c) => {
    acc[c.suit] = (acc[c.suit] || 0) + 1;
    return acc;
  }, {});
  const maxSuitCount = Math.max(...Object.values(suitCounts));
  const hasFlushDraw = maxSuitCount >= 2;
  const isMonotone = maxSuitCount === 3;

  // Check straight draw (2+ cards within gap ≤ 1)
  const values = board.map(c => c.value).sort((a, b) => a - b);
  const isPaired = values[0] === values[1] || values[1] === values[2] || values[0] === values[2];

  const gaps = [values[1] - values[0], values[2] - values[1]];
  const hasConnected = gaps[0] <= 1 || gaps[1] <= 1;
  const hasOESd = gaps[0] <= 1 && gaps[1] <= 1; // open-ended straight draw possible

  if (isMonotone || (hasFlushDraw && hasOESd)) return 'very_wet';
  if (hasFlushDraw || hasConnected) return 'wet';
  return 'dry';
}
