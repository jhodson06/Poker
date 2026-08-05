import { Card, createDeck } from './card';
import { TableState } from './stateMachine';
import { evaluate7Cards } from './evaluator';

function getRawPreflopEquity(c1Val: number, c2Val: number, isSuited: boolean): number {
  const highVal = Math.max(c1Val, c2Val);
  const lowVal = Math.min(c1Val, c2Val);
  const isPair = c1Val === c2Val;

  if (isPair) return Math.round(55 + highVal * 3.2); // 22: ~55, AA: ~96
  let base = highVal * 2.5 + lowVal * 1.5;
  if (isSuited) base += 5;
  if (highVal - lowVal <= 2) base += 4;
  return Math.min(90, Math.max(18, Math.round(base)));
}

export function calculateTableEquities(state: TableState): Map<number, number> {
  const equityMap = new Map<number, number>();
  const activePlayers = state.players.filter(p => !p.isFolded && p.holeCards.length === 2);

  if (activePlayers.length === 0) return equityMap;
  if (activePlayers.length === 1) {
    equityMap.set(activePlayers[0].seatIndex, 100);
    return equityMap;
  }

  const community = state.communityCards || [];
  const commCount = community.length;

  // -------------------------------------------------------------------------
  // Case 1: River / Showdown (5 Community Cards) — Deterministic Winner
  // -------------------------------------------------------------------------
  if (commCount >= 5) {
    let bestScore = Infinity;
    const playerScores: { seatIndex: number; score: number }[] = [];

    activePlayers.forEach(p => {
      const ev = evaluate7Cards([...p.holeCards, ...community]);
      playerScores.push({ seatIndex: p.seatIndex, score: ev.score });
      if (ev.score < bestScore) {
        bestScore = ev.score;
      }
    });

    const winners = playerScores.filter(ps => ps.score === bestScore);
    const winEq = Math.floor(100 / winners.length);

    activePlayers.forEach(p => {
      const isWinner = winners.some(w => w.seatIndex === p.seatIndex);
      equityMap.set(p.seatIndex, isWinner ? winEq : 0);
    });

    return equityMap;
  }

  // -------------------------------------------------------------------------
  // Case 2: Preflop (0 Community Cards) — Normalized Preflop Matchups
  // -------------------------------------------------------------------------
  if (commCount < 3) {
    const rawWeights: { seatIndex: number; weight: number }[] = [];
    activePlayers.forEach(p => {
      const c1 = p.holeCards[0];
      const c2 = p.holeCards[1];
      const isSuited = c1.suit === c2.suit;
      const weight = getRawPreflopEquity(c1.value, c2.value, isSuited);
      rawWeights.push({ seatIndex: p.seatIndex, weight });
    });

    const totalWeight = rawWeights.reduce((sum, item) => sum + item.weight, 0);
    if (totalWeight <= 0) return equityMap;

    let sumEq = 0;
    rawWeights.forEach((item, idx) => {
      let eq = Math.round((item.weight / totalWeight) * 100);
      if (idx === rawWeights.length - 1) {
        eq = Math.max(0, 100 - sumEq);
      } else {
        sumEq += eq;
      }
      equityMap.set(item.seatIndex, Math.min(100, Math.max(0, eq)));
    });

    return equityMap;
  }

  // -------------------------------------------------------------------------
  // Case 3: Flop (3 Cards) or Turn (4 Cards) — Exact Deck Rollout Enumeration
  // -------------------------------------------------------------------------
  // Get all remaining un-dealt cards in full 52-card deck
  const usedCardKeys = new Set<string>();
  community.forEach(c => usedCardKeys.add(`${c.rank}_${c.suit}`));
  activePlayers.forEach(p => {
    p.holeCards.forEach(c => usedCardKeys.add(`${c.rank}_${c.suit}`));
  });

  const remainingDeck = createDeck().filter(c => !usedCardKeys.has(`${c.rank}_${c.suit}`));
  const seatWinCounts = new Map<number, number>();
  activePlayers.forEach(p => seatWinCounts.set(p.seatIndex, 0));

  let totalSimulations = 0;

  if (commCount === 4) {
    // Turn (4 cards): 44 single river card rollouts
    remainingDeck.forEach(riverCard => {
      totalSimulations++;
      const board5 = [...community, riverCard];
      let bestScore = Infinity;
      const scores: { seatIndex: number; score: number }[] = [];

      activePlayers.forEach(p => {
        const ev = evaluate7Cards([...p.holeCards, ...board5]);
        scores.push({ seatIndex: p.seatIndex, score: ev.score });
        if (ev.score < bestScore) bestScore = ev.score;
      });

      const winners = scores.filter(s => s.score === bestScore);
      winners.forEach(w => {
        seatWinCounts.set(w.seatIndex, (seatWinCounts.get(w.seatIndex) || 0) + (1 / winners.length));
      });
    });
  } else if (commCount === 3) {
    // Flop (3 cards): Sample 150 turn+river rollouts for instant, accurate 100% equity
    const deckLen = remainingDeck.length;
    for (let i = 0; i < deckLen; i++) {
      for (let j = i + 1; j < deckLen; j++) {
        totalSimulations++;
        const board5 = [...community, remainingDeck[i], remainingDeck[j]];
        let bestScore = Infinity;
        const scores: { seatIndex: number; score: number }[] = [];

        activePlayers.forEach(p => {
          const ev = evaluate7Cards([...p.holeCards, ...board5]);
          scores.push({ seatIndex: p.seatIndex, score: ev.score });
          if (ev.score < bestScore) bestScore = ev.score;
        });

        const winners = scores.filter(s => s.score === bestScore);
        winners.forEach(w => {
          seatWinCounts.set(w.seatIndex, (seatWinCounts.get(w.seatIndex) || 0) + (1 / winners.length));
        });
      }
    }
  }

  if (totalSimulations <= 0) return equityMap;

  let sumEq = 0;
  activePlayers.forEach((p, idx) => {
    const wins = seatWinCounts.get(p.seatIndex) || 0;
    let eq = Math.round((wins / totalSimulations) * 100);
    if (idx === activePlayers.length - 1) {
      eq = Math.max(0, 100 - sumEq);
    } else {
      sumEq += eq;
    }
    equityMap.set(p.seatIndex, Math.min(100, Math.max(0, eq)));
  });

  return equityMap;
}
