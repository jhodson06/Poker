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

export function startNewHand(state: TableState, forcedHeroCards?: [Card, Card] | null): TableState {
  let deck = shuffleDeck(createDeck());

  if (forcedHeroCards && forcedHeroCards.length === 2) {
    const f1 = forcedHeroCards[0];
    const f2 = forcedHeroCards[1];
    deck = deck.filter(c => !(c.rank === f1.rank && c.suit === f1.suit));
    deck = deck.filter(c => !(c.rank === f2.rank && c.suit === f2.suit));
  }

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

  const heroSeat = state.players.findIndex(p => p.isHuman);

  // Deal hole cards (2 per player)
  for (let round = 0; round < 2; round++) {
    for (let i = 0; i < state.playerCount; i++) {
      if (i === heroSeat && forcedHeroCards && forcedHeroCards.length === 2) {
        players[i].holeCards.push(forcedHeroCards[round]);
      } else {
        const card = deck.pop()!;
        players[i].holeCards.push(card);
      }
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
    const rawTarget = Math.max(raiseAmount, currentHighBet + minRaise);
    const targetBet = Math.round(rawTarget);
    const addedChips = Math.min(player.chips, Math.max(0, targetBet - player.currentBet));
    
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
    const players = state.players.map(p => ({ ...p }));
    const winnerState = players.find(p => p.seatIndex === winner.seatIndex)!;
    winnerState.chips += state.pot;

    const remainingDeck = [...state.deck];
    const alreadyDealt = state.communityCards.length;
    const phantomCommunityCards = [...state.communityCards];

    if (alreadyDealt < 5) {
      const needed = 5 - alreadyDealt;
      for (let n = 0; n < needed && remainingDeck.length > 0; n++) {
        phantomCommunityCards.push(remainingDeck.pop()!);
      }
    }

    return {
      ...state,
      pot: 0,
      players,
      street: 'showdown',
      phantomCommunityCards,
      winners: [{
        seatIndex: winnerState.seatIndex,
        name: winnerState.isHuman ? 'You' : winnerState.position,
        amount: state.pot
      }]
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

interface SidePotTier {
  capAmount: number;
  potChips: number;
  eligibleSeatIndices: number[];
}

function calculateSidePots(players: PlayerState[]): SidePotTier[] {
  const investedLevels = Array.from(
    new Set(players.map(p => p.totalInvested).filter(amt => amt > 0))
  ).sort((a, b) => a - b);

  const sidePots: SidePotTier[] = [];
  let prevCap = 0;

  for (const cap of investedLevels) {
    const tierContribution = cap - prevCap;
    let tierChips = 0;
    const eligibleSeatIndices: number[] = [];

    players.forEach(p => {
      if (p.totalInvested > prevCap) {
        const contribution = Math.min(p.totalInvested - prevCap, tierContribution);
        tierChips += contribution;
        if (!p.isFolded) {
          eligibleSeatIndices.push(p.seatIndex);
        }
      }
    });

    if (tierChips > 0 && eligibleSeatIndices.length > 0) {
      sidePots.push({
        capAmount: cap,
        potChips: tierChips,
        eligibleSeatIndices
      });
    }

    prevCap = cap;
  }

  return sidePots;
}

function evaluateShowdown(state: TableState): TableState {
  const players = state.players.map(p => ({ ...p }));
  const evalMap = new Map<number, HandEvaluation>();

  players.forEach(p => {
    if (!p.isFolded && p.holeCards.length === 2) {
      evalMap.set(p.seatIndex, evaluate7Cards([...p.holeCards, ...state.communityCards]));
    }
  });

  const sidePots = calculateSidePots(state.players);
  const netPayouts = new Map<number, number>();
  const winnerEvaluations = new Map<number, HandEvaluation>();

  sidePots.forEach(tier => {
    let bestScore = Infinity;
    tier.eligibleSeatIndices.forEach(seatIdx => {
      const ev = evalMap.get(seatIdx);
      if (ev && ev.score < bestScore) {
        bestScore = ev.score;
      }
    });

    const tierWinners = tier.eligibleSeatIndices.filter(seatIdx => {
      const ev = evalMap.get(seatIdx);
      return ev && ev.score === bestScore;
    });

    if (tierWinners.length > 0) {
      const splitAmount = Math.floor(tier.potChips / tierWinners.length);
      const remainder = tier.potChips - splitAmount * tierWinners.length;

      // Sort tied winners out-of-position relative to dealer seat (odd chip goes to first player OOP)
      tierWinners.sort((a, b) => {
        const posA = (a - state.dealerSeat + state.playerCount) % state.playerCount;
        const posB = (b - state.dealerSeat + state.playerCount) % state.playerCount;
        return posA - posB;
      });

      tierWinners.forEach((seatIdx, idx) => {
        const payout = idx === 0 ? splitAmount + remainder : splitAmount;
        netPayouts.set(seatIdx, (netPayouts.get(seatIdx) || 0) + payout);
        if (evalMap.has(seatIdx)) {
          winnerEvaluations.set(seatIdx, evalMap.get(seatIdx)!);
        }
      });
    }
  });

  const winnersList: { seatIndex: number; name: string; amount: number; evaluation?: HandEvaluation }[] = [];

  netPayouts.forEach((amount, seatIdx) => {
    players[seatIdx].chips += amount;
    const p = players[seatIdx];

    winnersList.push({
      seatIndex: seatIdx,
      name: p.isHuman ? 'You' : p.position,
      amount: amount / state.bigBlind,
      evaluation: winnerEvaluations.get(seatIdx)
    });
  });

  return {
    ...state,
    pot: 0,
    players,
    street: 'showdown',
    winners: winnersList
  };
}
