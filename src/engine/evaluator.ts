import { Card, RANKS } from './card';

export type HandCategory =
  | 'Straight Flush'
  | 'Four of a Kind'
  | 'Full House'
  | 'Flush'
  | 'Straight'
  | 'Three of a Kind'
  | 'Two Pair'
  | 'One Pair'
  | 'High Card';

export interface HandEvaluation {
  score: number; // Lower score = stronger hand (1,000,000 range = Straight Flush, 9,000,000 range = High Card)
  category: HandCategory;
  description: string;
}

// Internal evaluation helper for 5-card combinations
function evaluate5Cards(cards: Card[]): { score: number; category: HandCategory; description: string } {
  // Card values: 0 (2) to 12 (Ace)
  const ranks = cards.map(c => c.value).sort((a, b) => b - a);
  const isFlush = cards.every(c => c.suit === cards[0].suit);

  // Check straight
  let isStraight = false;
  let straightHigh = -1;
  if (
    ranks[0] - ranks[4] === 4 &&
    ranks[0] !== ranks[1] &&
    ranks[1] !== ranks[2] &&
    ranks[2] !== ranks[3] &&
    ranks[3] !== ranks[4]
  ) {
    isStraight = true;
    straightHigh = ranks[0];
  } else if (ranks[0] === 12 && ranks[1] === 3 && ranks[2] === 2 && ranks[3] === 1 && ranks[4] === 0) {
    // Wheel A-2-3-4-5
    isStraight = true;
    straightHigh = 3; // 5 high
  }

  // Count rank frequencies
  const counts: Record<number, number> = {};
  for (const r of ranks) {
    counts[r] = (counts[r] || 0) + 1;
  }
  const freqPairs = Object.entries(counts)
    .map(([r, count]) => ({ rank: Number(r), count }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank);

  // 1. Straight Flush (Base 1,000,000)
  if (isFlush && isStraight) {
    const desc = straightHigh === 12 ? 'Royal Flush' : `${RANKS[straightHigh]}-High Straight Flush`;
    const score = 1000000 + (12 - straightHigh);
    return { score, category: 'Straight Flush', description: desc };
  }

  // 2. Four of a Kind (Base 2,000,000)
  if (freqPairs[0].count === 4) {
    const kicker = freqPairs[1].rank;
    const score = 2000000 + (12 - freqPairs[0].rank) * 100 + (12 - kicker);
    return { score, category: 'Four of a Kind', description: `Four of a Kind, ${RANKS[freqPairs[0].rank]}s` };
  }

  // 3. Full House (Base 3,000,000)
  if (freqPairs[0].count === 3 && freqPairs[1].count === 2) {
    const score = 3000000 + (12 - freqPairs[0].rank) * 100 + (12 - freqPairs[1].rank);
    return { score, category: 'Full House', description: `Full House, ${RANKS[freqPairs[0].rank]}s full of ${RANKS[freqPairs[1].rank]}s` };
  }

  // 4. Flush (Base 4,000,000)
  if (isFlush) {
    const score = 4000000 + (12 - ranks[0]) * 160000 + (12 - ranks[1]) * 8000 + (12 - ranks[2]) * 400 + (12 - ranks[3]) * 20 + (12 - ranks[4]);
    return { score, category: 'Flush', description: `Flush, ${RANKS[ranks[0]]}-High` };
  }

  // 5. Straight (Base 5,000,000)
  if (isStraight) {
    const score = 5000000 + (12 - straightHigh);
    return { score, category: 'Straight', description: `Straight, ${RANKS[straightHigh]}-High` };
  }

  // 6. Three of a Kind (Base 6,000,000)
  if (freqPairs[0].count === 3) {
    const score = 6000000 + (12 - freqPairs[0].rank) * 1000 + (12 - freqPairs[1].rank) * 20 + (12 - freqPairs[2].rank);
    return { score, category: 'Three of a Kind', description: `Three of a Kind, ${RANKS[freqPairs[0].rank]}s` };
  }

  // 7. Two Pair (Base 7,000,000)
  if (freqPairs[0].count === 2 && freqPairs[1].count === 2) {
    const score = 7000000 + (12 - freqPairs[0].rank) * 1000 + (12 - freqPairs[1].rank) * 20 + (12 - freqPairs[2].rank);
    return { score, category: 'Two Pair', description: `Two Pair, ${RANKS[freqPairs[0].rank]}s and ${RANKS[freqPairs[1].rank]}s` };
  }

  // 8. One Pair (Base 8,000,000)
  if (freqPairs[0].count === 2) {
    const score = 8000000 + (12 - freqPairs[0].rank) * 16000 + (12 - freqPairs[1].rank) * 800 + (12 - freqPairs[2].rank) * 40 + (12 - freqPairs[3].rank);
    return { score, category: 'One Pair', description: `Pair of ${RANKS[freqPairs[0].rank]}s` };
  }

  // 9. High Card (Base 9,000,000)
  const score = 9000000 + (12 - ranks[0]) * 160000 + (12 - ranks[1]) * 8000 + (12 - ranks[2]) * 400 + (12 - ranks[3]) * 20 + (12 - ranks[4]);
  return { score, category: 'High Card', description: `High Card, ${RANKS[ranks[0]]}` };
}

// Generate combinations of 5 cards out of N cards (e.g. 5, 6, or 7)
function getCombinations<T>(arr: T[], k: number): T[][] {
  if (k === arr.length) return [arr];
  if (k === 1) return arr.map(x => [x]);
  const combinations: T[][] = [];
  for (let i = 0; i < arr.length - k + 1; i++) {
    const head = arr[i];
    const tailCombos = getCombinations(arr.slice(i + 1), k - 1);
    for (const tail of tailCombos) {
      combinations.push([head, ...tail]);
    }
  }
  return combinations;
}

export function evaluate7Cards(cards: Card[]): HandEvaluation {
  if (cards.length < 5) {
    return { score: 99999999, category: 'High Card', description: 'Incomplete Hand' };
  }
  const combinations = getCombinations(cards, 5);
  let bestEval: HandEvaluation | null = null;

  for (const combo of combinations) {
    const result = evaluate5Cards(combo);
    if (!bestEval || result.score < bestEval.score) {
      bestEval = result;
    }
  }

  return bestEval!;
}
