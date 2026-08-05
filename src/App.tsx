import React, { useState, useEffect, useRef, useCallback } from 'react';
import confetti from 'canvas-confetti';
import {
  TableState,
  createInitialTableState,
  startNewHand,
  executePlayerAction,
  BettingStreet,
  StackResetMode
} from './engine/stateMachine';
import { sampleOpponentAiAction } from './gto/opponentAi';
import { getGtoStrategyForState, GtoNodeStrategy } from './gto/strategyDatabase';
import { evaluateUserDecision, DecisionGrading } from './pedagogy/evCalculator';
import { SessionStats, createInitialSessionStats, recordDecision, recordHandCompleted } from './pedagogy/gtoScoreEngine';

import { parseCard, Card } from './engine/card';
import { evaluate7Cards } from './engine/evaluator';
import { calculateTableEquities } from './engine/equityCalculator';
import { LiveHudDashboard } from './components/LiveHudDashboard';
import { PokerTableCanvas } from './components/PokerTableCanvas';
import { ActionControls } from './components/ActionControls';
import { FeedbackOverlay } from './components/FeedbackOverlay';
import { SolutionBrowser } from './components/SolutionBrowser';
import { SettingsModal } from './components/SettingsModal';
import { SandboxModal } from './components/SandboxModal';
import { LeakReportModal } from './components/LeakReportModal';
import { generateLeakReport, DrillRecommendation } from './pedagogy/leakDetector';
import { MainMenu } from './components/MainMenu';
import { detectBoardTexture } from './engine/betAbstraction';
import { Download } from 'lucide-react';

// ---------------------------------------------------------------------------
// Diagnostic Logging Types
// ---------------------------------------------------------------------------
interface ActionLogEntry {
  timestamp: string;
  street: string;
  actor: string;
  position: string;
  isHero: boolean;
  action: string;
  amount: number;
  potBefore: number;
  potAfter: number;
  heroHoleCards: string;
  communityCards: string;
  phantomCommunityCards: string;
  playerStates: string;
  loggedEquity?: string;
  gtoStrategy?: string;
  gtoGrading?: string;
}

interface HandRecord {
  handNumber: number;
  startedAt: string;
  playerCount: number;
  bigBlind: number;
  difficultyMode: string;
  cheatGodMode: boolean;
  cheatEquityOverlays: boolean;
  cheatForcedCards: string;
  isStrictStrategy: boolean;
  players: string;
  actions: ActionLogEntry[];
  result: string;
  finalCommunityCards: string;
  phantomCommunityCards: string;
  finalShowdownEquities?: string;
  potAtShowdown: number;
}

function serializeCard(c: { rank: string; suit: string }) {
  return `${c.rank}${c.suit.toUpperCase()}`;
}

function serializeCards(cards: { rank: string; suit: string }[]) {
  return cards.length ? cards.map(serializeCard).join(' ') : '(none)';
}

function formatHandRecord(hand: HandRecord): string {
  const lines: string[] = [
    `================================================================================`,
    `HAND #${hand.handNumber}  |  Started: ${hand.startedAt}`,
    `Mode: ${hand.difficultyMode.toUpperCase()}  |  Players: ${hand.playerCount}  |  Big Blind: ${hand.bigBlind} BB`,
    `PRACTICE & CHEAT SETTINGS:`,
    `  - God Mode (Reveal Cards): ${hand.cheatGodMode ? 'ACTIVE (ON)' : 'OFF'}`,
    `  - Live Equity Overlays:    ${hand.cheatEquityOverlays ? 'ACTIVE (ON)' : 'OFF'}`,
    `  - Forced Hero Cards:       ${hand.cheatForcedCards}`,
    `  - Strict Strategy Mode:    ${hand.isStrictStrategy ? 'ACTIVE (Within 10% of Best)' : 'OFF (Standard Mix)'}`,
    `--------------------------------------------------------------------------------`,
    `PLAYER STARTING SEATS & HOLE CARDS:`,
    `${hand.players}`,
    `--------------------------------------------------------------------------------`,
    `ACTION HISTORY (${hand.actions.length} ACTIONS RECORDED):`,
  ];

  if (hand.actions.length === 0) {
    lines.push(`  (No actions recorded)`);
  } else {
    hand.actions.forEach((a, i) => {
      lines.push(`  [${i + 1}] ${a.timestamp} | ${a.street.toUpperCase()} | ${a.actor} (${a.position})${a.isHero ? ' [HERO]' : ''}`);
      lines.push(`       Action:   ${a.action.toUpperCase()}${a.amount > 0 ? ' ' + a.amount + ' BB' : ''}`);
      lines.push(`       Pot:      ${a.potBefore} BB → ${a.potAfter} BB`);
      lines.push(`       Hero:     ${a.heroHoleCards}  |  Board: ${a.communityCards}`);
      if (a.phantomCommunityCards !== '(none)') {
        lines.push(`       Phantom:  ${a.phantomCommunityCards}`);
      }
      if (a.loggedEquity) {
        lines.push(`       Equity:   ${a.loggedEquity}`);
      }
      lines.push(`       Players:  ${a.playerStates}`);
      if (a.gtoStrategy) lines.push(`       GTO Node: ${a.gtoStrategy}`);
      if (a.gtoGrading) lines.push(`       GTO Grade: ${a.gtoGrading}`);
      lines.push('');
    });
  }

  lines.push(`--------------------------------------------------------------------------------`);
  lines.push(`SHOWDOWN & END OF HAND SUMMARY:`);
  lines.push(`Result:                  ${hand.result}`);
  lines.push(`Dealt Community Cards:   ${hand.finalCommunityCards}`);
  if (hand.phantomCommunityCards !== '(none)') {
    lines.push(`Phantom Board (undealt): ${hand.phantomCommunityCards}`);
  }
  if (hand.finalShowdownEquities) {
    lines.push(`Showdown Final Equities: ${hand.finalShowdownEquities}`);
  }
  lines.push(`Pot at Showdown:        ${hand.potAtShowdown} BB`);
  lines.push(`================================================================================\n`);
  return lines.join('\n');
}

function downloadTxt(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const App: React.FC = () => {
  const [playerCount, setPlayerCount] = useState<number>(6);
  const [difficultyMode, setDifficultyMode] = useState<'simple' | 'standard'>('simple');
  const [startingStackBB, setStartingStackBB] = useState<number>(100);
  const [stackResetMode, setStackResetMode] = useState<StackResetMode>('persistent');
  const [isStrictStrategy, setIsStrictStrategy] = useState<boolean>(false);

  const [tableState, setTableState] = useState<TableState>(() =>
    startNewHand(createInitialTableState(6, 100, 'persistent'))
  );
  const [sessionStats, setSessionStats] = useState<SessionStats>(createInitialSessionStats);

  const [isStreetTransitioning, setIsStreetTransitioning] = useState<boolean>(false);
  const prevStreetRef = useRef<BettingStreet>(tableState.street);
  const hasCelebratedWinRef = useRef<boolean>(false);

  const [activeGrading, setActiveGrading] = useState<DecisionGrading | null>(null);
  const [activeStrategy, setActiveStrategy] = useState<GtoNodeStrategy | null>(null);

  const [isSolutionBrowserOpen, setIsSolutionBrowserOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [appMode, setAppMode] = useState<'menu' | 'full_game'>('menu');
  const [isSandboxOpen, setIsSandboxOpen] = useState<boolean>(false);
  const [isLeakReportOpen, setIsLeakReportOpen] = useState<boolean>(false);

  // Practice Mode Cheat Tools
  const [revealAllCards, setRevealAllCards] = useState<boolean>(false);
  const [showEquityOverlays, setShowEquityOverlays] = useState<boolean>(false);
  const [forcedHeroCards, setForcedHeroCards] = useState<[string, string] | null>(null);

  // Diagnostic log refs
  const handNumberRef = useRef<number>(0);
  const currentHandRef = useRef<HandRecord | null>(null);
  const allHandLogsRef = useRef<HandRecord[]>([]);
  const sessionStartRef = useRef<string>(new Date().toISOString());

  const aiTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Track Street Transitions to provide smooth card deal pauses
  useEffect(() => {
    if (prevStreetRef.current !== tableState.street && tableState.street !== 'preflop') {
      setIsStreetTransitioning(true);
      const timer = setTimeout(() => {
        setIsStreetTransitioning(false);
      }, 650);
      prevStreetRef.current = tableState.street;
      return () => clearTimeout(timer);
    }
    prevStreetRef.current = tableState.street;
  }, [tableState.street]);

  // Trigger Confetti ONLY when Hero wins the hand!
  useEffect(() => {
    if (tableState.street === 'showdown' && tableState.winners && tableState.winners.length > 0) {
      const heroSeat = tableState.players.findIndex(p => p.isHuman);
      const isHeroWinner = tableState.winners.some(w => w.seatIndex === heroSeat);

      if (isHeroWinner && !hasCelebratedWinRef.current) {
        hasCelebratedWinRef.current = true;
        confetti({ particleCount: 100, spread: 80, origin: { y: 0.6 } });
      }
    } else if (tableState.street !== 'showdown') {
      hasCelebratedWinRef.current = false;
    }
  }, [tableState.street, tableState.winners, tableState.players]);

  // ---------------------------------------------------------------------------
  // Logging helpers
  // ---------------------------------------------------------------------------
  const initCurrentHand = useCallback((state: TableState) => {
    const handNum = allHandLogsRef.current.length + 1;
    handNumberRef.current = handNum;
    currentHandRef.current = {
      handNumber: handNum,
      startedAt: new Date().toISOString(),
      playerCount: state.playerCount,
      bigBlind: state.bigBlind,
      difficultyMode,
      cheatGodMode: revealAllCards,
      cheatEquityOverlays: showEquityOverlays,
      cheatForcedCards: forcedHeroCards ? forcedHeroCards.join(' ') : 'None',
      isStrictStrategy,
      players: state.players.map(p =>
        `\n  - ${p.isHuman ? 'Hero (You)' : p.name} (${p.position})${p.isHuman ? ' [HERO]' : ''}: ${(p.chips / state.bigBlind).toFixed(1).replace('.0', '')} BB | Hole: ${serializeCards(p.holeCards)}`
      ).join(''),
      actions: [],
      result: 'In Progress',
      finalCommunityCards: '(none)',
      phantomCommunityCards: '(none)',
      potAtShowdown: 0,
    };
  }, [difficultyMode, revealAllCards, showEquityOverlays, forcedHeroCards, isStrictStrategy]);

  const appendActionLog = useCallback((
    state: TableState,
    actor: { name: string; position: string; isHuman: boolean },
    action: string,
    amount: number,
    potAfter: number,
    gtoStrategy?: GtoNodeStrategy,
    gtoGrading?: DecisionGrading
  ) => {
    if (!currentHandRef.current) return;

    // Deduplication check: prevent duplicate logs for identical action/actor/street/pot
    const actions = currentHandRef.current.actions;
    const lastAction = actions[actions.length - 1];
    if (
      lastAction &&
      lastAction.street === state.street &&
      lastAction.actor === actor.name &&
      lastAction.action === action &&
      lastAction.amount === amount &&
      lastAction.potBefore === state.pot
    ) {
      return;
    }

    const hero = state.players.find(p => p.isHuman);

    // Compute Logged Seat Equities for Action History Log using normalized calculateTableEquities
    let loggedEquity = '';
    const activePlayers = state.players.filter(p => !p.isFolded && p.holeCards.length === 2);
    if (activePlayers.length > 0) {
      const eqMap = calculateTableEquities(state);
      if (revealAllCards) {
        loggedEquity = activePlayers.map(p => {
          const eqVal = eqMap.get(p.seatIndex) || 0;
          return `${p.isHuman ? 'Hero' : p.position}: ${eqVal}% EQ`;
        }).join(' | ');
      } else if (hero && !hero.isFolded && hero.holeCards.length === 2) {
        const eqVal = eqMap.get(hero.seatIndex) || 0;
        loggedEquity = `Hero: ${eqVal}% EQ`;
      }
    }

    const entry: ActionLogEntry = {
      timestamp: new Date().toISOString(),
      street: state.street,
      actor: actor.name,
      position: actor.position,
      isHero: actor.isHuman,
      action,
      amount,
      potBefore: state.pot,
      potAfter,
      heroHoleCards: hero ? serializeCards(hero.holeCards) : '??',
      communityCards: serializeCards(state.communityCards),
      phantomCommunityCards: serializeCards(state.phantomCommunityCards || []),
      playerStates: state.players.map(p =>
        `${p.name}:${(p.chips / state.bigBlind).toFixed(1).replace('.0', '')}BB${p.isFolded ? '(F)' : p.isAllIn ? '(AI)' : ''}`
      ).join(' '),
      loggedEquity,
      gtoStrategy: gtoStrategy ? `[${gtoStrategy.nodeId}] Optimal: ${gtoStrategy.optimalAction.label} (${(gtoStrategy.optimalAction.frequency * 100).toFixed(0)}% freq, EV:${gtoStrategy.optimalAction.ev.toFixed(1)} BB) | Freqs: ${gtoStrategy.frequencies.map(f => `${f.label}=${(f.frequency * 100).toFixed(0)}%`).join(', ')}` : undefined,
      gtoGrading: gtoGrading ? `[${gtoGrading.grade}] ${gtoGrading.userActionLabel} | EV loss: ${gtoGrading.evLoss.toFixed(2)} BB | ${gtoGrading.explanation}` : undefined,
    };
    currentHandRef.current.actions.push(entry);
  }, [revealAllCards]);

  const getCurrentHandRecord = useCallback((state: TableState): HandRecord => {
    if (!currentHandRef.current) {
      initCurrentHand(state);
    }
    const hand = { ...currentHandRef.current! };
    if (state.street === 'showdown') {
      const resultStr = state.winners && state.winners.length > 0
        ? state.winners.map(w => {
          const p = state.players[w.seatIndex];
          const isHero = p?.isHuman || w.name === 'You';
          const nameStr = p ? (p.isHuman ? 'You' : p.position) : w.name;
          const verb = isHero ? 'win' : 'wins';
          return `${nameStr} ${verb} ${w.amount} BB${w.evaluation ? ` (${w.evaluation.description})` : ''}`;
        }).join(' | ')
        : 'Uncontested';
      hand.result = resultStr;
      hand.finalCommunityCards = serializeCards(state.communityCards);

      const dealtCount = state.communityCards ? state.communityCards.length : 0;
      const phantomAll = state.phantomCommunityCards || [];
      const undealtOnly = phantomAll.slice(dealtCount);
      hand.phantomCommunityCards = serializeCards(undealtOnly);
      hand.potAtShowdown = state.pot;

      const finalEqMap = calculateTableEquities(state);
      const activeAtShowdown = state.players.filter(p => !p.isFolded && p.holeCards.length === 2);
      if (activeAtShowdown.length > 0) {
        hand.finalShowdownEquities = activeAtShowdown.map(p => {
          const eqVal = finalEqMap.get(p.seatIndex) || 0;
          return `${p.isHuman ? 'Hero (You)' : p.position}: ${eqVal}% EQ`;
        }).join(' | ');
      }
    }
    return hand;
  }, [initCurrentHand]);

  const finalizeHandLog = useCallback((state: TableState) => {
    if (!currentHandRef.current) return;
    const hand = getCurrentHandRecord(state);
    if (!allHandLogsRef.current.some(h => h.handNumber === hand.handNumber)) {
      allHandLogsRef.current.push(hand);
    }
  }, [getCurrentHandRecord]);

  const handleDownloadCurrentHand = useCallback(() => {
    const hand = getCurrentHandRecord(tableState);
    const randomId = Math.random().toString(36).substring(2, 7);
    const header = [
      `================================================================================`,
      `POKER TRAINER — CURRENT ROUND DIAGNOSTIC LOG`,
      `Session Started: ${sessionStartRef.current}`,
      `Downloaded:      ${new Date().toISOString()}`,
      `Log ID:          ${randomId}`,
      `================================================================================\n\n`
    ].join('\n');
    downloadTxt(`PokerTrainer_Hand_${hand.handNumber}_Log_${randomId}.txt`, header + formatHandRecord(hand));
  }, [getCurrentHandRecord, tableState]);

  const handleDownloadSessionLog = useCallback(() => {
    const completed = [...allHandLogsRef.current];
    const current = getCurrentHandRecord(tableState);
    if (!completed.some(h => h.handNumber === current.handNumber)) {
      completed.push(current);
    }
    const randomId = Math.random().toString(36).substring(2, 7);
    const header = [
      `================================================================================`,
      `POKER TRAINER — FULL SESSION DIAGNOSTIC LOGS`,
      `Session Started: ${sessionStartRef.current}`,
      `Downloaded:      ${new Date().toISOString()}`,
      `Log ID:          ${randomId}`,
      `Total Hands:     ${completed.length}`,
      `Difficulty:      ${difficultyMode.toUpperCase()} | Players: ${playerCount} | Stack: ${startingStackBB} BB`,
      `================================================================================\n\n`
    ].join('\n');
    const body = completed.map(formatHandRecord).join('\n\n');
    downloadTxt(`PokerTrainer_FullSession_Log_${randomId}.txt`, header + body);
  }, [getCurrentHandRecord, tableState, difficultyMode, playerCount, startingStackBB]);

  // Initialize first hand log
  useEffect(() => { initCurrentHand(tableState); }, []); // eslint-disable-line

  // Finalize log when hand reaches showdown
  useEffect(() => {
    if (tableState.street === 'showdown') {
      finalizeHandLog(tableState);
    }
  }, [tableState.street, tableState.winners, finalizeHandLog]);

  // Handle Opponent AI Turn Loop
  useEffect(() => {
    if (tableState.street === 'showdown' || isStreetTransitioning) return;

    const heroSeat = tableState.players.findIndex(p => p.isHuman);
    const isAiTurn = tableState.activeSeat !== heroSeat;

    if (isAiTurn) {
      aiTimerRef.current = setTimeout(() => {
        const aiDecision = sampleOpponentAiAction(tableState, difficultyMode, isStrictStrategy);
        const next = executePlayerAction(tableState, aiDecision.seatIndex, aiDecision.action, aiDecision.amount);
        appendActionLog(
          tableState,
          { name: tableState.players[aiDecision.seatIndex]?.name || 'AI', position: tableState.players[aiDecision.seatIndex]?.position || 'SB', isHuman: false },
          aiDecision.action,
          aiDecision.amount,
          next.pot
        );
        setTableState(next);
      }, 600);
    }

    return () => {
      if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    };
  }, [tableState, isStreetTransitioning, appendActionLog]);

  // Handle Hero Action Execution
  const handleHeroAction = (
    actionType: 'fold' | 'check' | 'call' | 'bet' | 'raise',
    amount: number = 0
  ) => {
    const heroSeat = tableState.players.findIndex(p => p.isHuman);
    const hero = tableState.players[heroSeat];
    if (!hero || hero.holeCards.length < 2) return;

    // 1. Get GTO Strategy Node
    const strategyNode = getGtoStrategyForState(
      hero.holeCards[0],
      hero.holeCards[1],
      hero.position,
      tableState.street,
      tableState.currentHighBet,
      tableState.pot,
      tableState.bigBlind,
      tableState.communityCards,
      tableState.raiseCount
    );

    // 2. Compute hero equity for accurate All-In Call EV formula (postflop only)
    let heroEquity: number | undefined;
    if (tableState.street !== 'preflop' && actionType === 'call' && tableState.communityCards.length >= 3) {
      const eqMap = calculateTableEquities(tableState);
      const heroEqVal = eqMap.get(heroSeat);
      heroEquity = heroEqVal !== undefined ? heroEqVal / 100 : undefined;
    }

    const grading = evaluateUserDecision(actionType, amount, strategyNode, sessionStats, tableState.pot, difficultyMode, isStrictStrategy, tableState.bigBlind, tableState.currentHighBet, heroEquity);

    const leakContext = {
      street: tableState.street,
      position: hero.position,
      boardTexture: tableState.street === 'preflop' ? 'preflop' as const : detectBoardTexture(tableState.communityCards),
    };
    setSessionStats(prev => recordDecision(prev, grading, leakContext));

    const nextState = executePlayerAction(
      tableState,
      heroSeat,
      actionType,
      amount
    );

    setActiveGrading(grading);
    setActiveStrategy(strategyNode);
    
    hero.chips = nextState.players[heroSeat].chips; 
    
    appendActionLog(
      tableState,
      { name: 'Hero', position: hero.position, isHuman: true },
      actionType,
      amount,
      nextState.pot,
      strategyNode,
      grading
    );

    setTableState(nextState);
  };

  const handleNextHand = () => {
    setActiveGrading(null);
    setActiveStrategy(null);
    setSessionStats(prev => recordHandCompleted(prev));
    const parsedForced = forcedHeroCards
      ? ([parseCard(forcedHeroCards[0]), parseCard(forcedHeroCards[1])] as [Card, Card])
      : null;
    setTableState(prev => {
      const next = startNewHand(prev, parsedForced);
      initCurrentHand(next);
      return next;
    });
  };

  const handlePlayerCountChange = (count: number) => {
    setPlayerCount(count);
    setTableState(startNewHand(createInitialTableState(count, startingStackBB, stackResetMode)));
  };

  const handleStackBBChange = (stack: number) => {
    setStartingStackBB(stack);
    setTableState(startNewHand(createInitialTableState(playerCount, stack, stackResetMode)));
  };

  const handleStackResetModeChange = (mode: StackResetMode) => {
    setStackResetMode(mode);
    setTableState(prev => startNewHand({ ...prev, stackResetMode: mode }));
  };

  const handleResetSession = () => {
    setActiveGrading(null);
    setActiveStrategy(null);
    handNumberRef.current = 1;
    allHandLogsRef.current = [];
    currentHandRef.current = null;
    setSessionStats(createInitialSessionStats());
    setTableState(prev => {
      const next = startNewHand(prev);
      initCurrentHand(next);
      return next;
    });
  };

  if (appMode === 'menu') {
    return <MainMenu onStartFullGame={() => setAppMode('full_game')} />;
  }

  return (
    <div className="h-screen w-screen bg-slate-950 text-slate-100 flex flex-col justify-between overflow-hidden selection:bg-emerald-500 selection:text-slate-950">
      {/* Live HUD Header */}
      <div className="shrink-0">
        <LiveHudDashboard
          stats={sessionStats}
          difficultyMode={difficultyMode}
          playerCount={playerCount}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenSolutionBrowser={() => setIsSolutionBrowserOpen(true)}
          onOpenSandbox={() => setIsSandboxOpen(true)}
          onOpenLeakReport={() => setIsLeakReportOpen(true)}
          onResetSession={handleResetSession}
        />
      </div>

      {/* Main Gameplay Table Canvas */}
      <main className="flex-1 min-h-0 w-full max-w-[1800px] mx-auto p-2 sm:p-3 flex items-center justify-center overflow-hidden">
        <PokerTableCanvas
          tableState={tableState}
          revealAllCards={revealAllCards}
          showEquityOverlays={showEquityOverlays}
        />
      </main>

      {/* Hero Action Controls */}
      <div className="shrink-0 w-full p-2 sm:pb-3">
        <ActionControls
          tableState={tableState}
          difficultyMode={difficultyMode}
          isTransitioning={isStreetTransitioning}
          onAction={handleHeroAction}
          onNextHand={handleNextHand}
        />
      </div>

      {/* Post-Hand Download Log Buttons — available at showdown */}
      {tableState.street === 'showdown' && (
        <div className="fixed right-4 top-1/2 -translate-y-1/2 flex flex-col gap-3 z-40">
          <button
            onClick={handleDownloadCurrentHand}
            title="Download full diagnostic text log for this finished hand"
            className="btn-log-download-emerald flex items-center gap-2.5 px-4 py-3 rounded-xl bg-slate-900/90 border border-emerald-500/50 text-emerald-400 text-xs font-black tracking-wide shadow-2xl backdrop-blur-md"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span>DOWNLOAD CURRENT ROUND LOGS</span>
          </button>
          <button
            onClick={handleDownloadSessionLog}
            title="Download full diagnostic text log for all hands played in this session"
            className="btn-log-download-cyan flex items-center gap-2.5 px-4 py-3 rounded-xl bg-slate-900/90 border border-cyan-500/50 text-cyan-400 text-xs font-black tracking-wide shadow-2xl backdrop-blur-md"
          >
            <Download className="w-4 h-4 text-cyan-400" />
            <span>DOWNLOAD FULL SESSION LOGS</span>
          </button>
        </div>
      )}

      {/* Decision Rating Overlay */}
      {activeGrading && activeStrategy && (
        <FeedbackOverlay
          grading={activeGrading}
          strategy={activeStrategy}
          difficultyMode={difficultyMode}
          heroStack={tableState.players.find(p => p.isHuman)?.chips}
          potAfterBet={tableState.pot}
          onDismiss={() => setActiveGrading(null)}
        />
      )}

      {/* Practice Mode Sandbox & Cheat Menu Modal */}
      {isSandboxOpen && (
        <SandboxModal
          revealAllCards={revealAllCards}
          showEquityOverlays={showEquityOverlays}
          forcedHeroCards={forcedHeroCards}
          onToggleRevealCards={setRevealAllCards}
          onToggleEquityOverlays={setShowEquityOverlays}
          onSetForcedHeroCards={setForcedHeroCards}
          onClose={() => setIsSandboxOpen(false)}
        />
      )}

      {/* Leak Detection Report Modal */}
      {isLeakReportOpen && (
        <LeakReportModal
          report={generateLeakReport(sessionStats.leakRecords)}
          onClose={() => setIsLeakReportOpen(false)}
          onApplyDrill={(drill: DrillRecommendation) => {
            // Apply drill settings to Sandbox
            if (drill.suggestedPosition) {
              // TODO: A more robust way to set position would be needed here, 
              // but for now Sandbox doesn't natively force hero position (it forces cards).
              // Setting cards could happen here.
            }
            setIsSandboxOpen(true);
          }}
        />
      )}

      {/* 13x13 GTO Solution Browser Modal */}
      {isSolutionBrowserOpen && (
        <SolutionBrowser
          tableState={tableState}
          onClose={() => setIsSolutionBrowserOpen(false)}
        />
      )}

      {/* Settings Options Modal */}
      {isSettingsOpen && (
        <SettingsModal
          playerCount={playerCount}
          difficultyMode={difficultyMode}
          startingStackBB={startingStackBB}
          stackResetMode={stackResetMode}
          isStrictStrategy={isStrictStrategy}
          onChangePlayerCount={handlePlayerCountChange}
          onChangeDifficultyMode={setDifficultyMode}
          onChangeStackBB={handleStackBBChange}
          onChangeStackResetMode={handleStackResetModeChange}
          onChangeStrictStrategy={setIsStrictStrategy}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}
    </div>
  );
};

export default App;
