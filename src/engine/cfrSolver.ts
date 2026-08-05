import { Card } from './card';
import { Range, getCardsFromIndex } from './rangeBuilder';
import { evaluate7Cards } from './evaluator';

export type ActionType = 'fold' | 'call' | 'bet_33' | 'bet_67' | 'bet_100' | 'allin';

export interface GameState {
  board: Card[];
  pot: number;
  p1Stack: number;
  p2Stack: number;
  isP1Turn: boolean;
  history: ActionType[];
  terminal: boolean;
  p1Commit: number;
  p2Commit: number;
}

export class CFRNode {
  public infoset: string;
  public actions: ActionType[];
  public regretSum: Float32Array;
  public strategySum: Float32Array;

  // Since we have 1326 hole card combinations, we want to store the regrets
  // per combination. So regretSum is a flat array of size (1326 * numActions)
  constructor(infoset: string, actions: ActionType[]) {
    this.infoset = infoset;
    this.actions = actions;
    this.regretSum = new Float32Array(1326 * actions.length);
    this.strategySum = new Float32Array(1326 * actions.length);
  }

  getStrategy(handIndex: number, weight: number): Float32Array {
    const numActions = this.actions.length;
    const strategy = new Float32Array(numActions);
    let normalizingSum = 0;
    
    for (let a = 0; a < numActions; a++) {
      const r = this.regretSum[handIndex * numActions + a];
      strategy[a] = r > 0 ? r : 0;
      normalizingSum += strategy[a];
    }
    
    for (let a = 0; a < numActions; a++) {
      if (normalizingSum > 0) {
        strategy[a] /= normalizingSum;
      } else {
        strategy[a] = 1.0 / numActions;
      }
      this.strategySum[handIndex * numActions + a] += weight * strategy[a];
    }
    
    return strategy;
  }

  getAverageStrategy(handIndex: number): Float32Array {
    const numActions = this.actions.length;
    const avgStrategy = new Float32Array(numActions);
    let normalizingSum = 0;
    
    for (let a = 0; a < numActions; a++) {
      normalizingSum += this.strategySum[handIndex * numActions + a];
    }
    
    for (let a = 0; a < numActions; a++) {
      if (normalizingSum > 0) {
        avgStrategy[a] = this.strategySum[handIndex * numActions + a] / normalizingSum;
      } else {
        avgStrategy[a] = 1.0 / numActions;
      }
    }
    
    return avgStrategy;
  }
}

export class RiverSolver {
  private nodeMap: Map<string, CFRNode> = new Map();
  private board: Card[];
  private handScores: Float32Array;
  
  constructor(board: Card[]) {
    this.board = board;
    this.handScores = new Float32Array(1326);
    this.precomputeScores();
  }
  
  private precomputeScores() {
    for (let i = 0; i < 1326; i++) {
       const [c1, c2] = getCardsFromIndex(i);
       this.handScores[i] = evaluate7Cards([c1, c2, ...this.board]).score;
    }
  }

  // Precompute hand strengths for all 1326 combos against the board
  // For the river, we just need to know who wins.
  private getWinner(h1: number, h2: number): number {
    const [c1a, c1b] = getCardsFromIndex(h1);
    const [c2a, c2b] = getCardsFromIndex(h2);
    // overlap check
    if (c1a.value === c2a.value && c1a.suit === c2a.suit) return 0;
    if (c1a.value === c2b.value && c1a.suit === c2b.suit) return 0;
    if (c1b.value === c2a.value && c1b.suit === c2a.suit) return 0;
    if (c1b.value === c2b.value && c1b.suit === c2b.suit) return 0;
    
    const res1 = this.handScores[h1];
    const res2 = this.handScores[h2];
    return res1 < res2 ? 1 : res1 > res2 ? -1 : 0;
  }

  private getActions(state: GameState): ActionType[] {
    if (state.terminal) return [];
    
    const actions: ActionType[] = [];
    const maxCommit = Math.max(state.p1Commit, state.p2Commit);
    const myCommit = state.isP1Turn ? state.p1Commit : state.p2Commit;
    const myStack = state.isP1Turn ? state.p1Stack : state.p2Stack;
    const toCall = maxCommit - myCommit;
    
    if (toCall > 0) {
      actions.push('fold');
      if (myStack >= toCall) {
        actions.push('call');
        if (state.history.length < 3 && myStack > toCall) {
          actions.push('allin');
        }
      } else {
        // Hero doesn't have enough chips to full call, so they just call all-in
        actions.push('call'); // implies all-in call
      }
    } else {
      actions.push('call'); // represents check
      if (myStack > 0) {
        actions.push('bet_67');
        actions.push('allin');
      }
    }
    return actions;
  }

  private getInfoset(state: GameState): string {
    return (state.isP1Turn ? 'P1' : 'P2') + '|' + state.history.join(',');
  }

  private applyAction(state: GameState, action: ActionType): GameState {
    const nextState = { ...state, history: [...state.history, action], isP1Turn: !state.isP1Turn };
    const myStack = state.isP1Turn ? state.p1Stack : state.p2Stack;
    const myCommit = state.isP1Turn ? state.p1Commit : state.p2Commit;
    const oppStack = state.isP1Turn ? state.p2Stack : state.p1Stack;
    const maxCommit = Math.max(state.p1Commit, state.p2Commit);
    const toCall = maxCommit - myCommit;
    
    if (action === 'fold') {
      nextState.terminal = true;
    } else if (action === 'call') {
      const callAmt = Math.min(myStack, toCall);
      if (state.isP1Turn) {
        nextState.p1Commit += callAmt;
        nextState.p1Stack -= callAmt;
      } else {
        nextState.p2Commit += callAmt;
        nextState.p2Stack -= callAmt;
      }
      nextState.pot += callAmt;
      if (toCall > 0 || state.history.length > 0) {
        nextState.terminal = true;
      }
    } else if (action.startsWith('bet_')) {
      const pct = parseInt(action.split('_')[1]) / 100;
      const betAmt = Math.min(myStack, Math.floor(state.pot * pct));
      if (state.isP1Turn) {
        nextState.p1Commit += betAmt;
        nextState.p1Stack -= betAmt;
      } else {
        nextState.p2Commit += betAmt;
        nextState.p2Stack -= betAmt;
      }
      nextState.pot += betAmt;
    } else if (action === 'allin') {
      const betAmt = myStack;
      if (state.isP1Turn) {
        nextState.p1Commit += betAmt;
        nextState.p1Stack -= betAmt;
      } else {
        nextState.p2Commit += betAmt;
        nextState.p2Stack -= betAmt;
      }
      nextState.pot += betAmt;
      // If opponent has no chips left to call, we can auto-terminate
      if (oppStack === 0) {
         nextState.terminal = true;
      }
    }
    
    return nextState;
  }

  public solve(initialState: GameState, p1Range: Range, p2Range: Range, iterations: number) {
    // Vectorized CFR for 1326 combos simultaneously
    for (let i = 0; i < iterations; i++) {
      this.cfr(initialState, p1Range.weights, p2Range.weights, 1.0, 1.0);
    }
  }

  private cfr(state: GameState, p1Weights: Float32Array, p2Weights: Float32Array, p1Prob: number, p2Prob: number): Float32Array {
    const util = new Float32Array(1326);
    
    if (state.terminal) {
      // Calculate terminal utility for all 1326 hands for the active player
      const isFold = state.history[state.history.length - 1] === 'fold';
      
      for (let h1 = 0; h1 < 1326; h1++) {
        if (state.isP1Turn ? p1Weights[h1] === 0 : p2Weights[h1] === 0) continue;
        
        let expectedValue = 0;
        let oppSum = 0;
        for (let h2 = 0; h2 < 1326; h2++) {
          const oppWeight = state.isP1Turn ? p2Weights[h2] : p1Weights[h2];
          if (oppWeight === 0) continue;
          
          oppSum += oppWeight;
          
          if (isFold) {
            // Active player folded, so they lose their commit, but actually utility is relative to pot
            // Just return the negative of what they had to call, or rather 0 since folding ends it
            expectedValue -= (state.isP1Turn ? state.p1Commit : state.p2Commit) * oppWeight;
          } else {
            // Showdown
            const winner = state.isP1Turn ? this.getWinner(h1, h2) : this.getWinner(h2, h1);
            if (winner > 0) {
              expectedValue += (state.pot - (state.isP1Turn ? state.p1Commit : state.p2Commit)) * oppWeight;
            } else if (winner < 0) {
              expectedValue -= (state.isP1Turn ? state.p1Commit : state.p2Commit) * oppWeight;
            }
          }
        }
        util[h1] = oppSum > 0 ? expectedValue / oppSum : 0;
      }
      return util;
    }

    const infoSet = this.getInfoset(state);
    const actions = this.getActions(state);
    if (!this.nodeMap.has(infoSet)) {
      this.nodeMap.set(infoSet, new CFRNode(infoSet, actions));
    }
    const node = this.nodeMap.get(infoSet)!;
    const numActions = actions.length;
    
    const actionUtils = new Array(numActions).fill(0).map(() => new Float32Array(1326));
    const strategies = new Array(numActions).fill(0).map(() => new Float32Array(1326));
    
    for (let h = 0; h < 1326; h++) {
      const weight = state.isP1Turn ? p1Weights[h] : p2Weights[h];
      if (weight === 0) continue;
      const strategy = node.getStrategy(h, state.isP1Turn ? p1Prob : p2Prob);
      for (let a = 0; a < numActions; a++) {
        strategies[a][h] = strategy[a];
      }
    }

    for (let a = 0; a < numActions; a++) {
      const nextState = this.applyAction(state, actions[a]);
      
      const nextP1Weights = new Float32Array(1326);
      const nextP2Weights = new Float32Array(1326);
      
      if (state.isP1Turn) {
        for (let h = 0; h < 1326; h++) {
          nextP1Weights[h] = p1Weights[h] * strategies[a][h];
          nextP2Weights[h] = p2Weights[h];
        }
      } else {
        for (let h = 0; h < 1326; h++) {
          nextP1Weights[h] = p1Weights[h];
          nextP2Weights[h] = p2Weights[h] * strategies[a][h];
        }
      }
      
      const childUtil = this.cfr(nextState, nextP1Weights, nextP2Weights, 
                                 state.isP1Turn ? p1Prob * (1/numActions) : p1Prob, 
                                 state.isP1Turn ? p2Prob : p2Prob * (1/numActions));
      
      for (let h = 0; h < 1326; h++) {
        actionUtils[a][h] = -childUtil[h]; // Zero-sum
        util[h] += strategies[a][h] * actionUtils[a][h];
      }
    }

    for (let h = 0; h < 1326; h++) {
      const weight = state.isP1Turn ? p2Prob : p1Prob; // Opponent reach prob controls regret magnitude
      if (weight === 0) continue;
      
      for (let a = 0; a < numActions; a++) {
        const regret = actionUtils[a][h] - util[h];
        node.regretSum[h * numActions + a] += weight * regret;
      }
    }

    return util;
  }

  public getAverageStrategy(infoSet: string, handIndex: number): Float32Array | null {
    const node = this.nodeMap.get(infoSet);
    if (!node) return null;
    return node.getAverageStrategy(handIndex);
  }
}
