import { TableState, PlayerPosition } from '../engine/stateMachine';
import { getGtoStrategyForState } from './strategyDatabase';
import { evaluate7Cards } from '../engine/evaluator';

export interface AiDecision {
  seatIndex: number;
  action: 'fold' | 'check' | 'call' | 'bet' | 'raise';
  amount: number;
  explanation: string;
}

/**
 * Determine if a position is In-Position (IP) for 3-bet/4-bet sizing.
 * BTN and CO hold positional advantage postflop → smaller 3-bet/4-bet size needed.
 */
function isIpPosition(position: PlayerPosition): boolean {
  return position === 'BTN' || position === 'CO';
}

/**
 * Determine if a position is Late Position (LP) for RFI open sizing.
 * LP = BTN, CO, SB → open 2.5–3.0x BB per PDF spec.
 * EP/MP = UTG, MP → open 2.0–2.5x BB.
 */
function isLpPosition(position: PlayerPosition): boolean {
  return position === 'BTN' || position === 'CO' || position === 'SB';
}

/**
 * All valid hero bet sizes per mode — AI mirrors these exactly so it never
 * performs a bet size the player couldn't have chosen.
 *
 * GTO Bet Sizing rules per PDF "GTO Bet Sizing and Action Abstraction Mechanics":
 *   Preflop RFI:
 *     - EP/MP (UTG, MP): 2.0–2.5x BB
 *     - LP (BTN, CO, SB): 2.5–3.0x BB
 *   3-Bet:
 *     - IP (BTN, CO): 3.0x previous bet
 *     - OOP (SB, BB, UTG, MP): 4.0x previous bet
 *   4-Bet:
 *     - IP: 2.2–2.5x previous 3-bet
 *     - OOP: 2.7–3.0x previous 3-bet
 *   Postflop:
 *     - Small (25–33%): dry boards, high frequency
 *     - Large (67–75%): wet/dynamic boards, polarized ranges
 *     - Overbet (125–150%+): nut advantage, capped opponent
 */
function getAiBetAmount(
  state: TableState,
  mode: 'simple' | 'standard' | undefined,
  position: PlayerPosition
): number {
  const bb = state.bigBlind;
  const pot = state.pot;
  const facing = state.currentHighBet;
  const isPreflop = state.street === 'preflop';
  const ip = isIpPosition(position);
  const lp = isLpPosition(position);
  const raiseCount = state.raiseCount ?? 0;

  if (isPreflop) {
    const isFacingRaise = facing > bb;
    // Fallback: If facing is very large (>= 12 BB), it's at least a 4-bet spot even if raiseCount tracking lagged
    const is4BetSpot = isFacingRaise && (raiseCount >= 2 || facing >= bb * 12);

    if (!isFacingRaise) {
      // ── RFI Open ──────────────────────────────────────────────────────────
      if (mode === 'standard') {
        // Standard: weighted toward GTO-optimal size for position
        if (lp) {
          // LP: 2.5–3.0x BB, weighted toward 3.0x
          const mults = [2.5, 2.5, 3.0, 3.0, 3.0];
          return Math.round(bb * mults[Math.floor(Math.random() * mults.length)]);
        } else {
          // EP/MP: 2.0–2.5x BB, weighted toward 2.5x
          const mults = [2.0, 2.5, 2.5, 2.5];
          return Math.round(bb * mults[Math.floor(Math.random() * mults.length)]);
        }
      }
      // Simple: fixed GTO size per position
      return Math.round(bb * (lp ? 3.0 : 2.5));

    } else if (is4BetSpot) {
      // ── 4-Bet ─────────────────────────────────────────────────────────────
      if (mode === 'standard') {
        if (ip) {
          // IP 4-bet: 2.2–2.5x previous bet
          const mults = [2.2, 2.3, 2.5, 2.5];
          return Math.round(facing * mults[Math.floor(Math.random() * mults.length)]);
        } else {
          // OOP 4-bet: 2.7–3.0x previous bet
          const mults = [2.7, 2.8, 3.0, 3.0];
          return Math.round(facing * mults[Math.floor(Math.random() * mults.length)]);
        }
      }
      // Simple: midpoint of each range
      return Math.round(facing * (ip ? 2.3 : 2.8));

    } else {
      // ── 3-Bet ─────────────────────────────────────────────────────────────
      if (mode === 'standard') {
        if (ip) {
          // IP 3-bet: 3.0x (slight variance)
          const mults = [2.8, 3.0, 3.0, 3.0, 3.2];
          return Math.round(facing * mults[Math.floor(Math.random() * mults.length)]);
        } else {
          // OOP 3-bet: 4.0x (slight variance)
          const mults = [3.7, 4.0, 4.0, 4.0, 4.2];
          return Math.round(facing * mults[Math.floor(Math.random() * mults.length)]);
        }
      }
      // Simple: fixed GTO sizes
      return Math.round(facing * (ip ? 3.0 : 4.0));
    }
  }

  // ── Postflop ──────────────────────────────────────────────────────────────
  if (mode === 'standard') {
    if (facing > 0) {
      // Facing a bet: standard raise multipliers
      const mults = [2.0, 2.0, 2.5, 2.5, 3.0];
      const mult = mults[Math.floor(Math.random() * mults.length)];
      return Math.max(bb, Math.round(facing * mult));
    }
    // Initiating a bet: pot-% menu (weighted toward GTO-optimal sizes)
    const pcts = [0.25, 0.33, 0.33, 0.50, 0.75, 0.75, 1.00, 1.33];
    const pct = pcts[Math.floor(Math.random() * pcts.length)];
    return Math.max(bb, Math.round(pot * pct));
  }

  // Simple mode postflop: 33% pot bet (dry), or 2.5x re-raise
  // (Board texture routing handled by strategy database; AI uses uniform simple default)
  return facing > 0
    ? Math.max(bb, Math.round(facing * 2.5))
    : Math.max(bb, Math.round(pot * 0.33));
}

export function sampleOpponentAiAction(
  state: TableState,
  mode?: 'simple' | 'standard',
  // isStrictStrategy is deliberately ignored — AI always plays full mixed GTO
  // regardless of strict mode (only hero grading is affected by that setting)
  _isStrictStrategy?: boolean
): AiDecision {
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
    state.communityCards,
    state.raiseCount
  );

  // ── Sample action from GTO probability distribution (always — strict mode only affects hero grading) ──
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
    // bet_33 is a valid hero option in both modes (Simple = only bet size; Standard = 33% button)
    action = 'bet';
    amount = Math.max(state.bigBlind, Math.floor(state.pot * 0.33));
  } else if (chosen.action === 'bet_75') {
    action = 'bet';
    if (mode === 'simple') {
      // In Simple Mode, board texture determines the button label but still fires as bet
      // Use actual 75% size for AI (it has no UI constraints)
      amount = Math.max(state.bigBlind, Math.floor(state.pot * 0.75));
    } else {
      amount = Math.max(state.bigBlind, Math.floor(state.pot * 0.75));
    }
  } else if (chosen.action === 'bet_overbet') {
    // Overbet: 125–150% pot, use 133% as midpoint
    action = 'bet';
    amount = Math.max(state.bigBlind, Math.floor(state.pot * 1.33));
  } else if (chosen.action === 'raise') {
    // Postflop: check if weak hand should just call instead of re-raising
    if (state.street !== 'preflop' && state.communityCards.length >= 3) {
      const allCards = [...player.holeCards, ...state.communityCards];
      const handEval = evaluate7Cards(allCards);
      const isWeak = handEval.category === 'High Card' || handEval.category === 'One Pair';

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
    amount = getAiBetAmount(state, mode, player.position);
  } else if (chosen.action === 'allin') {
    action = 'raise';
    amount = player.chips + player.currentBet; // All-in is always a valid option
  }

  return {
    seatIndex: activeSeat,
    action,
    amount,
    explanation: `GTO policy sampled action (${chosen.label}, freq ${(chosen.frequency * 100).toFixed(0)}%)`
  };
}
