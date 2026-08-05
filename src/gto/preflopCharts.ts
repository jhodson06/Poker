const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

function getRankIndex(r: string) {
  return RANKS.indexOf(r);
}

// Parses a comma-separated range string into an array of canonical hand keys (e.g. 'AKs', 'AA', 'KTo')
export function parseRangeString(rangeStr: string): string[] {
  const hands = new Set<string>();
  const tokens = rangeStr.split(',').map(s => s.trim()).filter(s => s.length > 0);

  for (const token of tokens) {
    if (token.includes('-')) {
      const [start, end] = token.split('-');
      if (start.length === 2 && end.length === 2 && start[0] === start[1] && end[0] === end[1]) {
        // Pair range: e.g. AA-77
        const r1 = start[0];
        const r2 = end[0];
        const i1 = getRankIndex(r1);
        const i2 = getRankIndex(r2);
        for (let i = i1; i <= i2; i++) {
          hands.add(`${RANKS[i]}${RANKS[i]}`);
        }
      } else if (start.length === 3 && end.length === 3) {
        // High card range: e.g. AKs-A9s
        const r1 = start[0];
        const r2_start = start[1];
        const r2_end = end[1];
        const suit = start[2]; // 's' or 'o'
        const i1 = getRankIndex(r2_start);
        const i2 = getRankIndex(r2_end);
        for (let i = i1; i <= i2; i++) {
          hands.add(`${r1}${RANKS[i]}${suit}`);
        }
      }
    } else {
      // Exact hand
      hands.add(token);
    }
  }

  return Array.from(hands);
}

export type ActionMapping = {
  [action: string]: string; // e.g. { 'raise': 'AA-22, AKs-A2s', 'call': 'AQs-AJs' }
};

export type PositionalChart = {
  UTG?: ActionMapping;
  MP?: ActionMapping;
  CO?: ActionMapping;
  BTN?: ActionMapping;
  SB?: ActionMapping;
  BB?: ActionMapping; // Only used when facing an open
};

// Returns a map of canonical hand key (e.g. 'AA', 'A5s') to an object mapping action to frequency.
// e.g. { 'AA': { 'raise': 1.0 }, 'A5s': { 'raise': 0.5, 'fold': 0.5 } }
export function buildChartMatrix(mapping?: ActionMapping): Map<string, { [action: string]: number }> {
  const matrix = new Map<string, { [action: string]: number }>();
  
  if (!mapping) return matrix;

  for (const [actionName, rangeStr] of Object.entries(mapping)) {
    // We can support frequencies in the string, but for MVP let's assume 1.0 for everything specified.
    // Wait, GTO uses mixed frequencies. Let's support "raise_100", "raise_50".
    const [act, freqStr] = actionName.split('_');
    const freq = freqStr ? parseInt(freqStr, 10) / 100 : 1.0;
    const cleanAction = act;

    const hands = parseRangeString(rangeStr);
    for (const h of hands) {
      if (!matrix.has(h)) matrix.set(h, {});
      matrix.get(h)![cleanAction] = (matrix.get(h)![cleanAction] || 0) + freq;
    }
  }

  // Fill implied folds
  for (let i = 0; i < RANKS.length; i++) {
    for (let j = i; j < RANKS.length; j++) {
      let handKeys: string[] = [];
      if (i === j) {
        handKeys = [`${RANKS[i]}${RANKS[i]}`];
      } else {
        handKeys = [`${RANKS[i]}${RANKS[j]}s`, `${RANKS[i]}${RANKS[j]}o`];
      }

      for (const h of handKeys) {
        let sum = 0;
        const acts = matrix.get(h) || {};
        for (const val of Object.values(acts)) sum += val;
        
        if (sum < 1.0) {
          if (!matrix.has(h)) matrix.set(h, {});
          matrix.get(h)!['fold'] = (matrix.get(h)!['fold'] || 0) + (1.0 - sum);
        }
      }
    }
  }

  return matrix;
}

// ==============================================================================
// GTO 100BB 6-MAX CHARTS
// ==============================================================================

// 1. RFI (Raise First In)
export const RFI_CHARTS: PositionalChart = {
  UTG: {
    'raise_100': 'AA-77, AKs-A9s, A5s-A4s, KQs-KTs, QJs-QTs, JTs, T9s, 98s, 87s, AKo-AQo'
  },
  MP: {
    'raise_100': 'AA-55, AKs-A2s, KQs-K9s, QJs-Q9s, JTs-J9s, T9s, 98s, 87s, 76s, 65s, AKo-AJo, KQo'
  },
  CO: {
    'raise_100': 'AA-22, AKs-A2s, KQs-K6s, QJs-Q8s, JTs-J8s, T9s-T8s, 98s, 87s, 76s, 65s, 54s, AKo-ATo, KQo-KJo, QJo'
  },
  BTN: {
    'raise_100': 'AA-22, AKs-A2s, KQs-K2s, QJs-Q4s, JTs-J6s, T9s-T6s, 98s-96s, 87s-86s, 76s-75s, 65s, 54s, AKo-A2o, KQo-K8o, QJo-Q9o, JTo-J9o, T9o'
  },
  SB: {
    'raise_100': 'AA-22, AKs-A2s, KQs-K2s, QJs-Q5s, JTs-J7s, T9s-T7s, 98s-97s, 87s, 76s, 65s, 54s, AKo-A8o, KQo-K9o, QJo-QTo, JTo'
  }
};

// 2. Facing UTG Open
export const VS_UTG_OPEN: PositionalChart = {
  MP: {
    'raise_100': 'AA-QQ, AKs, AKo',
    'raise_50': 'JJ, AQs-AJs, KQs',
    'call_50': 'JJ, AQs-AJs, KQs',
    'call_100': 'TT-77, ATs-A9s, KJs-KTs, QJs-QTs, JTs, T9s, 98s, 87s, AQo'
  },
  CO: {
    'raise_100': 'AA-QQ, AKs, AKo',
    'raise_50': 'JJ, AQs-AJs, KQs, KJs',
    'call_50': 'JJ, AQs-AJs, KQs, KJs',
    'call_100': 'TT-66, ATs-A8s, KTs, QJs-QTs, JTs, T9s, 98s, 87s, 76s, AQo'
  },
  BTN: {
    'raise_100': 'AA-JJ, AKs-AQs, AKo',
    'raise_50': 'TT, AJs, KQs, KJs, AQo',
    'call_50': 'TT, AJs, KQs, KJs, AQo',
    'call_100': '99-55, ATs-A2s, KTs, QJs-QTs, JTs-J9s, T9s, 98s, 87s, 76s, 65s, 54s'
  },
  SB: {
    'raise_100': 'AA-JJ, AKs-AQs, AKo, A5s-A4s',
    'call_100': 'TT-77, AJs-ATs, KQs-KJs, QJs, JTs'
  },
  BB: {
    'raise_100': 'AA-QQ, AKs, AKo',
    'raise_50': 'JJ-TT, AQs-AJs, KQs',
    'call_50': 'JJ-TT, AQs-AJs, KQs',
    'call_100': '99-22, ATs-A2s, KJs-K2s, QJs-Q5s, JTs-J7s, T9s-T7s, 98s-97s, 87s-86s, 76s-75s, 65s, 54s, AQo-ATo, KQo-KTo, QJo-QTo, JTo'
  }
};

// Generic facing 3-Bet response (for the RFI opener)
export const FACING_3BET: PositionalChart = {
  // Rough generalized response to a 3-bet
  UTG: {
    'raise_100': 'AA-KK, AKs',
    'raise_50': 'QQ, AKo',
    'call_50': 'QQ, AKo',
    'call_100': 'JJ-99, AQs-AJs, KQs, JTs, T9s'
  },
  MP: {
    'raise_100': 'AA-KK, AKs',
    'raise_50': 'QQ, AKo',
    'call_50': 'QQ, AKo',
    'call_100': 'JJ-88, AQs-ATs, KQs-KJs, QJs, JTs, T9s'
  },
  CO: {
    'raise_100': 'AA-QQ, AKs, AKo',
    'raise_50': 'JJ',
    'call_50': 'JJ',
    'call_100': 'TT-77, AQs-ATs, A5s-A4s, KQs-KTs, QJs-QTs, JTs, T9s, 98s, 87s, AQo'
  },
  BTN: {
    'raise_100': 'AA-JJ, AKs-AQs, AKo',
    'raise_50': 'TT',
    'call_50': 'TT',
    'call_100': '99-55, AJs-A2s, KQs-K9s, QJs-Q9s, JTs-J9s, T9s, 98s, 87s, 76s, 65s, AQo-AJo, KQo'
  },
  SB: {
    'raise_100': 'AA-JJ, AKs-AQs, AKo',
    'call_100': 'TT-66, AJs-A7s, KQs-KTs, QJs-QTs, JTs, T9s, 98s, 87s, AQo'
  }
};

// Generic facing 4-Bet+ response
export const FACING_4BET: PositionalChart = {
  // If we 3-bet and get 4-bet, we 5-bet shove QQ+, AK, and call/fold the rest.
  UTG: {
    'raise_100': 'AA-KK, AKs',
    'call_100': 'QQ, AKo'
  },
  MP: {
    'raise_100': 'AA-KK, AKs, AKo',
    'call_100': 'QQ'
  },
  CO: {
    'raise_100': 'AA-QQ, AKs, AKo',
    'call_100': 'JJ'
  },
  BTN: {
    'raise_100': 'AA-QQ, AKs, AKo',
    'call_100': 'JJ-TT, AQs'
  },
  SB: {
    'raise_100': 'AA-QQ, AKs, AKo',
    'call_100': 'JJ-TT, AQs'
  },
  BB: {
    'raise_100': 'AA-QQ, AKs, AKo',
    'call_100': 'JJ-TT, AQs'
  }
};

// A helper mapping to easily grab vs Open charts
export const VS_OPEN_CHARTS: { [opener: string]: PositionalChart } = {
  UTG: VS_UTG_OPEN,
  MP: {
    // simplified offset of UTG open
    CO: { 'raise_100': 'AA-QQ, AKs, AKo', 'call_100': 'JJ-66, AQs-A8s, A5s-A4s, KQs-KTs, QJs-QTs, JTs, T9s, 98s, 87s, 76s, AQo' },
    BTN: { 'raise_100': 'AA-JJ, AKs-AQs, AKo', 'call_100': 'TT-55, AJs-A2s, KQs-KTs, QJs-QTs, JTs, T9s, 98s, 87s, 76s, 65s, AQo' },
    SB: { 'raise_100': 'AA-JJ, AKs-AQs, AKo, A5s-A4s', 'call_100': 'TT-77, AJs-ATs, KQs-KJs, QJs, JTs' },
    BB: { 'raise_100': 'AA-QQ, AKs, AKo', 'call_100': 'JJ-22, AQs-A2s, KQs-K2s, QJs-Q5s, JTs-J7s, T9s-T7s, 98s-97s, 87s-86s, 76s-75s, 65s, 54s, AQo-ATo, KQo-KTo, QJo-QTo, JTo' }
  },
  CO: {
    BTN: { 'raise_100': 'AA-TT, AKs-AJs, AKo-AQo', 'call_100': '99-33, ATs-A2s, KQs-K9s, QJs-Q9s, JTs-J9s, T9s, 98s, 87s, 76s, 65s, 54s, AJo, KQo' },
    SB: { 'raise_100': 'AA-TT, AKs-AJs, AKo-AQo', 'call_100': '99-66, ATs-A8s, KQs-KTs, QJs-QTs, JTs, T9s, 98s, 87s' },
    BB: { 'raise_100': 'AA-JJ, AKs-AQs, AKo-AQo', 'call_100': 'TT-22, AJs-A2s, KQs-K2s, QJs-Q4s, JTs-J6s, T9s-T6s, 98s-96s, 87s-86s, 76s-75s, 65s, 54s, 43s, AJo-A8o, KQo-K9o, QJo-Q9o, JTo-J9o' }
  },
  BTN: {
    SB: { 'raise_100': 'AA-99, AKs-ATs, AKo-AJo', 'call_100': '88-55, A9s-A2s, KQs-K9s, QJs-Q9s, JTs-J9s, T9s, 98s, 87s, 76s, KQo' },
    BB: { 'raise_100': 'AA-TT, AKs-AJs, AKo-AJo', 'call_100': '99-22, ATs-A2s, KQs-K2s, QJs-Q2s, JTs-J4s, T9s-T5s, 98s-95s, 87s-85s, 76s-75s, 65s-64s, 54s, ATo-A2o, KQo-K8o, QJo-Q8o, JTo-J8o, T9o' }
  },
  SB: {
    BB: { 'raise_100': 'AA-99, AKs-ATs, AKo-AJo', 'call_100': '88-22, A9s-A2s, KQs-K2s, QJs-Q2s, JTs-J4s, T9s-T5s, 98s-95s, 87s-85s, 76s-75s, 65s-64s, 54s, 43s, 32s, ATo-A2o, KQo-K4o, QJo-Q7o, JTo-J7o, T9o-T8o, 98o' }
  }
};
