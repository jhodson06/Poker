import { Card, createDeck, shuffleDeck } from './card';
import { evaluate7Cards, HandEvaluation } from './evaluator';

export type BettingStreet = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
export type PlayerPosition = 'SB' | 'BB' | 'UTG' | 'MP' | 'CO' | 'BTN';
export type StackResetMode = 'persistent' | 'reset_each_hand';

export interface PlayerState {
  id: string;
  name: string;
  isHuman: boolean;
  seatIndex: number;
  position: PlayerPosition;
  chips: number;
  currentBet: number;
  totalInvested: number;
  holeCards: Card[];
  isFolded: boolean;
  isAllIn: boolean;
  lastAction?: string;
}

export interface ActionLog {
  seatIndex: number;
  playerName: string;
  position: PlayerPosition;
  action: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin';
  amount: number;
  street: BettingStreet;
  timestamp: number;
}

export interface TableState {
  playerCount: number;
  startingStackBB: number;
  stackResetMode: StackResetMode;
  bigBlind: number;
  smallBlind: number;
  dealerSeat: number;
  activeSeat: number;
  street: BettingStreet;
  pot: number;
  currentHighBet: number;
  minRaise: number;
  communityCards: Card[];
  phantomCommunityCards: Card[]; // Cards that would have been dealt if hand continued
  players: PlayerState[];
  actionLogs: ActionLog[];
  deck: Card[];
  winners?: { seatIndex: number; name: string; amount: number; evaluation?: HandEvaluation }[];
}

export function getPositionNames(count: number): PlayerPosition[] {
  if (count === 2) return ['SB', 'BB'];
  if (count === 3) return ['BTN', 'SB', 'BB'];
  if (count === 4) return ['BTN', 'SB', 'BB', 'CO'];
  if (count === 5) return ['BTN', 'SB', 'BB', 'MP', 'CO'];
  return ['BTN', 'SB', 'BB', 'UTG', 'MP', 'CO']; // 6-max
}

export function createInitialTableState(
  playerCount: number = 6,
  startingStackBB: number = 100,
  stackResetMode: StackResetMode = 'persistent'
): TableState {
  const bb = 2; // 1 BB = 2 chips
  const sb = 1;
  const startingChips = startingStackBB * bb;
  const positions = getPositionNames(playerCount);

  const players: PlayerState[] = [];
  const heroSeat = playerCount === 2 ? 0 : Math.floor(playerCount / 2);

  for (let i = 0; i < playerCount; i++) {
    const isHero = i === heroSeat;
    players.push({
      id: `player-${i}`,
      name: isHero ? 'Hero (You)' : `Villain ${i}`,
      isHuman: isHero,
      seatIndex: i,
      position: positions[i] || 'BTN',
      chips: startingChips,
      currentBet: 0,
      totalInvested: 0,
      holeCards: [],
      isFolded: false,
      isAllIn: false
    });
  }

  return {
    playerCount,
    startingStackBB,
    stackResetMode,
    bigBlind: bb,
    smallBlind: sb,
    dealerSeat: playerCount - 1,
    activeSeat: 0,
    street: 'preflop',
    pot: 0,
    currentHighBet: bb,
    minRaise: bb * 2,
    communityCards: [],
    phantomCommunityCards: [],
    players,
    actionLogs: [],
    deck: []
  };
}

export function startNewHand(state: TableState): TableState {
  let deck = shuffleDeck(createDeck());

  const newDealer = (state.dealerSeat + 1) % state.playerCount;
  const positions = getPositionNames(state.playerCount);
  const targetStackChips = (state.startingStackBB || 100) * state.bigBlind;
  const resetMode = state.stackResetMode || 'persistent';

  const players: PlayerState[] = state.players.map((p, idx) => {
    let posIdx: number;
    if (state.playerCount === 2) {
      posIdx = idx === newDealer ? 0 : 1;
    } else {
      const offset = (idx - newDealer + state.playerCount) % state.playerCount;
      posIdx = offset; // 0 = BTN, 1 = SB, 2 = BB, 3 = UTG, 4 = MP, 5 = CO
    }

    let finalChips = p.chips;
    if (resetMode === 'reset_each_hand') {
      finalChips = targetStackChips;
    } else {
      // Persistent stack mode: keep winnings/losses, auto-rebuy if busted (0 chips)
      if (finalChips <= 0) {
        finalChips = targetStackChips;
      }
    }

    return {
      ...p,
      position: positions[posIdx] || 'BTN',
      currentBet: 0,
      totalInvested: 0,
      holeCards: [],
      isFolded: false,
      isAllIn: false,
      lastAction: undefined,
      chips: finalChips
    };
  });

  // Deal hole cards (2 per player)
  for (let round = 0; round < 2; round++) {
    for (let i = 0; i < state.playerCount; i++) {
      const card = deck.pop()!;
      players[i].holeCards.push(card);
    }
  }

  // Calculate SB and BB seats strictly from newDealer
  let sbSeat: number, bbSeat: number;
  if (state.playerCount === 2) {
    sbSeat = newDealer;
    bbSeat = (newDealer + 1) % 2;
  } else {
    sbSeat = (newDealer + 1) % state.playerCount;
    bbSeat = (newDealer + 2) % state.playerCount;
  }

  const sbAmount = Math.min(players[sbSeat].chips, state.smallBlind);
  players[sbSeat].chips -= sbAmount;
  players[sbSeat].currentBet = sbAmount;
  players[sbSeat].totalInvested = sbAmount;
  players[sbSeat].lastAction = `SB ${sbAmount}`;

  const bbAmount = Math.min(players[bbSeat].chips, state.bigBlind);
  players[bbSeat].chips -= bbAmount;
  players[bbSeat].currentBet = bbAmount;
  players[bbSeat].totalInvested = bbAmount;
  players[bbSeat].lastAction = `BB ${bbAmount}`;

  // First active player preflop is seat after BB (UTG)
  const firstActive = (bbSeat + 1) % state.playerCount;
  const pot = players.reduce((sum, p) => sum + p.totalInvested, 0);

  return {
    ...state,
    dealerSeat: newDealer,
    activeSeat: firstActive,
    street: 'preflop',
    pot,
    currentHighBet: state.bigBlind,
    minRaise: state.bigBlind * 2,
    communityCards: [],
    phantomCommunityCards: [],
    players,
    actionLogs: [],
    deck,
    winners: undefined
  };
}

export function executePlayerAction(
  state: TableState,
  seatIndex: number,
  actionType: 'fold' | 'check' | 'call' | 'bet' | 'raise',
  raiseAmount: number = 0
): TableState {
  if (state.activeSeat !== seatIndex || state.street === 'showdown') return state;

  const player = state.players[seatIndex];
  const players = [...state.players];
  const actionLogs = [...state.actionLogs];
  let currentHighBet = state.currentHighBet;
  let minRaise = state.minRaise;

  let actualAction: ActionLog['action'] = actionType;
  let actualAmount = 0;

  if (actionType === 'fold') {
    player.isFolded = true;
    player.lastAction = 'Fold';
    actualAction = 'fold';
  } else if (actionType === 'check') {
    player.lastAction = 'Check';
    actualAction = 'check';
  } else if (actionType === 'call') {
    const amountNeeded = currentHighBet - player.currentBet;
    const callAmount = Math.min(player.chips, amountNeeded);
    player.chips -= callAmount;
    player.currentBet += callAmount;
    player.totalInvested += callAmount;
    actualAmount = callAmount;
    if (player.chips === 0) player.isAllIn = true;
    player.lastAction = player.isAllIn ? 'All-in' : 'Call';
    actualAction = player.isAllIn ? 'allin' : 'call';
  } else if (actionType === 'bet' || actionType === 'raise') {
    const targetBet = Math.max(raiseAmount, currentHighBet + minRaise);
    const addedChips = Math.min(player.chips, targetBet - player.currentBet);
    
    player.chips -= addedChips;
    player.currentBet += addedChips;
    player.totalInvested += addedChips;
    actualAmount = player.currentBet;

    const raiseDiff = player.currentBet - currentHighBet;
    minRaise = Math.max(state.bigBlind, raiseDiff);
    currentHighBet = player.currentBet;

    if (player.chips === 0) player.isAllIn = true;
    player.lastAction = player.isAllIn ? `All-in ${player.currentBet}` : `${actionType === 'bet' ? 'Bet' : 'Raise'} ${player.currentBet}`;
    actualAction = player.isAllIn ? 'allin' : (actionType as ActionLog['action']);
  }

  players[seatIndex] = player;
  const pot = players.reduce((sum, p) => sum + p.totalInvested, 0);

  actionLogs.push({
    seatIndex,
    playerName: player.name,
    position: player.position,
    action: actualAction,
    amount: actualAmount,
    street: state.street,
    timestamp: Date.now()
  });

  const nextState: TableState = {
    ...state,
    players,
    pot,
    currentHighBet,
    minRaise,
    actionLogs
  };

  return advanceTurnOrStreet(nextState);
}

function advanceTurnOrStreet(state: TableState): TableState {
  const activePlayers = state.players.filter(p => !p.isFolded);
  
  if (activePlayers.length === 1) {
    const winner = activePlayers[0];
    winner.chips += state.pot;

    // Deal out all remaining community cards from the deck as phantom cards
    // so players can see what would have been dealt if the hand continued!
    const remainingDeck = [...state.deck];
    const alreadyDealt = state.communityCards.length;
    const phantomCommunityCards = [...state.communityCards];

    // Deal enough cards to complete the full 5-card board
    if (alreadyDealt < 5) {
      const needed = 5 - alreadyDealt;
      for (let n = 0; n < needed && remainingDeck.length > 0; n++) {
        phantomCommunityCards.push(remainingDeck.pop()!);
      }
    }

    return {
      ...state,
      street: 'showdown',
      phantomCommunityCards,
      winners: [{ seatIndex: winner.seatIndex, name: winner.isHuman ? 'You' : winner.position, amount: state.pot }]
    };
  }

  let nextSeat = (state.activeSeat + 1) % state.playerCount;
  let checksCounter = 0;

  while (
    (state.players[nextSeat].isFolded || state.players[nextSeat].isAllIn) &&
    checksCounter < state.playerCount
  ) {
    nextSeat = (nextSeat + 1) % state.playerCount;
    checksCounter++;
  }

  const eligibleToAct = state.players.filter(p => !p.isFolded && !p.isAllIn);

  // If nobody can act (all folded or all-in) run out the board immediately
  if (eligibleToAct.length === 0) {
    return advanceStreet(state);
  }

  // All remaining eligible players have acted and matched the current bet
  const roundComplete = eligibleToAct.every(
    p => p.currentBet === state.currentHighBet && p.lastAction !== undefined
  );
  if (roundComplete) {
    return advanceStreet(state);
  }

  return {
    ...state,
    activeSeat: nextSeat
  };
}

function advanceStreet(state: TableState): TableState {
  const deck = [...state.deck];
  const communityCards = [...state.communityCards];

  const players = state.players.map(p => ({
    ...p,
    currentBet: 0,
    lastAction: p.isFolded ? 'Fold' : p.isAllIn ? 'All-in' : undefined
  }));

  let nextStreet: BettingStreet = 'flop';

  if (state.street === 'preflop') {
    nextStreet = 'flop';
    communityCards.push(deck.pop()!, deck.pop()!, deck.pop()!);
  } else if (state.street === 'flop') {
    nextStreet = 'turn';
    communityCards.push(deck.pop()!);
  } else if (state.street === 'turn') {
    nextStreet = 'river';
    communityCards.push(deck.pop()!);
  } else if (state.street === 'river') {
    nextStreet = 'showdown';
    return evaluateShowdown({ ...state, communityCards, players, street: 'showdown' });
  }

  let firstActor = (state.dealerSeat + 1) % state.playerCount;
  let counter = 0;
  while ((players[firstActor].isFolded || players[firstActor].isAllIn) && counter < state.playerCount) {
    firstActor = (firstActor + 1) % state.playerCount;
    counter++;
  }

  const nonFoldedNonAllin = players.filter(p => !p.isFolded && !p.isAllIn);
  if (nonFoldedNonAllin.length <= 1) {
    const intermediateState: TableState = {
      ...state,
      deck,
      communityCards,
      players,
      street: nextStreet,
      currentHighBet: 0,
      minRaise: state.bigBlind,
      activeSeat: firstActor
    };
    return advanceStreet(intermediateState);
  }

  return {
    ...state,
    deck,
    communityCards,
    players,
    street: nextStreet,
    currentHighBet: 0,
    minRaise: state.bigBlind,
    activeSeat: firstActor
  };
}

function evaluateShowdown(state: TableState): TableState {
  const active = state.players.filter(p => !p.isFolded);
  const evaluations = active.map(p => {
    const full7 = [...p.holeCards, ...state.communityCards];
    const evalResult = evaluate7Cards(full7);
    return {
      seatIndex: p.seatIndex,
      name: p.name,
      evalResult
    };
  });

  evaluations.sort((a, b) => a.evalResult.score - b.evalResult.score);
  const topScore = evaluations[0].evalResult.score;
  const winners = evaluations.filter(e => e.evalResult.score === topScore);

  const rawSplit = Math.floor(state.pot / winners.length);
  const remainder = state.pot - rawSplit * winners.length;
  const players = [...state.players];

  const winnersList = winners.map((w, idx) => {
    const payout = idx === 0 ? rawSplit + remainder : rawSplit;
    players[w.seatIndex].chips += payout;
    const p = players[w.seatIndex];
    return {
      seatIndex: w.seatIndex,
      name: p.isHuman ? 'You' : p.position,
      amount: payout,
      evaluation: w.evalResult
    };
  });

  return {
    ...state,
    players,
    street: 'showdown',
    winners: winnersList
  };
}
