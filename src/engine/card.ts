export type Suit = 's' | 'h' | 'd' | 'c'; // Spades, Hearts, Diamonds, Clubs
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  rank: Rank;
  suit: Suit;
  code: string; // e.g. "As", "Kh", "Tc"
  value: number; // Rank index 0..12 (2=0, A=12)
  prime: number; // Cactus Kev prime representation
  bitmask: number; // Bitwise representation
}

export const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
export const SUITS: Suit[] = ['s', 'h', 'd', 'c'];

export const SUIT_SYMBOLS: Record<Suit, string> = {
  s: '♠',
  h: '♥',
  d: '♦',
  c: '♣'
};

export const SUIT_COLORS: Record<Suit, string> = {
  s: '#94a3b8', // Spades: Dark Silver/Black
  h: '#f43f5e', // Hearts: Vibrant Red
  d: '#38bdf8', // Diamonds: Blue (4-color deck standard)
  c: '#10b981'  // Clubs: Green (4-color deck standard)
};

const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41];

export function createCard(rank: Rank, suit: Suit): Card {
  const rIdx = RANKS.indexOf(rank);
  const sIdx = SUITS.indexOf(suit);
  const prime = PRIMES[rIdx];
  // Bitmask layout:
  // bits 0-7: prime value
  // bits 8-11: rank (0..12)
  // bits 12-15: suit bit field (1, 2, 4, 8)
  // bits 16-31: rank bit flag (1 << rIdx)
  const bitmask = (1 << (rIdx + 16)) | (1 << (sIdx + 12)) | (rIdx << 8) | prime;

  return {
    rank,
    suit,
    code: `${rank}${suit}`,
    value: rIdx,
    prime,
    bitmask
  };
}

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const r of RANKS) {
    for (const s of SUITS) {
      deck.push(createCard(r, s));
    }
  }
  return deck;
}

export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function parseCard(code: string): Card | null {
  if (code.length !== 2) return null;
  const rank = code[0].toUpperCase() as Rank;
  const suit = code[1].toLowerCase() as Suit;
  if (!RANKS.includes(rank) || !SUITS.includes(suit)) return null;
  return createCard(rank, suit);
}
