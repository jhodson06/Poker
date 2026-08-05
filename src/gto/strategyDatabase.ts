import { Card, RANKS, createCard } from '../engine/card';
import { PlayerPosition, BettingStreet } from '../engine/stateMachine';
import { evaluate7Cards } from '../engine/evaluator';
import { detectBoardTexture } from '../engine/betAbstraction';
import { getStaticPreflopRange, getHandIndex, Range } from '../engine/rangeBuilder';
import { RiverSolver, GameState } from '../engine/cfrSolver';

export type ActionTypeDB = 'fold' | 'check' | 'call' | 'bet_33' | 'bet_50' | 'bet_67' | 'bet_75' | 'bet_100' | 'bet_150' | 'bet_overbet' | 'raise' | 'allin';

export interface ActionFrequency {
  action: ActionTypeDB;
  label: string;
  frequency: number;
  ev: number;
  potFraction?: number;
}

export interface GtoNodeStrategy {
  nodeId: string;
  handKey: string;
  position: PlayerPosition;
  street: BettingStreet;
  boardTexture?: 'dry' | 'wet' | 'very_wet';
  optimalAction: ActionFrequency;
  frequencies: ActionFrequency[];
}

// --- RIVER CFR CACHE ---
let _riverCacheKey = '';
let _riverCacheData = new Map<number, ActionFrequency[]>();

function getCachedRiverSolve(
  board: Card[],
  currentHighBet: number,
  potSize: number,
  bigBlind: number,
  position: PlayerPosition
): Map<number, ActionFrequency[]> | null {
  const isP1Turn = position === 'BTN' || position === 'CO';
  const toCall = currentHighBet > 0 ? currentHighBet : 0;
  
  const boardKey = board.map(c => c.value + c.suit).join('');
  const key = `${boardKey}_${potSize}_${currentHighBet}_${isP1Turn}`;
  
  if (_riverCacheKey === key) return _riverCacheData;
  
  const state: GameState = {
    board,
    pot: potSize,
    p1Stack: 100 * bigBlind,
    p2Stack: 100 * bigBlind,
    isP1Turn,
    history: currentHighBet > 0 ? ['bet_67'] : [],
    terminal: false,
    p1Commit: isP1Turn ? 0 : toCall,
    p2Commit: isP1Turn ? toCall : 0,
  };

  const p1Range = Range.full();
  const p2Range = Range.full();
  p1Range.removeBlockers(board);
  p2Range.removeBlockers(board);
  p1Range.normalize();
  p2Range.normalize();

  const solver = new RiverSolver(board);
  solver.solve(state, p1Range, p2Range, 20);
  
  const rootInfoset = (isP1Turn ? 'P1' : 'P2') + '|' + state.history.join(',');
  const node = (solver as any).nodeMap.get(rootInfoset);
  
  if (!node) return null;
  
  _riverCacheData.clear();
  _riverCacheKey = key;
  
  for (let h = 0; h < 1326; h++) {
    const avgStrat = solver.getAverageStrategy(rootInfoset, h);
    if (!avgStrat) continue;
    
    let freqs: ActionFrequency[] = [];
    for (let a = 0; a < node.actions.length; a++) {
      const act = node.actions[a] as string;
      const freq = avgStrat[a];
      let dbAct: ActionTypeDB = 'call';
      let label = act.toUpperCase();
      
      if (act === 'fold') { dbAct = 'fold'; label = 'Fold'; }
      if (act === 'call' && toCall === 0) { dbAct = 'check'; label = 'Check'; }
      if (act === 'call' && toCall > 0) { dbAct = 'call'; label = 'Call'; }
      if (act === 'bet_67') { dbAct = 'bet_67'; label = 'Bet 67% Pot'; }
      if (act === 'allin') { dbAct = 'allin'; label = 'All-In'; }
      
      freqs.push({ action: dbAct, label, frequency: Number(freq.toFixed(2)), ev: 0 });
    }
    
    freqs.sort((a, b) => b.frequency - a.frequency);
    _riverCacheData.set(h, freqs);
  }
  
  return _riverCacheData;
}
// --- END CACHE ---

export function getCanonicalHandKey(c1: Card, c2: Card): string {
  const r1 = c1.value, r2 = c2.value;
  const highRank = RANKS[Math.max(r1, r2)];
  const lowRank  = RANKS[Math.min(r1, r2)];
  if (r1 === r2) return `${highRank}${lowRank}`;
  return `${highRank}${lowRank}${c1.suit === c2.suit ? 's' : 'o'}`;
}

function isInPosition(p: PlayerPosition)   { return p === 'BTN' || p === 'CO'; }
function isLatePosition(p: PlayerPosition) { return p === 'BTN' || p === 'CO' || p === 'SB'; }

// Preflop Charts
import { RFI_CHARTS, VS_OPEN_CHARTS, FACING_3BET, FACING_4BET, buildChartMatrix } from './preflopCharts';

// Pre-build the chart matrices for fast lookups
const RFI_MATRIX = new Map();
for (const [pos, mapping] of Object.entries(RFI_CHARTS)) {
  RFI_MATRIX.set(pos, buildChartMatrix(mapping));
}

const VS_OPEN_MATRIX = new Map();
for (const [opener, responses] of Object.entries(VS_OPEN_CHARTS)) {
  const innerMap = new Map();
  for (const [pos, mapping] of Object.entries(responses)) {
    innerMap.set(pos, buildChartMatrix(mapping));
  }
  VS_OPEN_MATRIX.set(opener, innerMap);
}

const FACING_3BET_MATRIX = new Map();
for (const [pos, mapping] of Object.entries(FACING_3BET)) {
  FACING_3BET_MATRIX.set(pos, buildChartMatrix(mapping));
}

const FACING_4BET_MATRIX = new Map();
for (const [pos, mapping] of Object.entries(FACING_4BET)) {
  FACING_4BET_MATRIX.set(pos, buildChartMatrix(mapping));
}

export function getGtoStrategyForState(
  c1: Card, c2: Card,
  position: PlayerPosition,
  street: BettingStreet,
  currentHighBet: number,
  potSize: number,
  bigBlind: number,
  communityCards: Card[] = [],
  raiseCount: number = 0,
  history: any[] = [] // Optional history to determine the opener
): GtoNodeStrategy {
  const handKey  = getCanonicalHandKey(c1, c2);
  const r1 = c1.value, r2 = c2.value;
  const isPair   = r1 === r2;
  const highVal  = Math.max(r1, r2);
  const lowVal   = Math.min(r1, r2);
  const isSuited = c1.suit === c2.suit;
  const ip = isInPosition(position);
  const lp = isLatePosition(position);

  let freqs: ActionFrequency[] = [];
  let boardTexture: 'dry' | 'wet' | 'very_wet' | undefined;

  if (street === 'preflop') {
    const isFacingRaise = currentHighBet > bigBlind;
    const is3BetSpot    = isFacingRaise && raiseCount === 1;
    const is4BetSpot    = raiseCount >= 2;
    const is5BetSpot    = raiseCount >= 3;

    // Default basic EV estimates for preflop actions
    const getEv = (action: string) => {
      if (action === 'fold') return 0;
      if (action.includes('raise')) return 1.5;
      if (action.includes('call')) return 0.5;
      return 0;
    };

    if (!isFacingRaise) {
      // 1. RFI
      const matrix = RFI_MATRIX.get(position);
      const handActions = matrix ? matrix.get(handKey) : { fold: 1.0 };
      const openLabel = lp ? 'Raise 3x BB' : 'Raise 2.5x BB';
      
      for (const [act, freq] of Object.entries(handActions || { fold: 1.0 })) {
        if (freq as number > 0) {
          const actionType = act.includes('raise') ? 'raise' : 'fold';
          freqs.push({
            action: actionType as any,
            label: actionType === 'raise' ? openLabel : 'Fold',
            frequency: freq as number,
            ev: getEv(act)
          });
        }
      }
    } else if (is3BetSpot) {
      // 2. Facing an Open
      // We need to know who the opener was. For MVP, assume UTG if early, otherwise roughly BTN.
      let opener = 'UTG';
      if (position === 'SB' || position === 'BB') opener = 'BTN';
      else if (position === 'BTN') opener = 'CO';
      
      const matrix = VS_OPEN_MATRIX.get(opener)?.get(position) || VS_OPEN_MATRIX.get('UTG')?.get(position);
      const handActions = matrix ? matrix.get(handKey) : { fold: 1.0 };
      const raiseLabel = ip ? '3-Bet 3x' : '3-Bet 4x';
      
      for (const [act, freq] of Object.entries(handActions || { fold: 1.0 })) {
        if (freq as number > 0) {
          const actionType = act.includes('raise') ? 'raise' : act.includes('call') ? 'call' : 'fold';
          freqs.push({
            action: actionType as any,
            label: actionType === 'raise' ? raiseLabel : actionType === 'call' ? 'Call' : 'Fold',
            frequency: freq as number,
            ev: getEv(act)
          });
        }
      }
    } else if (is4BetSpot && !is5BetSpot) {
      // 3. Facing a 3-Bet
      const matrix = FACING_3BET_MATRIX.get(position);
      const handActions = matrix ? matrix.get(handKey) : { fold: 1.0 };
      const raiseLabel = ip ? '4-Bet 2.3x' : '4-Bet 2.8x';
      
      for (const [act, freq] of Object.entries(handActions || { fold: 1.0 })) {
        if (freq as number > 0) {
          const actionType = act.includes('raise') ? 'raise' : act.includes('call') ? 'call' : 'fold';
          freqs.push({
            action: actionType as any,
            label: actionType === 'raise' ? raiseLabel : actionType === 'call' ? 'Call' : 'Fold',
            frequency: freq as number,
            ev: getEv(act)
          });
        }
      }
    } else {
      // 4. Facing a 4-Bet or 5-Bet Shove
      const matrix = FACING_4BET_MATRIX.get(position);
      const handActions = matrix ? matrix.get(handKey) : { fold: 1.0 };
      
      for (const [act, freq] of Object.entries(handActions || { fold: 1.0 })) {
        if (freq as number > 0) {
          const actionType = act.includes('raise') ? 'allin' : act.includes('call') ? 'call' : 'fold';
          freqs.push({
            action: actionType as any,
            label: actionType === 'allin' ? '5-Bet All-In' : actionType === 'call' ? 'Call' : 'Fold',
            frequency: freq as number,
            ev: getEv(act)
          });
        }
      }
    }
    
    // Fallback if freqs is empty
    if (freqs.length === 0) {
       freqs.push({ action: 'fold', label: 'Fold', frequency: 1.0, ev: 0 });
    }
  } else {
    let activeBoard = communityCards;
    if (!activeBoard || activeBoard.length === 0) {
      activeBoard = [createCard('A', 'c'), createCard('T', 'd'), createCard('7', 's')];
      if (street === 'turn' || street === 'river') activeBoard.push(createCard('2', 'h'));
      if (street === 'river') activeBoard.push(createCard('K', 'h'));
    }
    
    // --- REAL-TIME RIVER SOLVER MVP ---
    // If it's the river, we use the real-time CFR engine!
    if (street === 'river') {
      const solverResult = getCachedRiverSolve(activeBoard, currentHighBet, potSize, bigBlind, position);
      if (solverResult) {
        const hIdx = getHandIndex(c1, c2);
        const node = solverResult.get(hIdx);
        const handKey = getCanonicalHandKey(c1, c2);
        if (node) {
           return {
             nodeId: `river_${position}_${handKey}`,
             handKey,
             position,
             street,
             optimalAction: node[0] || { action: 'check', label: 'Check', frequency: 1.0, ev: 0 },
             frequencies: node
           };
        }
      }
    }
    // --- END REAL-TIME SOLVER ---

    boardTexture = detectBoardTexture(activeBoard);
    const isWet     = boardTexture === 'wet' || boardTexture === 'very_wet';
    const isTurnRiv = street === 'turn' || street === 'river';
    const P = potSize;

    const handEval  = evaluate7Cards([c1, c2, ...activeBoard]);
    const cat = handEval.category;
    const isNutHand  = cat === 'Straight Flush' || cat === 'Four of a Kind' || cat === 'Full House';
    const isMonster  = isNutHand || cat === 'Flush' || cat === 'Straight' || cat === 'Three of a Kind';
    const isTwoPair  = cat === 'Two Pair';
    const isPairHand = cat === 'One Pair';
    const isFacingBet = currentHighBet > 0;

    if (!isFacingBet) {
      if (isNutHand && isTurnRiv) {
        freqs = [
          { action: 'check',   label: 'Check',        frequency: 0.10, ev: P*0.55, potFraction: 0    },
          { action: 'bet_75',  label: 'Bet 75% Pot',  frequency: 0.20, ev: P*0.75, potFraction: 0.75 },
          { action: 'bet_100', label: 'Bet 100% Pot', frequency: 0.25, ev: P*0.82, potFraction: 1.00 },
          { action: 'bet_150', label: 'Bet 150% Pot', frequency: 0.45, ev: P*0.90, potFraction: 1.50 },
        ];
      } else if (isMonster) {
        if (isWet) {
          freqs = [
            { action: 'check',   label: 'Check',        frequency: 0.15, ev: P*0.50, potFraction: 0    },
            { action: 'bet_50',  label: 'Bet 50% Pot',  frequency: 0.10, ev: P*0.65, potFraction: 0.50 },
            { action: 'bet_67',  label: 'Bet 67% Pot',  frequency: 0.45, ev: P*0.72, potFraction: 0.67 },
            { action: 'bet_75',  label: 'Bet 75% Pot',  frequency: 0.25, ev: P*0.70, potFraction: 0.75 },
            { action: 'bet_100', label: 'Bet 100% Pot', frequency: 0.05, ev: P*0.68, potFraction: 1.00 },
          ];
        } else {
          freqs = [
            { action: 'check',  label: 'Check',        frequency: 0.15, ev: P*0.48, potFraction: 0    },
            { action: 'bet_33', label: 'Bet 33% Pot',  frequency: 0.45, ev: P*0.68, potFraction: 0.33 },
            { action: 'bet_50', label: 'Bet 50% Pot',  frequency: 0.25, ev: P*0.65, potFraction: 0.50 },
            { action: 'bet_75', label: 'Bet 75% Pot',  frequency: 0.15, ev: P*0.62, potFraction: 0.75 },
          ];
        }
      } else if (isTwoPair) {
        if (isWet) {
          freqs = [
            { action: 'check',   label: 'Check',        frequency: 0.20, ev: P*0.45, potFraction: 0    },
            { action: 'bet_50',  label: 'Bet 50% Pot',  frequency: 0.10, ev: P*0.58, potFraction: 0.50 },
            { action: 'bet_67',  label: 'Bet 67% Pot',  frequency: 0.40, ev: P*0.65, potFraction: 0.67 },
            { action: 'bet_75',  label: 'Bet 75% Pot',  frequency: 0.25, ev: P*0.63, potFraction: 0.75 },
            { action: 'bet_100', label: 'Bet 100% Pot', frequency: 0.05, ev: P*0.60, potFraction: 1.00 },
          ];
        } else {
          freqs = [
            { action: 'check',  label: 'Check',        frequency: 0.20, ev: P*0.42, potFraction: 0    },
            { action: 'bet_33', label: 'Bet 33% Pot',  frequency: 0.50, ev: P*0.60, potFraction: 0.33 },
            { action: 'bet_50', label: 'Bet 50% Pot',  frequency: 0.20, ev: P*0.57, potFraction: 0.50 },
            { action: 'bet_75', label: 'Bet 75% Pot',  frequency: 0.10, ev: P*0.55, potFraction: 0.75 },
          ];
        }
      } else if (isPairHand) {
        if (isWet || isTurnRiv) {
          freqs = [
            { action: 'check',  label: 'Check',       frequency: 0.70, ev: P*0.35, potFraction: 0    },
            { action: 'bet_33', label: 'Bet 33% Pot', frequency: 0.20, ev: P*0.38, potFraction: 0.33 },
            { action: 'bet_50', label: 'Bet 50% Pot', frequency: 0.10, ev: P*0.33, potFraction: 0.50 },
          ];
        } else {
          freqs = [
            { action: 'check',  label: 'Check',       frequency: 0.55, ev: P*0.35, potFraction: 0    },
            { action: 'bet_33', label: 'Bet 33% Pot', frequency: 0.30, ev: P*0.42, potFraction: 0.33 },
            { action: 'bet_50', label: 'Bet 50% Pot', frequency: 0.15, ev: P*0.38, potFraction: 0.50 },
          ];
        }
      } else {
        if (isWet) {
          freqs = [
            { action: 'check',  label: 'Check',       frequency: 0.70, ev: P*0.08, potFraction: 0    },
            { action: 'bet_33', label: 'Bet 33% Pot', frequency: 0.10, ev: P*0.10, potFraction: 0.33 },
            { action: 'bet_67', label: 'Bet 67% Pot', frequency: 0.20, ev: P*0.14, potFraction: 0.67 },
          ];
        } else {
          freqs = [
            { action: 'check',  label: 'Check',       frequency: 0.87, ev: P*0.10, potFraction: 0    },
            { action: 'bet_33', label: 'Bet 33% Pot', frequency: 0.13, ev: P*0.12, potFraction: 0.33 },
          ];
        }
      }
    } else {
      if (isNutHand && isTurnRiv) {
        freqs = [
          { action: 'fold',  label: 'Fold',             frequency: 0.00, ev: 0      },
          { action: 'call',  label: 'Call',              frequency: 0.20, ev: P*0.80 },
          { action: 'raise', label: 'Raise (Overbet)',   frequency: 0.80, ev: P*0.95 },
        ];
      } else if (isMonster) {
        if (isWet) {
          freqs = [
            { action: 'fold',  label: 'Fold',       frequency: 0.00, ev: 0      },
            { action: 'call',  label: 'Call',        frequency: 0.30, ev: P*0.78 },
            { action: 'raise', label: 'Raise 67%',   frequency: 0.70, ev: P*0.92 },
          ];
        } else {
          freqs = [
            { action: 'fold',  label: 'Fold',  frequency: 0.00, ev: 0      },
            { action: 'call',  label: 'Call',   frequency: 0.40, ev: P*0.75 },
            { action: 'raise', label: 'Raise',  frequency: 0.60, ev: P*0.90 },
          ];
        }
      } else if (isTwoPair) {
        freqs = [
          { action: 'fold',  label: 'Fold',  frequency: 0.05,                    ev: 0      },
          { action: 'call',  label: 'Call',  frequency: isWet ? 0.65 : 0.75,     ev: P*0.55 },
          { action: 'raise', label: 'Raise', frequency: isWet ? 0.30 : 0.20,     ev: P*0.65 },
        ];
      } else if (isPairHand) {
        freqs = [
          { action: 'fold',  label: 'Fold',  frequency: isWet ? 0.45 : 0.35,    ev: 0      },
          { action: 'call',  label: 'Call',  frequency: isWet ? 0.50 : 0.60,    ev: P*0.30 },
          { action: 'raise', label: 'Raise', frequency: 0.05,                    ev: P*0.20 },
        ];
      } else {
        freqs = [
          { action: 'fold', label: 'Fold', frequency: 0.90, ev: 0    },
          { action: 'call', label: 'Call',  frequency: 0.10, ev: -0.3 },
        ];
      }
    }
  }

  const optimalAction = [...freqs].sort((a, b) => b.ev - a.ev || b.frequency - a.frequency)[0];

  return { nodeId: `${street}_${position}_${handKey}`, handKey, position, street, frequencies: freqs, optimalAction, boardTexture };
}
