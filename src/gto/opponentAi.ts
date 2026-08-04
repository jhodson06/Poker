import { TableState } from '../engine/stateMachine';
import { getGtoStrategyForState } from './strategyDatabase';
import { evaluate7Cards } from '../engine/evaluator';

export interface AiDecision {
  seatIndex: number;
  action: 'fold' | 'check' | 'call' | 'bet' | 'raise';
  amount: number;
  explanation: string;
}

export function sampleOpponentAiAction(state: TableState): AiDecision {
  const activeSeat = state.activeSeat;
  const player = state.players[activeSeat];

  if (player.holeCards.length < 2) {
    return { seatIndex: activeSeat, action: 'fold', amount: 0, explanation: 'No cards' };
  }

  const strategy = getGtoStrategyForState(
    player.holeCards[0],
    player.holeCards[1],
    player.position,
    state.street,
    state.currentHighBet,
    state.pot,
    state.bigBlind,
    state.communityCards
  );

  // Roll pseudo-random number to sample action according to GTO probability distribution
  const rand = Math.random();
  let cumulative = 0;
  let chosen = strategy.frequencies[0];

  for (const item of strategy.frequencies) {
    cumulative += item.frequency;
    if (rand <= cumulative) {
      chosen = item;
      break;
    }
  }

  let action: AiDecision['action'] = 'check';
  let amount = 0;

  if (chosen.action === 'fold') {
    action = 'fold';
  } else if (chosen.action === 'check') {
    action = state.currentHighBet > player.currentBet ? 'call' : 'check';
  } else if (chosen.action === 'call') {
    action = 'call';
    amount = state.currentHighBet - player.currentBet;
  } else if (chosen.action === 'bet_33') {
    action = 'bet';
    amount = Math.max(state.bigBlind, Math.floor(state.pot * 0.33));
  } else if (chosen.action === 'bet_75') {
    action = 'bet';
    amount = Math.max(state.bigBlind, Math.floor(state.pot * 0.75));
  } else if (chosen.action === 'raise') {
    // If facing a re-raise or facing a bet postflop, check if holding strong made hand before raising
    if (state.street !== 'preflop' && state.communityCards.length >= 3) {
      const allCards = [...player.holeCards, ...state.communityCards];
      const handEval = evaluate7Cards(allCards);
      const isWeak = handEval.category === 'High Card' || handEval.category === 'One Pair';

      // Weak / unimproved hands call instead of re-raising postflop!
      if (isWeak && state.currentHighBet > 0) {
        action = 'call';
        amount = state.currentHighBet - player.currentBet;
        return {
          seatIndex: activeSeat,
          action,
          amount,
          explanation: `GTO policy call with ${handEval.category}`
        };
      }
    }

    action = 'raise';
    amount = Math.round(state.currentHighBet === 0 ? state.bigBlind * 3 : state.currentHighBet * 2.5);
  } else if (chosen.action === 'allin') {
    action = 'raise';
    amount = player.chips + player.currentBet;
  }

  return {
    seatIndex: activeSeat,
    action,
    amount,
    explanation: `GTO policy sampled action (${chosen.label}, freq ${(chosen.frequency * 100).toFixed(0)}%)`
  };
}
