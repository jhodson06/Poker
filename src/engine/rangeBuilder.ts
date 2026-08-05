import { Card, createCard } from './card';

/**
 * Maps a hand (two cards) to an index from 0 to 1325.
 * Order of cards does not matter.
 */
export function getHandIndex(c1: Card, c2: Card): number {
  let idx1 = c1.value * 4 + getSuitValue(c1.suit);
  let idx2 = c2.value * 4 + getSuitValue(c2.suit);
  if (idx1 < idx2) {
    const temp = idx1;
    idx1 = idx2;
    idx2 = temp;
  }
  // Standard combination index formula: (idx1 * (idx1 - 1)) / 2 + idx2
  return (idx1 * (idx1 - 1)) / 2 + idx2;
}

export function getCardsFromIndex(index: number): [Card, Card] {
  // Find idx1 and idx2 such that (idx1 * (idx1 - 1)) / 2 + idx2 = index
  let idx1 = Math.floor(Math.sqrt(2 * index)) + 1;
  while ((idx1 * (idx1 - 1)) / 2 > index) {
    idx1--;
  }
  const idx2 = index - (idx1 * (idx1 - 1)) / 2;
  return [
    createCard(Math.floor(idx1 / 4) as any, getSuitFromValue(idx1 % 4)),
    createCard(Math.floor(idx2 / 4) as any, getSuitFromValue(idx2 % 4)),
  ];
}

function getSuitValue(suit: 'h' | 'd' | 'c' | 's'): number {
  return suit === 's' ? 0 : suit === 'h' ? 1 : suit === 'd' ? 2 : 3;
}

function getSuitFromValue(val: number): 's' | 'h' | 'd' | 'c' {
  return val === 0 ? 's' : val === 1 ? 'h' : val === 2 ? 'd' : 'c';
}

/**
 * A Range represents the probability distribution over all 1326 possible hole card combinations.
 */
export class Range {
  public weights: Float32Array;

  constructor() {
    this.weights = new Float32Array(1326);
  }

  static empty(): Range {
    const r = new Range();
    r.weights.fill(0);
    return r;
  }

  static full(): Range {
    const r = new Range();
    r.weights.fill(1.0);
    return r;
  }

  clone(): Range {
    const r = new Range();
    r.weights.set(this.weights);
    return r;
  }

  normalize() {
    let sum = 0;
    for (let i = 0; i < 1326; i++) sum += this.weights[i];
    if (sum > 0) {
      for (let i = 0; i < 1326; i++) this.weights[i] /= sum;
    }
  }

  // Remove combinations that contain blockers (e.g. board cards)
  removeBlockers(deadCards: Card[]) {
    const deadMasks = deadCards.map(c => c.value * 4 + getSuitValue(c.suit));
    for (let i = 0; i < 1326; i++) {
      if (this.weights[i] > 0) {
        let idx1 = Math.floor(Math.sqrt(2 * i)) + 1;
        while ((idx1 * (idx1 - 1)) / 2 > i) {
          idx1--;
        }
        const idx2 = i - (idx1 * (idx1 - 1)) / 2;
        if (deadMasks.includes(idx1) || deadMasks.includes(idx2)) {
          this.weights[i] = 0;
        }
      }
    }
  }
}

/**
 * Get a very simplified static preflop starting range for testing.
 * Top X% of hands.
 */
export function getStaticPreflopRange(percentage: number): Range {
  const r = Range.empty();
  // Very simplistic: just use the rank of the cards. Pair > Suited > Offsuit
  for (let i = 0; i < 1326; i++) {
    const [c1, c2] = getCardsFromIndex(i);
    const v1 = Math.max(c1.value, c2.value);
    const v2 = Math.min(c1.value, c2.value);
    const isPair = v1 === v2;
    const isSuited = c1.suit === c2.suit;

    // Simple heuristic score
    let score = v1 * 2 + v2;
    if (isPair) score += 20;
    if (isSuited) score += 5;

    // A top X% threshold based on this score
    // Max score: AA = 12*2 + 12 + 20 = 56
    // Min score: 32o = 1*2 + 0 = 2
    // We linearly map percentage 0-100 to score threshold 56-2
    const threshold = 56 - (percentage / 100) * 54;
    
    if (score >= threshold) {
      r.weights[i] = 1.0;
    }
  }
  return r;
}
