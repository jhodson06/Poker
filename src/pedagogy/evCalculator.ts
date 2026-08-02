import { ActionFrequency, GtoNodeStrategy } from '../gto/strategyDatabase';
import { SessionStats } from './gtoScoreEngine';

export type GradeClassification = 'Correct' | 'Inaccuracy' | 'Mistake' | 'Blunder';

export interface DecisionGrading {
  userActionLabel: string;
  userActionFreq: number; // 0.0 to 1.0
  userEv: number;
  optimalEv: number;
  evLoss: number; // EV_Optimal - EV_User
  grade: GradeClassification;
  colorHex: string;
  badgeBgClass: string;
  badgeTextClass: string;
  explanation: string;
  optimalActionLabel: string;
}

export const GTO_MIXED_STRATEGY_THRESHOLD = 0.05; // 5.0%
export const ALWAYS_CORRECT_FREQUENCY_THRESHOLD = 0.25; // 25.0%
export const MIN_HANDS_FOR_OVERUSE_PENALTY = 10; // Minimum 10 hands before 2x overuse penalty applies

export function evaluateUserDecision(
  userAction: 'fold' | 'check' | 'call' | 'bet' | 'raise',
  raiseAmount: number,
  strategy: GtoNodeStrategy,
  sessionStats?: SessionStats,
  potSize?: number,
  mode?: 'simple' | 'grouped' | 'standard'
): DecisionGrading {
  const freqs = strategy.frequencies;
  const optimalAction = strategy.optimalAction;

  // Match user action to strategy frequency bucket
  let userFreqItem: ActionFrequency | undefined;

  if (userAction === 'fold') {
    userFreqItem = freqs.find(f => f.action === 'fold');
  } else if (userAction === 'check') {
    userFreqItem = freqs.find(f => f.action === 'check');
  } else if (userAction === 'call') {
    userFreqItem = freqs.find(f => f.action === 'call');
  } else if (userAction === 'bet' || userAction === 'raise') {
    if (mode === 'standard' && potSize && potSize > 0) {
      // Standard mode: match bet size to the closest GTO sizing bucket
      const betFraction = raiseAmount / potSize;

      if (betFraction >= 1.1) {
        // Overbet (>110% pot) — look for allin first, then bet_75, then raise
        userFreqItem =
          freqs.find(f => f.action === 'allin') ||
          freqs.find(f => f.action === 'bet_75') ||
          freqs.find(f => f.action === 'raise');
      } else if (betFraction >= 0.5) {
        // Medium-to-large bet (50-110% pot) — bet_75 bucket
        userFreqItem =
          freqs.find(f => f.action === 'bet_75') ||
          freqs.find(f => f.action === 'raise') ||
          freqs.find(f => f.action === 'allin');
      } else {
        // Small bet (<50% pot) — bet_33 bucket
        userFreqItem =
          freqs.find(f => f.action === 'bet_33') ||
          freqs.find(f => f.action === 'raise');
      }
    } else {
      // Simple / grouped mode: any bet action is valid, pick first available
      userFreqItem = freqs.find(
        f => f.action === 'bet_33' || f.action === 'bet_75' || f.action === 'raise' || f.action === 'allin'
      );
    }
  }

  // Construct precise user action representation if not explicitly in GTO matrix
  if (!userFreqItem) {
    let label = 'CHECK';
    if (userAction === 'fold') label = 'FOLD';
    if (userAction === 'call') label = 'CALL';
    if (userAction === 'bet' || userAction === 'raise') label = `BET / RAISE ${raiseAmount > 0 ? raiseAmount + ' BB' : ''}`;

    userFreqItem = {
      action: userAction as any,
      label,
      frequency: 0,
      ev: -0.5
    };
  }

  // Override label if the user clearly went all-in (bet > 2x pot) — the bucket may say 'Raise 2.5x'
  const isEffectivelyAllIn = (userAction === 'bet' || userAction === 'raise') &&
    mode === 'standard' && potSize && potSize > 0 && (raiseAmount / potSize) > 2.0;
  const effectiveUserLabel = isEffectivelyAllIn ? 'All-In' : (userFreqItem?.label ?? userAction.toUpperCase());

  const userEv = userFreqItem.ev;
  const optimalEv = optimalAction.ev;
  const rawEvLoss = Math.max(0, Number((optimalEv - userEv).toFixed(2)));
  const userFreqPercent = userFreqItem.frequency * 100;
  const optimalFreqPercent = optimalAction.frequency * 100;

  let grade: GradeClassification = 'Correct';
  let evLoss = rawEvLoss;
  let colorHex = '#10b981'; // Green
  let badgeBgClass = 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400';
  let badgeTextClass = 'text-emerald-400';
  let explanation = 'Optimal play! Action matches GTO strategy frequencies.';

  // Rule 1: High Frequency Choices (>= 25%) are ALWAYS 100% CORRECT
  if (userFreqItem.frequency >= ALWAYS_CORRECT_FREQUENCY_THRESHOLD) {
    grade = 'Correct';
    evLoss = 0.0;
    colorHex = '#10b981';
    badgeBgClass = 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400';
    badgeTextClass = 'text-emerald-400';
    explanation = `Correct play! ${userFreqItem.label} is a core GTO action (${userFreqPercent.toFixed(0)}% frequency).`;
  }
  // Rule 2: Low-Frequency Mixed Choices (5% <= freq < 25%)
  else if (userFreqItem.frequency >= GTO_MIXED_STRATEGY_THRESHOLD) {
    // Check 2x Overuse Rule after minimum 10 hands played
    const handsPlayed = sessionStats ? sessionStats.handsPlayed : 0;
    const sessionDecisions = sessionStats ? Math.max(1, sessionStats.totalDecisions + 1) : 1;
    const sessionUsageRatio = sessionStats ? (sessionStats.lowFreqCount + 1) / sessionDecisions : 0;

    const maxAllowedRatio = 2 * userFreqItem.frequency; // e.g. 2x of 8% = 16%
    const isExceeding2xThreshold = handsPlayed >= MIN_HANDS_FOR_OVERUSE_PENALTY && sessionUsageRatio > maxAllowedRatio;

    if (isExceeding2xThreshold) {
      grade = 'Inaccuracy';
      evLoss = Math.max(0.5, rawEvLoss);
      colorHex = '#f59e0b'; // Amber / Yellow
      badgeBgClass = 'bg-amber-500/20 border-amber-500/40 text-amber-400';
      badgeTextClass = 'text-amber-400';
      explanation = `Frequency Leak (>2x Odds Over-Use): ${userFreqItem.label} has ${userFreqPercent.toFixed(0)}% GTO odds, but your session usage (${(sessionUsageRatio * 100).toFixed(0)}%) exceeds 2x its theoretical frequency (${(maxAllowedRatio * 100).toFixed(0)}%+). Rated Inaccuracy after ${handsPlayed} hands.`;
    } else {
      grade = 'Correct';
      evLoss = 0.0;
      colorHex = '#10b981';
      badgeBgClass = 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400';
      badgeTextClass = 'text-emerald-400';
      const isSameAction = userFreqItem.label === optimalAction.label;
      explanation = isSameAction
        ? `Mixed Strategy GTO Play: ${userFreqItem.label} is played ${userFreqPercent.toFixed(0)}% of the time as an acceptable mixed line.`
        : `Mixed Strategy GTO Play: ${userFreqItem.label} is played ${userFreqPercent.toFixed(0)}% of the time (vs highest frequency line ${optimalAction.label} ${optimalFreqPercent.toFixed(0)}%). Valid as an occasional mix.`;
    }
  }
  // Rule 3: Sub-5% or 0% Frequency Lines
  else {
    if (rawEvLoss >= 5.0) {
      grade = 'Blunder';
      colorHex = '#881337'; // Dark Red
      badgeBgClass = 'bg-rose-950/80 border-rose-700 text-rose-300';
      badgeTextClass = 'text-rose-400';
      explanation = `Critical blunder! Substantial EV loss (-${rawEvLoss} BB). The solver almost never plays ${userFreqItem.label} (${userFreqPercent.toFixed(0)}% freq).`;
    } else if (rawEvLoss >= 2.0) {
      grade = 'Mistake';
      colorHex = '#ef4444'; // Red
      badgeBgClass = 'bg-rose-500/20 border-rose-500/40 text-rose-400';
      badgeTextClass = 'text-rose-400';
      explanation = `Severe deviation! ${userFreqItem.label} sacrifices ${rawEvLoss} BB EV compared to ${optimalAction.label} (${optimalFreqPercent.toFixed(0)}%).`;
    } else {
      grade = 'Inaccuracy';
      evLoss = Math.max(0.5, rawEvLoss);
      colorHex = '#f59e0b';
      badgeBgClass = 'bg-amber-500/20 border-amber-500/40 text-amber-400';
      badgeTextClass = 'text-amber-400';
      explanation = `Suboptimal line! GTO solver plays ${userFreqItem.label} <=5% of the time (${userFreqPercent.toFixed(0)}% frequency). Recommended action is ${optimalAction.label} (${optimalFreqPercent.toFixed(0)}%).`;
    }
  }

  return {
    userActionLabel: effectiveUserLabel,
    userActionFreq: userFreqItem.frequency,
    userEv,
    optimalEv,
    evLoss,
    grade,
    colorHex,
    badgeBgClass,
    badgeTextClass,
    explanation,
    optimalActionLabel: optimalAction.label
  };
}
