import { ActionFrequency, GtoNodeStrategy } from '../gto/strategyDatabase';
import { SessionStats } from './gtoScoreEngine';
import { blendBucketsViaPHM, BetBucket } from '../engine/betAbstraction';

export type GradeClassification = 'Correct' | 'Inaccuracy' | 'Mistake' | 'Blunder';

export interface DecisionGrading {
  userActionLabel: string;
  userActionFreq: number; // 0.0 to 1.0
  userMatchedAction: string; // action bucket that was matched (e.g. 'bet_33', 'fold')
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

/**
 * All-In EV Call Formula (PDF: "GTO Bet Sizing and Action Abstraction Mechanics"):
 *   EV_call = (E × (P_pot + C)) − ((1 − E) × C)
 *
 * @param equity       Hero's equity as a fraction (0.0–1.0)
 * @param potBeforeCall Pot size BEFORE hero's call
 * @param callCost     Amount hero must call
 * @returns            EV of calling in BB-equivalent units
 */
export function computeCallEv(equity: number, potBeforeCall: number, callCost: number): number {
  if (callCost <= 0) return 0;
  const winAmount = potBeforeCall + callCost; // total pot if hero wins
  return equity * winAmount - (1 - equity) * callCost;
}

export function evaluateUserDecision(
  userAction: 'fold' | 'check' | 'call' | 'bet' | 'raise',
  raiseAmount: number,
  strategy: GtoNodeStrategy,
  sessionStats?: SessionStats,
  potSize?: number,
  mode?: 'simple' | 'standard',
  isStrictStrategy: boolean = false,
  bigBlind: number = 2,
  facingBet: number = 0,
  heroEquity?: number // 0.0–1.0 — used for improved call EV on postflop
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

    // If equity is available, override the call EV with the exact PDF formula (postflop only)
    if (
      heroEquity !== undefined &&
      strategy.street !== 'preflop' &&
      userFreqItem &&
      potSize && potSize > 0 &&
      facingBet > 0
    ) {
      const computedEv = computeCallEv(heroEquity, potSize, facingBet);
      // Clone and override EV with the precise formula result
      userFreqItem = { ...userFreqItem, ev: computedEv };
    }
  } else if (userAction === 'bet' || userAction === 'raise') {
    const isPreflop = strategy.street === 'preflop';

    if (isPreflop) {
      // Preflop: all raises mapped to 'raise' bucket regardless of sizing.
      // Pot-fraction is meaningless preflop (pot is tiny vs. any open).
      userFreqItem =
        freqs.find(f => f.action === 'raise') ||
        freqs.find(f => f.action === 'bet_75') ||
        freqs.find(f => f.action === 'allin');
    } else if (mode === 'standard' && potSize && potSize > 0) {
      // ── Standard Mode: Pseudo-Harmonic Mapping for off-tree custom bets ──
      // Build a list of postflop bet buckets from the strategy's frequencies
      const postflopBetActions = ['bet_33', 'bet_75', 'bet_overbet', 'raise', 'allin'] as const;
      const betBuckets: BetBucket[] = freqs
        .filter(f => postflopBetActions.includes(f.action as any))
        .filter(f => f.potFraction !== undefined)
        .map(f => ({
          action: f.action,
          potFraction: f.potFraction!,
          ev: f.ev,
          frequency: f.frequency,
        }));

      const betFraction = raiseAmount / potSize;

      if (betBuckets.length >= 2) {
        // Use PHM to smoothly blend between the two nearest GTO buckets
        const blended = blendBucketsViaPHM(betFraction, betBuckets);

        // Build a synthetic blended freq item representing this custom bet
        const blendedFreqItem: ActionFrequency = {
          action: betFraction >= 1.1 ? 'bet_overbet' : betFraction >= 0.5 ? 'bet_75' : 'bet_33',
          label: `Bet ${Math.round(betFraction * 100)}% Pot (PHM blend)`,
          frequency: blended.frequency,
          ev: blended.ev,
          potFraction: betFraction,
        };
        userFreqItem = blendedFreqItem;
      } else if (betBuckets.length === 1) {
        // Only one bucket — just use it
        userFreqItem = freqs.find(
          f => f.action === 'bet_33' || f.action === 'bet_75' || f.action === 'bet_overbet' || f.action === 'raise' || f.action === 'allin'
        );
      } else {
        // No potFraction hints — fall back to hard threshold mapping
        if (betFraction >= 1.1) {
          userFreqItem =
            freqs.find(f => f.action === 'allin') ||
            freqs.find(f => f.action === 'bet_overbet') ||
            freqs.find(f => f.action === 'bet_75') ||
            freqs.find(f => f.action === 'raise');
        } else if (betFraction >= 0.5) {
          userFreqItem =
            freqs.find(f => f.action === 'bet_75') ||
            freqs.find(f => f.action === 'raise') ||
            freqs.find(f => f.action === 'allin');
        } else {
          userFreqItem =
            freqs.find(f => f.action === 'bet_33') ||
            freqs.find(f => f.action === 'raise');
        }
      }
    } else {
      // Simple / postflop fallback
      userFreqItem = freqs.find(
        f => f.action === 'bet_33' || f.action === 'bet_75' || f.action === 'bet_overbet' || f.action === 'raise' || f.action === 'allin'
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

  // Override label if the user clearly went all-in.
  // PREFLOP: pot is tiny relative to any raise, so pot-fraction is meaningless.
  //   Only flag as all-in if the bet is >= 50x BB (e.g. >=100 BB for 2 BB blinds) — a genuine shove.
  // POSTFLOP: use 1.8x pot as the overbet/shove threshold.
  const isPreflop = strategy.street === 'preflop';
  const safeBigBlind = Number(bigBlind) || 2;
  const safeRaiseAmount = Number(raiseAmount) || 0;
  const safePotSize = Number(potSize) || 0;
  
  const allInThreshold = isPreflop
    ? safeBigBlind * 50
    : safePotSize > 0
      ? safePotSize * 1.8
      : 150;
      
  const isEffectivelyAllIn = (userAction === 'bet' || userAction === 'raise' || String(userAction) === 'allin') &&
    safeRaiseAmount >= allInThreshold;

  const hasExplicitAllInBucket = freqs.some(f => f.action === 'allin');

  // If user went All-In but GTO matrix does not have an explicit All-In line, grade it as a Sizing Overbet
  if (isEffectivelyAllIn && !hasExplicitAllInBucket) {
    userFreqItem = {
      action: 'allin',
      label: `All-In (${raiseAmount} BB)`,
      frequency: 0.0,
      ev: Math.max(-2.5, Number((optimalAction.ev - 2.0).toFixed(1)))
    };
  }

  // Format exact dynamic label using correct context
  const fmtMult = (n: number) => Number.isInteger(n) ? `${n}` : n.toFixed(1);
  let effectiveUserLabel = userFreqItem?.label ?? userAction.toUpperCase();
  if (isEffectivelyAllIn) {
    effectiveUserLabel = `All-In (${raiseAmount} BB)`;
  } else if ((userAction === 'bet' || userAction === 'raise') && raiseAmount > 0) {
    if (strategy.street === 'preflop') {
      // Determine if opening or re-raising
      if (facingBet > bigBlind) {
        // 3-bet / 4-bet: express as multiplier of the raise
        const mult = facingBet > 0 ? raiseAmount / facingBet : 0;
        effectiveUserLabel = `${fmtMult(mult)}x Raise (${raiseAmount} BB)`;
      } else {
        // Open: express as multiplier of the BB
        const mult = bigBlind > 0 ? raiseAmount / bigBlind : 0;
        effectiveUserLabel = `Raise ${fmtMult(mult)}x BB (${raiseAmount} BB)`;
      }
    } else if (potSize && potSize > 0) {
      const pct = Math.round((raiseAmount / potSize) * 100);
      effectiveUserLabel = `Bet ${pct}% Pot (${raiseAmount} BB)`;
    }
  }

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

  // ─────────────────────────────────────────────────────────────────────────
  // GRADING RULES (applied in priority order)
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Rule 0 — Strict Strategy Mode (optional, off by default)
  // Rule A — EV Loss < 0.5 BB → ALWAYS Correct (indifference zone)
  // Rule 1 — High-frequency action (≥ 25%) → Correct
  // Rule 2 — Mixed strategy (5–24%) → Correct unless overused
  // Rule 3 — Low-frequency (< 5%) → grade by EV loss scale

  // Strict Pure Strategy Enforcement Mode Check
  if (isStrictStrategy) {
    const sorted = [...freqs].sort((a, b) => b.frequency - a.frequency);
    const top1 = sorted[0];
    const top2 = sorted[1];

    const isTop1 = userFreqItem.action === top1.action || userFreqItem.label === top1.label;
    // Secondary option is allowed IF AND ONLY IF it is within 10% (0.10) frequency of top1
    const isWithin10PercentOfBest = top2 && (top1.frequency - top2.frequency) <= 0.101;
    const isTop2Split = isWithin10PercentOfBest && (userFreqItem.action === top2.action || userFreqItem.label === top2.label);

    if (!isTop1 && !isTop2Split) {
      const topLabel = isWithin10PercentOfBest ? `${top1.label} / ${top2.label}` : top1.label;
      return {
        userActionLabel: effectiveUserLabel,
        userActionFreq: userFreqItem.frequency,
        userMatchedAction: userFreqItem.action,
        userEv,
        optimalEv,
        evLoss: Math.max(0.5, rawEvLoss),
        grade: rawEvLoss >= 2.0 ? 'Mistake' : 'Inaccuracy',
        colorHex: rawEvLoss >= 2.0 ? '#ef4444' : '#f59e0b',
        badgeBgClass: rawEvLoss >= 2.0 ? 'bg-rose-500/20 border-rose-500/40 text-rose-400' : 'bg-amber-500/20 border-amber-500/40 text-amber-400',
        badgeTextClass: rawEvLoss >= 2.0 ? 'text-rose-400' : 'text-amber-400',
        explanation: `Strict Mode Active: Only actions within 10% of top frequency (${topLabel}) are permitted as Correct. Action ${userFreqItem.label} (${userFreqPercent.toFixed(0)}%) is ${((top1.frequency - userFreqItem.frequency) * 100).toFixed(0)}% lower than best action (${(top1.frequency * 100).toFixed(0)}%).`,
        optimalActionLabel: top1.label
      };
    }
  }

  // Rule A — EV Indifference Zone: any action within 0.5 BB of optimal is Correct.
  // GTO solvers frequently produce mixed strategies where multiple actions are
  // mathematically indifferent (same EV). The research AI explicitly validates:
  // "An action should be graded as Correct without penalty as long as the EV loss
  //  is less than 0.5 Big Blinds, even if the user selected a lower-frequency option."
  if (rawEvLoss < 0.5) {
    return {
      userActionLabel: effectiveUserLabel,
      userActionFreq: userFreqItem.frequency,
      userMatchedAction: userFreqItem.action,
      userEv,
      optimalEv,
      evLoss: 0.0,
      grade: 'Correct',
      colorHex: '#10b981',
      badgeBgClass: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400',
      badgeTextClass: 'text-emerald-400',
      explanation: `Correct play! ${userFreqItem.label} is within the GTO indifference zone (<0.5 BB EV loss). Solvers frequently mix between actions with near-equal EV — this choice is mathematically sound.`,
      optimalActionLabel: optimalAction.label
    };
  }

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
  // Rule 3: Sub-5% or 0% Frequency Lines — EV loss grading scale per PDF
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
      // Inaccuracy: 0.5–2.0 BB loss
      grade = 'Inaccuracy';
      evLoss = Math.max(0.5, rawEvLoss);
      colorHex = '#f59e0b';
      badgeBgClass = 'bg-amber-500/20 border-amber-500/40 text-amber-400';
      badgeTextClass = 'text-amber-400';
      explanation = `Suboptimal line! GTO solver plays ${userFreqItem.label} <=5% of the time (${userFreqPercent.toFixed(0)}% frequency). Recommended action is ${optimalAction.label} (${optimalFreqPercent.toFixed(0)}%).`;
    }

    if (isEffectivelyAllIn && !hasExplicitAllInBucket) {
      explanation = `Extreme Sizing Overbet (All-In ${raiseAmount} BB): GTO solver structure does not support open All-In shoves at this stack depth. Recommended GTO play is ${optimalAction.label} (${optimalFreqPercent.toFixed(0)}% freq). Open-shoving risks stack depth for minimal EV.`;
    }
  }

  return {
    userActionLabel: effectiveUserLabel,
    userActionFreq: userFreqItem.frequency,
    userMatchedAction: userFreqItem.action,
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
