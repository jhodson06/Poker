import { DecisionGrading } from './evCalculator';
import { LeakRecord } from './leakDetector';
import { BettingStreet, PlayerPosition } from '../engine/stateMachine';

export interface SessionStats {
  handsPlayed: number;
  totalDecisions: number;
  correctCount: number;
  inaccuracyCount: number;
  mistakeCount: number;
  blunderCount: number;
  totalEvLossBB: number;
  currentStreak: number;
  bestStreak: number;
  gtoScorePercent: number;
  recentGradings: DecisionGrading[];
  lowFreqCount: number;
  leakRecords: LeakRecord[];
}

export function createInitialSessionStats(): SessionStats {
  return {
    handsPlayed: 1,
    totalDecisions: 0,
    correctCount: 0,
    inaccuracyCount: 0,
    mistakeCount: 0,
    blunderCount: 0,
    totalEvLossBB: 0,
    currentStreak: 0,
    bestStreak: 0,
    gtoScorePercent: 100,
    recentGradings: [],
    lowFreqCount: 0,
    leakRecords: [],
  };
}

export function recordHandCompleted(stats: SessionStats): SessionStats {
  return {
    ...stats,
    handsPlayed: stats.handsPlayed + 1
  };
}

export function recordDecision(
  stats: SessionStats,
  grading: DecisionGrading,
  leakContext?: {
    street: BettingStreet;
    position: PlayerPosition;
    boardTexture: 'dry' | 'wet' | 'very_wet' | 'preflop';
  }
): SessionStats {
  const totalDecisions = stats.totalDecisions + 1;
  const totalEvLossBB = Number((stats.totalEvLossBB + grading.evLoss).toFixed(2));

  let correctCount = stats.correctCount;
  let inaccuracyCount = stats.inaccuracyCount;
  let mistakeCount = stats.mistakeCount;
  let blunderCount = stats.blunderCount;
  let currentStreak = stats.currentStreak;

  // Track low frequency (5% <= freq < 25%) choices
  const isLowFreq = grading.userActionFreq >= 0.05 && grading.userActionFreq < 0.25;
  const lowFreqCount = isLowFreq ? stats.lowFreqCount + 1 : stats.lowFreqCount;

  if (grading.grade === 'Correct') {
    correctCount++;
    currentStreak++;
  } else {
    currentStreak = 0;
    if (grading.grade === 'Inaccuracy') inaccuracyCount++;
    if (grading.grade === 'Mistake') mistakeCount++;
    if (grading.grade === 'Blunder') blunderCount++;
  }

  const bestStreak = Math.max(stats.bestStreak, currentStreak);

  // Compute GTO score accuracy percentage
  const totalWeightedScore = correctCount * 1.0 + inaccuracyCount * 0.6 + mistakeCount * 0.2;
  const gtoScorePercent = Math.round((totalWeightedScore / totalDecisions) * 100);

  const recentGradings = [grading, ...stats.recentGradings].slice(0, 10);

  // Build leak record if context was provided
  const newLeakRecord: LeakRecord | null = leakContext ? {
    street:       leakContext.street,
    position:     leakContext.position,
    boardTexture: leakContext.boardTexture,
    actionTaken:  grading.userMatchedAction,
    grade:        grading.grade,
    evLoss:       grading.evLoss,
    handNumber:   stats.handsPlayed,
  } : null;

  const leakRecords = newLeakRecord
    ? [...stats.leakRecords, newLeakRecord]
    : stats.leakRecords;

  return {
    ...stats,
    totalDecisions,
    correctCount,
    inaccuracyCount,
    mistakeCount,
    blunderCount,
    totalEvLossBB,
    currentStreak,
    bestStreak,
    gtoScorePercent,
    recentGradings,
    lowFreqCount,
    leakRecords,
  };
}
