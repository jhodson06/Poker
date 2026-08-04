import { Card, RANKS, createCard } from '../engine/card';
import { PlayerPosition, BettingStreet } from '../engine/stateMachine';
import { evaluate7Cards } from '../engine/evaluator';

export interface ActionFrequency {
  action: 'fold' | 'check' | 'call' | 'bet_33' | 'bet_75' | 'raise' | 'allin';
  label: string;
  frequency: number; // 0.0 to 1.0 (sums to 1.0)
  ev: number; // Expected Value in Big Blinds
}

export interface GtoNodeStrategy {
  nodeId: string;
  handKey: string;
  position: PlayerPosition;
  street: BettingStreet;
  frequencies: ActionFrequency[];
  optimalAction: ActionFrequency;
}

export function getCanonicalHandKey(c1: Card, c2: Card): string {
  const r1 = c1.value;
  const r2 = c2.value;
  const highRank = RANKS[Math.max(r1, r2)];
  const lowRank = RANKS[Math.min(r1, r2)];

  if (r1 === r2) {
    return `${highRank}${lowRank}`;
  }
  const isSuited = c1.suit === c2.suit;
  return `${highRank}${lowRank}${isSuited ? 's' : 'o'}`;
}

function getPreflopRfiFrequency(highVal: number, lowVal: number, isPair: boolean, isSuited: boolean, position: PlayerPosition): number {
  if (position === 'BB') return 0.0; // BB checks when unopened

  if (isPair) {
    if (position === 'UTG') return highVal >= 4 ? 1.0 : (highVal >= 2 ? 0.5 : 0.0); // 66+ 100%, 44-55 50%
    if (position === 'MP') return highVal >= 2 ? 1.0 : 0.5; // 44+ 100%, 22-33 50%
    return 1.0; // CO, BTN, SB open all pairs 22+
  }

  if (isSuited) {
    if (highVal === 12) { // Ace-high suited (A2s-AKs)
      if (position === 'UTG') return lowVal >= 8 || lowVal <= 3 ? 1.0 : 0.0; // A10s+, A5s-A4s
      if (position === 'MP') return lowVal >= 6 || lowVal <= 3 ? 1.0 : 0.5; // A8s+, A5s-A2s
      return 1.0; // CO, BTN, SB open all Axs
    }
    if (highVal === 11) { // King-high suited (K2s-KQs)
      if (position === 'UTG') return lowVal >= 9 ? 1.0 : 0.0; // KJs+
      if (position === 'MP') return lowVal >= 7 ? 1.0 : 0.0; // K9s+
      if (position === 'CO') return lowVal >= 3 ? 1.0 : 0.0; // K5s+
      return 1.0; // BTN, SB open all Kxs
    }
    if (highVal === 10) { // Queen-high suited (Q2s-QJs)
      if (position === 'UTG') return lowVal >= 8 ? 1.0 : 0.0; // Q10s+
      if (position === 'MP') return lowVal >= 7 ? 1.0 : (lowVal === 6 ? 0.5 : 0.0); // Q9s 100%, Q8s 50%
      if (position === 'CO') return lowVal >= 4 ? 1.0 : 0.0; // Q6s+
      return lowVal >= 0 ? 1.0 : 0.0; // BTN, SB open all Qxs
    }
    if (highVal === 9) { // Jack-high suited (J2s-JTs)
      if (position === 'UTG') return lowVal === 8 ? 1.0 : 0.0; // J10s
      if (position === 'MP') return lowVal >= 7 ? 1.0 : 0.0; // J9s+
      if (position === 'CO') return lowVal >= 5 ? 1.0 : 0.0; // J7s+
      return lowVal >= 2 ? 1.0 : 0.0; // BTN, SB open J4s+
    }
    if (highVal === 8) { // 10-high suited (T2s-T9s)
      if (position === 'UTG') return lowVal === 7 ? 0.5 : 0.0; // T9s mix
      if (position === 'MP') return lowVal >= 6 ? 1.0 : 0.0; // T8s+
      if (position === 'CO') return lowVal >= 5 ? 1.0 : 0.0; // T7s+
      return lowVal >= 4 ? 1.0 : 0.0; // BTN, SB open T6s+
    }
    if (highVal - lowVal <= 2 && highVal >= 3) { // Suited connectors & gappers
      if (position === 'UTG') return 0.0;
      if (position === 'MP') return highVal >= 5 ? 0.6 : 0.0;
      if (position === 'CO') return 1.0;
      return 1.0;
    }
    return position === 'BTN' ? (highVal >= 4 ? 1.0 : 0.0) : 0.0;
  }

  // Offsuit hands
  if (highVal === 12) { // Ace-high offsuit (A2o-AKo)
    if (position === 'UTG') return lowVal >= 9 ? 1.0 : 0.0; // AJo+
    if (position === 'MP') return lowVal >= 8 ? 1.0 : 0.0; // A10o+
    if (position === 'CO') return lowVal >= 7 ? 1.0 : 0.0; // A9o+
    return lowVal >= 0 ? 1.0 : 0.0; // BTN, SB open A2o+
  }
  if (highVal === 11) { // King-high offsuit (K2o-KQo)
    if (position === 'UTG') return lowVal === 10 ? 1.0 : 0.0; // KQo
    if (position === 'MP') return lowVal >= 9 ? 1.0 : 0.0; // KJo+
    if (position === 'CO') return lowVal >= 8 ? 1.0 : 0.0; // K10o+
    return lowVal >= 5 ? 1.0 : 0.0; // BTN, SB open K7o+
  }
  if (highVal === 10) { // Queen-high offsuit (Q2o-QJo)
    if (position === 'UTG' || position === 'MP') return 0.0;
    if (position === 'CO') return lowVal === 9 ? 1.0 : 0.0; // QJo
    return lowVal >= 7 ? 1.0 : 0.0; // BTN, SB open Q9o+
  }
  if (highVal === 9) { // Jack-high offsuit
    if (position === 'BTN' || position === 'SB') return lowVal >= 7 ? 1.0 : 0.0; // J9o+
    return 0.0;
  }

  return 0.0;
}

export function getGtoStrategyForState(
  c1: Card,
  c2: Card,
  position: PlayerPosition,
  street: BettingStreet,
  currentHighBet: number,
  potSize: number,
  bigBlind: number,
  communityCards: Card[] = []
): GtoNodeStrategy {
  const handKey = getCanonicalHandKey(c1, c2);
  const r1 = c1.value;
  const r2 = c2.value;
  const isPair = r1 === r2;
  const highVal = Math.max(r1, r2);
  const lowVal = Math.min(r1, r2);
  const isSuited = c1.suit === c2.suit;

  let freqs: ActionFrequency[] = [];

  if (street === 'preflop') {
    const isFacingRaise = currentHighBet > bigBlind;

    if (!isFacingRaise) {
      // Position-based RFI (Raise First In) range
      const rFreq = getPreflopRfiFrequency(highVal, lowVal, isPair, isSuited, position);
      if (rFreq === 0) {
        freqs = [
          { action: 'fold', label: 'Fold', frequency: 1.0, ev: 0 },
          { action: 'raise', label: 'Raise 2.5x', frequency: 0.0, ev: -0.2 }
        ];
      } else if (rFreq === 1.0) {
        freqs = [
          { action: 'fold', label: 'Fold', frequency: 0.0, ev: 0 },
          { action: 'raise', label: 'Raise 2.5x', frequency: 1.0, ev: 2.0 + highVal * 0.3 }
        ];
      } else {
        freqs = [
          { action: 'fold', label: 'Fold', frequency: Number((1 - rFreq).toFixed(2)), ev: 0 },
          { action: 'raise', label: 'Raise 2.5x', frequency: rFreq, ev: 1.0 + highVal * 0.1 }
        ];
      }
    } else {
      // Facing a Raise / 3-Bet spot preflop
      if (highVal >= 11 && (isPair || isSuited)) {
        freqs = [
          { action: 'fold', label: 'Fold', frequency: 0.0, ev: 0 },
          { action: 'call', label: 'Call', frequency: 0.35, ev: 4.2 },
          { action: 'raise', label: '3-Bet', frequency: 0.65, ev: 6.8 }
        ];
      } else if (isPair || highVal >= 10) {
        freqs = [
          { action: 'fold', label: 'Fold', frequency: 0.65, ev: 0 },
          { action: 'call', label: 'Call', frequency: 0.30, ev: 1.2 },
          { action: 'raise', label: '3-Bet', frequency: 0.05, ev: 0.5 }
        ];
      } else {
        freqs = [
          { action: 'fold', label: 'Fold', frequency: 0.92, ev: 0 },
          { action: 'call', label: 'Call', frequency: 0.08, ev: -0.4 }
        ];
      }
    }
  } else {
    // Postflop (Flop, Turn, River)
    // If communityCards is empty (e.g. browsing postflop standalone in Solution Browser), provide a standard reference board!
    let activeBoard = communityCards;
    if (!activeBoard || activeBoard.length === 0) {
      activeBoard = [
        createCard('A', 'c'),
        createCard('T', 'd'),
        createCard('7', 's')
      ];
      if (street === 'turn' || street === 'river') {
        activeBoard.push(createCard('2', 'h'));
      }
      if (street === 'river') {
        activeBoard.push(createCard('K', 'h'));
      }
    }

    const allCards = [c1, c2, ...activeBoard];
    const handEval = evaluate7Cards(allCards);
    const cat = handEval.category;
    const isFacingBet = currentHighBet > 0;

    const isMonster = cat === 'Straight Flush' || cat === 'Four of a Kind' || cat === 'Full House' || cat === 'Flush' || cat === 'Straight' || cat === 'Three of a Kind';
    const isTwoPair = cat === 'Two Pair';
    const isPairHand = cat === 'One Pair';

    if (!isFacingBet) {
      if (isMonster || isTwoPair) {
        freqs = [
          { action: 'check', label: 'Check', frequency: 0.25, ev: potSize * 0.5 },
          { action: 'bet_33', label: 'Bet 33% Pot', frequency: 0.40, ev: potSize * 0.65 },
          { action: 'bet_75', label: 'Bet 75% Pot', frequency: 0.35, ev: potSize * 0.70 }
        ];
      } else if (isPairHand) {
        freqs = [
          { action: 'check', label: 'Check', frequency: 0.60, ev: potSize * 0.35 },
          { action: 'bet_33', label: 'Bet 33% Pot', frequency: 0.35, ev: potSize * 0.40 },
          { action: 'bet_75', label: 'Bet 75% Pot', frequency: 0.05, ev: potSize * 0.30 }
        ];
      } else {
        freqs = [
          { action: 'check', label: 'Check', frequency: 0.85, ev: potSize * 0.1 },
          { action: 'bet_33', label: 'Bet 33% Pot', frequency: 0.15, ev: potSize * 0.12 }
        ];
      }
    } else {
      if (isMonster) {
        freqs = [
          { action: 'fold', label: 'Fold', frequency: 0.0, ev: 0 },
          { action: 'call', label: 'Call', frequency: 0.40, ev: potSize * 0.75 },
          { action: 'raise', label: 'Raise', frequency: 0.60, ev: potSize * 0.90 }
        ];
      } else if (isTwoPair) {
        freqs = [
          { action: 'fold', label: 'Fold', frequency: 0.05, ev: 0 },
          { action: 'call', label: 'Call', frequency: 0.75, ev: potSize * 0.55 },
          { action: 'raise', label: 'Raise', frequency: 0.20, ev: potSize * 0.65 }
        ];
      } else if (isPairHand) {
        freqs = [
          { action: 'fold', label: 'Fold', frequency: 0.35, ev: 0 },
          { action: 'call', label: 'Call', frequency: 0.60, ev: potSize * 0.30 },
          { action: 'raise', label: 'Raise', frequency: 0.05, ev: potSize * 0.20 }
        ];
      } else {
        freqs = [
          { action: 'fold', label: 'Fold', frequency: 0.90, ev: 0 },
          { action: 'call', label: 'Call', frequency: 0.10, ev: -0.3 }
        ];
      }
    }
  }

  const optimalAction = [...freqs].sort((a, b) => b.ev - a.ev || b.frequency - a.frequency)[0];

  return {
    nodeId: `${street}_${position}_${handKey}`,
    handKey,
    position,
    street,
    frequencies: freqs,
    optimalAction
  };
}
